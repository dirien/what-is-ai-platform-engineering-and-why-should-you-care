import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import httpProxy from 'http-proxy';
import * as k8s from '@kubernetes/client-node';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Wrap the HTTP server so non-GET proxy requests bypass Express entirely.
// http-proxy forwards them at the TCP level (no body parsing, no middleware).
// This avoids ERR_ALPN_NEGOTIATION_FAILED issues where express.json() consumed
// the raw body and re-serialization caused subtle protocol problems for POST.
const PROXY_ROUTE_RE = /^\/api\/agents\/([^/]+)\/proxy(\/.*)?/;
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    const m = parsed.pathname.match(PROXY_ROUTE_RE);
    if (m) {
      const agentName = m[1];
      const forwardPath = m[2] || '/';
      const targetHost = `${agentName}.${AGENT_NAMESPACE}.svc.cluster.local`;
      const port = getAgentPort(agentName);
      req.originalUrl = req.url; // preserve for cookie path rewriting
      req.url = forwardPath + parsed.search;
      // Preserve browser Host header for non-opencode agents (origin check)
      proxy.web(req, res, { target: `http://${targetHost}:${port}`, changeOrigin: port === 8080 });
      return;
    }
  }
  app(req, res);
});
const PORT = process.env.PORT || 3001;
const LITELLM_API_BASE = process.env.LITELLM_API_BASE || 'https://litellm-api.up.railway.app';
const LITELLM_PUBLIC_URL = process.env.LITELLM_PUBLIC_URL || LITELLM_API_BASE; // Public URL for code examples
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-litellm-master-key';
const JUPYTERHUB_API_URL = process.env.JUPYTERHUB_API_URL || 'http://proxy-public.jupyterhub.svc.cluster.local';
const JUPYTERHUB_PUBLIC_URL = process.env.JUPYTERHUB_PUBLIC_URL || JUPYTERHUB_API_URL; // Public URL for browser redirects
const JUPYTERHUB_API_TOKEN = process.env.JUPYTERHUB_API_TOKEN || '';

// Agent configuration
const AGENT_NAMESPACE = process.env.AGENT_NAMESPACE || 'default';
const AGENT_IMAGE = process.env.AGENT_IMAGE || 'opencode:latest';
const AGENT_WORKSPACE_STORAGE_CLASS = process.env.AGENT_WORKSPACE_STORAGE_CLASS || 'gp3';
const AGENT_WORKSPACE_SIZE = process.env.AGENT_WORKSPACE_SIZE || '50Gi';
const AGENT_HOME_SUBPATH = process.env.AGENT_HOME_SUBPATH || '.home';
const AGENT_DEFAULT_DIRECTORY = process.env.AGENT_DEFAULT_DIRECTORY || '/workspace';
const SANDBOX_GROUP = 'agents.x-k8s.io';
const SANDBOX_VERSION = 'v1alpha1';
const SANDBOX_PLURAL = 'sandboxes';

// Agent type configurations — each type defines its own image, command, port, etc.
const AGENT_TYPE_CONFIGS = {
  opencode: {
    image: AGENT_IMAGE,
    command: ['/usr/local/bin/entrypoint.sh'],
    port: 8080,
    runAsUser: 0,
    runAsGroup: 0,
    containerName: 'opencode',
    workingDir: '/workspace',
    workspaceDir: '/workspace',
    homeMountPath: '/root',
    buildEnv: () => ({ env: [] }),
  },
  openclaw: {
    image: process.env.OPENCLAW_IMAGE || 'ghcr.io/openclaw/openclaw:latest',
    command: ['node', 'dist/index.js', 'gateway', '--bind=lan', '--port', '18789', '--allow-unconfigured', '--verbose'],
    port: 18789,
    runAsUser: 1000,
    runAsGroup: 1000,
    containerName: 'openclaw',
    // workingDir: null — let the image's WORKDIR apply (dist/index.js is relative to it)
    workingDir: null,
    workspaceDir: '/home/node/.openclaw/workspace',
    homeMountPath: '/home/node',
    // Write ~/.openclaw/openclaw.json config before the main container starts
    initScript: `mkdir -p /home/node/.openclaw && printf '%s' '{"gateway":{"controlUi":{"dangerouslyAllowHostHeaderOriginFallback":true,"allowInsecureAuth":true,"dangerouslyDisableDeviceAuth":true}}}' > /home/node/.openclaw/openclaw.json`,
    buildEnv: () => {
      const token = `sk-oc-${crypto.randomUUID()}`;
      return {
        env: [
          { name: 'OPENCLAW_GATEWAY_TOKEN', value: token },
        ],
        token,
      };
    },
  },
};

// In-memory port cache for proxy lookup (agentName -> port)
const agentPortCache = new Map();

function getAgentPort(agentName) {
  return agentPortCache.get(agentName) || 8080;
}

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
try {
  kc.loadFromCluster();
} catch {
  kc.loadFromDefault();
}
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

// HTTP proxy for sandbox iframe
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });
function rewriteProxyCookie(rawCookie, cookieBase) {
  return rawCookie
    .replace(/;\s*[Pp]ath=[^;]*/g, '')
    .replace(/;\s*[Dd]omain=[^;]*/g, '')
    + `; Path=${cookieBase}`;
}

function getErrorText(err) {
  return String(err?.body?.message || err?.message || '').toLowerCase();
}

function isK8sAlreadyExistsError(err) {
  return err?.statusCode === 409 || err?.body?.reason === 'AlreadyExists' || getErrorText(err).includes('already exists');
}

function isK8sNotFoundError(err) {
  return err?.statusCode === 404 || err?.body?.reason === 'NotFound' || getErrorText(err).includes('not found');
}

function isExpectedDisconnectError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  const message = String(err.message || '').toLowerCase();
  return (
    code === 'UND_ERR_SOCKET' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    message.includes('fetch failed') ||
    message.includes('terminated') ||
    message.includes('aborted') ||
    message.includes('other side closed') ||
    message.includes('premature close')
  );
}

function formatIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeLiteLLMDateParam(rawValue, { endExclusive = false } = {}) {
  if (!rawValue) return null;
  const value = String(rawValue).trim();
  if (!value) return null;

  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(`${value}T00:00:00.000Z`);
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    date = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

  if (endExclusive) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatIsoDateUtc(date);
}

proxy.on('error', (err, req, res) => {
  console.error('http-proxy error:', err.message);
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Cannot reach agent` }));
  }
});
// Rewrite Set-Cookie paths so each agent's cookies are scoped to its proxy path.
// Also inject Alt-Svc: clear to prevent Chrome HSTS/QUIC interference.
proxy.on('proxyRes', (proxyRes, req) => {
  proxyRes.headers['alt-svc'] = 'clear';
  const m = req.originalUrl && req.originalUrl.match(PROXY_ROUTE_RE);
  if (m) {
    const cookieBase = `/api/agents/${m[1]}/proxy`;
    const sc = proxyRes.headers['set-cookie'];
    if (sc) {
      proxyRes.headers['set-cookie'] = Array.isArray(sc)
        ? sc.map(c => rewriteProxyCookie(c, cookieBase))
        : rewriteProxyCookie(sc, cookieBase);
    }
  }
});

app.use(cors());
// Clear Alt-Svc on all Express responses to stop Chrome trying HTTPS/QUIC
app.use((req, res, next) => {
  res.set('Alt-Svc', 'clear');
  next();
});
app.use(express.json());

// Serve static frontend files in production
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// Get configuration (LiteLLM public URL for code examples)
app.get('/api/config', (req, res) => {
  res.json({
    litellmPublicUrl: LITELLM_PUBLIC_URL,
    jupyterhubPublicUrl: JUPYTERHUB_PUBLIC_URL
  });
});

// Get all models
app.get('/api/models', async (req, res) => {
  try {
    const headers = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await axios.get(`${LITELLM_API_BASE}/models`, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get model info with metadata
app.get('/api/model-info', async (req, res) => {
  try {
    const headers = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await axios.get(`${LITELLM_API_BASE}/model/info`, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching model info:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get model group info
app.get('/api/model-group-info', async (req, res) => {
  try {
    const headers = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const { model_group } = req.query;
    const url = model_group
      ? `${LITELLM_API_BASE}/model_group/info?model_group=${model_group}`
      : `${LITELLM_API_BASE}/model_group/info`;

    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching model group info:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get public model hub (only public models)
app.get('/api/public-model-hub', async (req, res) => {
  try {
    const headers = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await axios.get(`${LITELLM_API_BASE}/public/model_hub`, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching public model hub:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Update model pricing in LiteLLM
app.put('/api/models/:modelId/pricing', async (req, res) => {
  try {
    const { inputCostPerToken, outputCostPerToken } = req.body;
    const modelId = req.params.modelId;

    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    // LiteLLM uses /model/update endpoint to update model configuration
    const response = await axios.post(`${LITELLM_API_BASE}/model/update`, {
      model_id: modelId,
      model_info: {
        input_cost_per_token: inputCostPerToken,
        output_cost_per_token: outputCostPerToken
      }
    }, { headers });

    res.json(response.data);
  } catch (error) {
    console.error('Error updating model pricing:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to update model pricing'
    });
  }
});

// API Key Management Endpoints - LiteLLM Integration

// Get all API keys from LiteLLM (list all keys)
app.get('/api/keys', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    // Use the /key/list endpoint with pagination
    const response = await axios.get(`${LITELLM_API_BASE}/key/list`, {
      headers,
      params: {
        page: 1,
        size: 100, // Get up to 100 keys
        return_full_object: true // Get full key details
      }
    });

    // Transform LiteLLM response to our format
    const keys = response.data.keys || [];

    // Log the first key to understand the structure
    if (keys.length > 0) {
      console.log('LiteLLM key/list first key structure:', JSON.stringify(keys[0], null, 2));
    }

    const maskedKeys = keys
      // Filter out keys without a valid identifier (token is the hash used for API operations)
      .filter(key => key.token)
      .map(key => {
        // token is the hash identifier used for LiteLLM API operations (delete, update, info)
        // key is the actual API key (sk-...) but may not always be returned
        const keyToken = key.token;
        const _keyValue = key.key || key.token;

        // Try multiple fields for the key name
        const keyName = key.key_alias ||
                        key.key_name ||
                        key.metadata?.name ||
                        key.metadata?.key_alias ||
                        'Unnamed Key';

        // Mask the key for display in the list view
        const maskedKey = key.key
          ? `${key.key.substring(0, 12)}...${key.key.substring(key.key.length - 4)}`
          : `${keyToken.substring(0, 12)}...`;

        return {
          id: keyToken, // Use token hash for API operations (delete/update/info)
          name: keyName,
          key: maskedKey, // Masked for display in list
          models: key.models || [],
          team_id: key.team_id || null,
          created_at: key.created_at || new Date().toISOString(),
          last_used: key.last_used_at,
          usage_count: key.spend || 0
        };
      });

    res.json({ data: maskedKeys });
  } catch (error) {
    console.error('Error fetching API keys from LiteLLM:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch API keys',
      data: []
    });
  }
});

// Get single API key info from LiteLLM
app.get('/api/keys/:token', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    // The token parameter is the key hash (token) from LiteLLM
    const response = await axios.get(`${LITELLM_API_BASE}/key/info?key=${req.params.token}`, { headers });
    const keyData = response.data;

    console.log('LiteLLM key info response:', JSON.stringify(keyData, null, 2));

    // LiteLLM returns { key: "token_hash", info: { ...actual data... } }
    // The actual key info is nested inside the "info" field
    const info = keyData.info || keyData;

    // Try multiple fields for the key name (from info object)
    const keyName = info.key_alias ||
                    info.key_name ||
                    info.metadata?.name ||
                    info.metadata?.key_alias ||
                    'Unnamed Key';

    // Use the token hash for API operations
    const keyToken = keyData.key || req.params.token;

    // Get last used from spend logs for this key
    let lastUsed = null;
    try {
      const logsResponse = await axios.get(`${LITELLM_API_BASE}/spend/logs`, {
        headers,
        params: { api_key: keyToken, summarize: false }
      });
      const logs = Array.isArray(logsResponse.data) ? logsResponse.data : [];
      if (logs.length > 0) {
        // Find the most recent log entry
        const sortedLogs = logs.sort((a, b) => new Date(b.startTime || b.endTime) - new Date(a.startTime || a.endTime));
        lastUsed = sortedLogs[0].startTime || sortedLogs[0].endTime;
      }
    } catch (e) {
      console.log('Could not fetch logs for last_used:', e.message);
    }

    // Transform to our format
    const transformedKey = {
      id: keyToken, // Token hash for API operations
      name: keyName,
      key: keyToken, // Token hash (actual sk-... key is not returned by /key/info)
      models: info.models || [],
      team_id: info.team_id || null,
      created_at: info.created_at || new Date().toISOString(),
      last_used: lastUsed || info.last_used_at,
      usage_count: info.spend || 0
    };

    res.json(transformedKey);
  } catch (error) {
    console.error('Error fetching API key info:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message
    });
  }
});

// Create new API key in LiteLLM
app.post('/api/keys', async (req, res) => {
  try {
    const { name, models, team_id } = req.body;

    if (!name || !models || models.length === 0) {
      return res.status(400).json({ error: 'Name and models are required' });
    }

    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const requestBody = {
      models: models,
      key_alias: name,
      ...(team_id && { team_id }),
      metadata: {
        created_by: 'litellm-app',
        name: name
      }
    };

    const response = await axios.post(
      `${LITELLM_API_BASE}/key/generate`,
      requestBody,
      { headers }
    );

    const keyData = response.data;

    console.log('LiteLLM key generation response:', JSON.stringify(keyData, null, 2));

    // Transform to our format
    // key: the actual API key starting with sk-...
    // token: the hash identifier used for API operations
    const newKey = {
      id: keyData.token || keyData.key, // Use token for API operations (falls back to key)
      name: name,
      key: keyData.key, // The actual sk-... key from LiteLLM (for display to user)
      models: models,
      created_at: keyData.created_at || new Date().toISOString(),
      last_used: null,
      usage_count: 0
    };

    console.log('Returning new key to frontend:', JSON.stringify({ ...newKey, key: newKey.key?.substring(0, 20) + '...' }, null, 2));

    res.status(201).json(newKey);
  } catch (error) {
    console.error('Error creating API key in LiteLLM:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to create API key'
    });
  }
});

// Update API key in LiteLLM
app.put('/api/keys/:token', async (req, res) => {
  try {
    const { name, models, team_id } = req.body;

    if (!name || !models || models.length === 0) {
      return res.status(400).json({ error: 'Name and models are required' });
    }

    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const requestBody = {
      key: req.params.token,
      models: models,
      key_alias: name,
      ...(team_id !== undefined && { team_id: team_id || null }),
      metadata: {
        name: name
      }
    };

    const response = await axios.post(
      `${LITELLM_API_BASE}/key/update`,
      requestBody,
      { headers }
    );

    const updatedKey = {
      id: req.params.token,
      name: name,
      key: req.params.token,
      models: models,
      team_id: team_id || response.data.team_id || null,
      created_at: response.data.created_at || new Date().toISOString(),
      last_used: response.data.last_used_at,
      usage_count: response.data.spend || 0
    };

    res.json(updatedKey);
  } catch (error) {
    console.error('Error updating API key in LiteLLM:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message
    });
  }
});

// Delete API key from LiteLLM
app.delete('/api/keys/:token', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const requestBody = {
      keys: [req.params.token]
    };

    await axios.post(
      `${LITELLM_API_BASE}/key/delete`,
      requestBody,
      { headers }
    );

    res.json({ message: 'API key deleted successfully', key: { id: req.params.token } });
  } catch (error) {
    console.error('Error deleting API key from LiteLLM:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message
    });
  }
});

// Spend and Usage Endpoints

// Get global spend report
app.get('/api/spend/report', async (req, res) => {
  const headers = {
    'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
    'Content-Type': 'application/json'
  };
  const reportParams = { ...req.query };
  const normalizedStartDate = normalizeLiteLLMDateParam(req.query.start_date);
  const normalizedEndDate = normalizeLiteLLMDateParam(req.query.end_date, { endExclusive: true });
  if (req.query.start_date && !normalizedStartDate) {
    return res.status(400).json({ error: 'Invalid start_date. Use YYYY-MM-DD or ISO datetime.' });
  }
  if (req.query.end_date && !normalizedEndDate) {
    return res.status(400).json({ error: 'Invalid end_date. Use YYYY-MM-DD or ISO datetime.' });
  }
  if (normalizedStartDate) reportParams.start_date = normalizedStartDate;
  if (normalizedEndDate) reportParams.end_date = normalizedEndDate;

  try {
    const response = await axios.get(`${LITELLM_API_BASE}/global/spend/report`, {
      headers,
      params: reportParams
    });

    res.json(response.data);
  } catch (error) {
    // Some LiteLLM versions validate GET query params differently and expect POST body.
    // Fall back to POST with the same parameters for compatibility.
    if (error.response?.status === 400 || error.response?.status === 422) {
      try {
        const postResponse = await axios.post(
          `${LITELLM_API_BASE}/global/spend/report`,
          reportParams,
          { headers }
        );
        return res.json(postResponse.data);
      } catch (postError) {
        console.error('Error fetching spend report (POST fallback):', postError.response?.data || postError.message);
        return res.status(postError.response?.status || 500).json({
          error: postError.response?.data?.error || postError.message || 'Failed to fetch spend report',
          details: postError.response?.data,
        });
      }
    }

    console.error('Error fetching spend report:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch spend report',
      details: error.response?.data,
    });
  }
});

// Get spend logs
app.get('/api/spend/logs', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const { start_date, end_date, api_key } = req.query;
    const params = { summarize: false };
    const normalizedStartDate = normalizeLiteLLMDateParam(start_date);
    const normalizedEndDate = normalizeLiteLLMDateParam(end_date, { endExclusive: true });
    if (start_date && !normalizedStartDate) {
      return res.status(400).json({ error: 'Invalid start_date. Use YYYY-MM-DD or ISO datetime.', data: [] });
    }
    if (end_date && !normalizedEndDate) {
      return res.status(400).json({ error: 'Invalid end_date. Use YYYY-MM-DD or ISO datetime.', data: [] });
    }
    if (normalizedStartDate) params.start_date = normalizedStartDate;
    if (normalizedEndDate) params.end_date = normalizedEndDate;
    if (api_key) params.api_key = api_key;

    const response = await axios.get(`${LITELLM_API_BASE}/spend/logs`, {
      headers,
      params
    });

    let data = response.data;
    if (!Array.isArray(data)) {
      if (data && typeof data === 'object' && Array.isArray(data.logs)) {
        data = data.logs;
      } else if (data && typeof data === 'object' && Array.isArray(data.data)) {
        data = data.data;
      } else {
        return res.json([]);
      }
    }

    // Some LiteLLM versions ignore api_key filtering on /spend/logs.
    // Apply server-side filter as a safety net so UI modals stay consistent.
    if (api_key) {
      const key = String(api_key);
      const keyPrefix = key.substring(0, 16);
      data = data.filter((log) => {
        const logKey = String(log?.api_key || log?.metadata?.user_api_key || '');
        if (!logKey) return false;
        return (
          logKey === key ||
          logKey.includes(keyPrefix) ||
          key.includes(logKey.substring(0, 16))
        );
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching spend logs:', error.response?.data || error.message);
    if (error.response?.status === 404 || error.response?.status === 400) {
      return res.json([]);
    }
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch spend logs',
      data: []
    });
  }
});

// ============================================================================
// Team Management Endpoints
// ============================================================================

// Create a new team
app.post('/api/teams', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${LITELLM_API_BASE}/team/new`, req.body, { headers });
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating team:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to create team'
    });
  }
});

// List all teams
app.get('/api/teams', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${LITELLM_API_BASE}/team/list`, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error listing teams:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to list teams',
      data: []
    });
  }
});

// Get team info
app.get('/api/teams/:id', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${LITELLM_API_BASE}/team/info`, {
      headers,
      params: { team_id: req.params.id }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching team info:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch team info'
    });
  }
});

// Update a team
app.put('/api/teams/:id', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${LITELLM_API_BASE}/team/update`, {
      ...req.body,
      team_id: req.params.id,
    }, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error updating team:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to update team'
    });
  }
});

// Delete a team
app.delete('/api/teams/:id', async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${LITELLM_API_BASE}/team/delete`, {
      team_ids: [req.params.id],
    }, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Error deleting team:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to delete team'
    });
  }
});

// ============================================================================
// Webhook Endpoints
// ============================================================================

// Budget alert webhook receiver
app.post('/api/webhooks/budget', (req, res) => {
  const { event, event_message, spend, max_budget, key_alias, team_id } = req.body;
  console.log(`[BUDGET ALERT] ${event}: ${event_message}`);
  console.log(`  Spend: $${spend}, Budget: $${max_budget}, Key: ${key_alias}, Team: ${team_id}`);
  res.json({ received: true });
});

// ============================================================================
// JupyterHub Notebook Management Endpoints
// ============================================================================

// Helper function for JupyterHub API calls
const jupyterhubHeaders = () => ({
  'Authorization': `token ${JUPYTERHUB_API_TOKEN}`,
  'Content-Type': 'application/json'
});

// Get all notebooks (user servers)
app.get('/api/notebooks', async (req, res) => {
  try {
    // If no JupyterHub token configured, return empty list
    if (!JUPYTERHUB_API_TOKEN) {
      return res.json({
        notebooks: [],
        jupyterhubUrl: JUPYTERHUB_API_URL,
        message: 'JupyterHub not configured'
      });
    }

    const response = await axios.get(`${JUPYTERHUB_API_URL}/hub/api/users`, {
      headers: jupyterhubHeaders()
    });

    // Extract notebook servers from all users
    const notebooks = [];
    for (const user of response.data) {
      // JupyterHub API returns servers as an object keyed by server name
      // Default server has empty string key "", named servers use their name
      if (user.servers && typeof user.servers === 'object') {
        for (const [serverName, server] of Object.entries(user.servers)) {
          // Only include servers that exist (have some data)
          if (server && typeof server === 'object') {
            notebooks.push({
              name: serverName || user.name,
              user: user.name,
              serverName: serverName,  // '' for default, 'my-nb' for named
              url: server.url || `/user/${user.name}/`,
              started: server.started || server.last_activity,
              ready: server.ready === true,
              pending: server.pending || null
            });
          }
        }
      }
    }

    res.json({
      notebooks,
      jupyterhubUrl: JUPYTERHUB_PUBLIC_URL // Use public URL for browser access
    });
  } catch (error) {
    console.error('Error fetching notebooks from JupyterHub:', error.response?.data || error.message);
    // Return 503 if JupyterHub is not available
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'JupyterHub service is not available',
        notebooks: [],
        jupyterhubUrl: JUPYTERHUB_PUBLIC_URL
      });
    }
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message || 'Failed to fetch notebooks',
      notebooks: []
    });
  }
});

// Sanitize notebook name: lowercase, alphanumeric and hyphens only, max 30 chars
const sanitizeNotebookName = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
};

// Create/Start a notebook server (named server)
app.post('/api/notebooks', async (req, res) => {
  try {
    const { profile, name } = req.body;
    const user = 'default';
    const serverName = sanitizeNotebookName(name) || `nb-${Date.now()}`;

    if (!JUPYTERHUB_API_TOKEN) {
      return res.status(503).json({
        error: 'JupyterHub not configured'
      });
    }

    // Profile IDs match JupyterHub profile slugs directly
    // (kubespawner converts display_name "CPU - Standard" to slug "cpu-standard")
    const validProfiles = ['cpu-standard', 'cpu-large', 'gpu-ml-ai'];

    // First, ensure the user exists (create if not)
    try {
      await axios.post(`${JUPYTERHUB_API_URL}/hub/api/users/${user}`, {}, {
        headers: jupyterhubHeaders()
      });
    } catch (err) {
      // User might already exist, that's okay
      if (err.response?.status !== 409) {
        console.log('User creation note:', err.response?.status);
      }
    }

    // Start the server for the user with the selected profile
    const serverOptions = {};
    if (profile && validProfiles.includes(profile)) {
      serverOptions.profile = profile;  // Pass slug directly to JupyterHub
    }

    // Use named server endpoint for multiple concurrent notebooks
    const response = await axios.post(
      `${JUPYTERHUB_API_URL}/hub/api/users/${user}/servers/${serverName}`,
      serverOptions,
      { headers: jupyterhubHeaders() }
    );

    // Named server URL: /user/{user}/{serverName}/lab
    res.status(201).json({
      message: 'Notebook server started',
      user,
      serverName,
      url: `${JUPYTERHUB_PUBLIC_URL}/user/${user}/${serverName}/lab`,
      status: response.status === 201 ? 'starting' : 'started'
    });
  } catch (error) {
    console.error('Error creating notebook:', error.response?.data || error.message);

    // Handle "already running" case
    if (error.response?.status === 400) {
      const serverName = sanitizeNotebookName(req.body.name) || `nb-${Date.now()}`;
      return res.json({
        message: 'Notebook server already running',
        user: 'default',
        serverName,
        url: `${JUPYTERHUB_PUBLIC_URL}/user/default/${serverName}/lab`,
        status: 'running'
      });
    }

    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message || 'Failed to create notebook'
    });
  }
});

// Stop a named notebook server and clean up PVC
app.delete('/api/notebooks/:user/:serverName', async (req, res) => {
  try {
    const { user, serverName } = req.params;

    if (!JUPYTERHUB_API_TOKEN) {
      return res.status(503).json({
        error: 'JupyterHub not configured'
      });
    }

    // Delete with remove: true to remove the named server entry AND trigger
    // KubeSpawner's delete_pvc (default True) to clean up the PVC
    await axios.delete(
      `${JUPYTERHUB_API_URL}/hub/api/users/${user}/servers/${serverName}`,
      {
        headers: jupyterhubHeaders(),
        data: { remove: true }
      }
    );

    res.json({
      message: 'Notebook stopped and storage cleaned up',
      serverName
    });
  } catch (error) {
    console.error('Error stopping notebook:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message || 'Failed to stop notebook'
    });
  }
});

// Fallback: stop by serverName only (treats param as user for legacy default-server notebooks)
app.delete('/api/notebooks/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;

    if (!JUPYTERHUB_API_TOKEN) {
      return res.status(503).json({
        error: 'JupyterHub not configured'
      });
    }

    // Legacy route: serverName is actually the user, stop their default server
    await axios.delete(
      `${JUPYTERHUB_API_URL}/hub/api/users/${serverName}/server`,
      {
        headers: jupyterhubHeaders(),
        data: { remove: true }
      }
    );

    res.json({
      message: 'Notebook server stopped',
      serverName
    });
  } catch (error) {
    console.error('Error stopping notebook:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message || 'Failed to stop notebook'
    });
  }
});

// Get JupyterHub status
app.get('/api/notebooks/status', async (req, res) => {
  try {
    if (!JUPYTERHUB_API_TOKEN) {
      return res.json({
        available: false,
        message: 'JupyterHub not configured'
      });
    }

    const response = await axios.get(`${JUPYTERHUB_API_URL}/hub/api/`, {
      headers: jupyterhubHeaders(),
      timeout: 5000
    });

    res.json({
      available: true,
      version: response.data.version,
      url: JUPYTERHUB_PUBLIC_URL
    });
  } catch (error) {
    res.json({
      available: false,
      error: error.message
    });
  }
});

// ============================================================================
// Agent Management Endpoints
// ============================================================================

// List all agents (Sandbox CRDs)
app.get('/api/agents', async (req, res) => {
  try {
    const response = await customObjectsApi.listNamespacedCustomObject({
      group: SANDBOX_GROUP,
      version: SANDBOX_VERSION,
      namespace: AGENT_NAMESPACE,
      plural: SANDBOX_PLURAL,
    });

    const sandboxes = response.items || [];
    const agents = sandboxes
      .filter(s => s.metadata?.labels?.['agents.maas/managed'] === 'true')
      .map(s => {
        const name = s.metadata.name;
        const port = parseInt(s.metadata.annotations?.['agents.maas/port'], 10) || 8080;
        agentPortCache.set(name, port);
        const flavoursRaw = s.metadata.annotations?.['agents.maas/flavours'] || '';
        return {
          name,
          type: s.metadata.annotations?.['agents.maas/type'] || 'opencode',
          mode: s.metadata.annotations?.['agents.maas/mode'] || 'web',
          gitRepo: s.metadata.annotations?.['agents.maas/git-repo'] || '',
          flavours: flavoursRaw ? flavoursRaw.split(',') : [],
          port,
          status: getSandboxStatus(s),
          createdAt: s.metadata.creationTimestamp,
        };
      });

    res.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error.body?.message || error.message);
    if (error.statusCode === 404 || error.body?.code === 404) {
      return res.json({ agents: [] });
    }
    res.status(error.statusCode || 500).json({
      error: error.body?.message || error.message || 'Failed to list agents',
      agents: []
    });
  }
});

// List available skill flavours (from ConfigMaps labelled agents.maas/flavour=true)
app.get('/api/flavours', async (req, res) => {
  try {
    const response = await coreV1Api.listNamespacedConfigMap({
      namespace: AGENT_NAMESPACE,
      labelSelector: 'agents.maas/flavour=true',
    });
    const items = response.items || [];
    const flavours = [];
    for (const cm of items) {
      try {
        const spec = JSON.parse(cm.data?.spec || '{}');
        const id = (cm.metadata?.name || '').replace(/^flavour-/, '');
        flavours.push({
          id,
          name: spec.name || id,
          description: spec.description || '',
          icon: spec.icon || 'general',
          skills: spec.skills || [],
        });
      } catch {
        // Skip malformed ConfigMaps
        console.warn(`Skipping malformed flavour ConfigMap: ${cm.metadata?.name}`);
      }
    }
    res.json({ flavours });
  } catch (error) {
    console.error('Error listing flavours:', error.body?.message || error.message);
    res.json({ flavours: [] });
  }
});

function getSandboxStatus(sandbox) {
  const conditions = sandbox.status?.conditions || [];
  for (const c of conditions) {
    if (c.type === 'Ready' && c.status === 'True') return 'running';
    if (c.type === 'Ready' && c.status === 'False') return 'pending';
  }
  if (sandbox.status?.phase) return sandbox.status.phase.toLowerCase();
  return 'creating';
}

// Create a new agent (Sandbox CRD)
app.post('/api/agents', async (req, res) => {
  try {
    const { type, name, gitRepo, mode, flavours: selectedFlavours } = req.body;
    const agentType = type || 'opencode';
    const agentMode = mode || 'web';
    const agentName = name || `${agentType}-${Date.now().toString(36)}`;

    const config = AGENT_TYPE_CONFIGS[agentType];
    if (!config) {
      return res.status(400).json({ error: `Unknown agent type: ${agentType}` });
    }

    // Validate name (K8s DNS subdomain)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(agentName)) {
      return res.status(400).json({
        error: 'Invalid name. Use lowercase letters, numbers, and hyphens only.'
      });
    }

    // Resolve selected flavours → collect skills from ConfigMaps
    const resolvedFlavourIds = [];
    let allSkills = [];
    if (Array.isArray(selectedFlavours) && selectedFlavours.length > 0) {
      for (const flavourId of selectedFlavours) {
        try {
          const cmResponse = await coreV1Api.readNamespacedConfigMap({
            name: `flavour-${flavourId}`,
            namespace: AGENT_NAMESPACE,
          });
          const cm = cmResponse;
          const spec = JSON.parse(cm.data?.spec || '{}');
          if (Array.isArray(spec.skills)) {
            allSkills.push(...spec.skills);
          }
          resolvedFlavourIds.push(flavourId);
        } catch {
          console.warn(`Flavour ConfigMap "flavour-${flavourId}" not found, skipping`);
        }
      }
      allSkills = [...new Set(allSkills)];
    }

    // Build type-specific env vars (e.g. openclaw generates a gateway token)
    const typeEnv = config.buildEnv();
    const envVars = [
      // TODO: Re-enable when llm-api-keys secret is provisioned
      // {
      //   name: 'ANTHROPIC_API_KEY',
      //   valueFrom: {
      //     secretKeyRef: {
      //       name: 'llm-api-keys',
      //       key: 'anthropic-key',
      //     },
      //   },
      // },
      ...typeEnv.env,
    ];

    if (gitRepo) {
      envVars.push({ name: 'GIT_REPO', value: gitRepo });
    }

    // Build init-home script: create workspace dir + optional type-specific config.
    // The init container only has /workspace mounted, not the home subPath mount.
    // Remap home paths (e.g. /home/node) to the subPath on the workspace PVC.
    const homeOnWorkspace = `/workspace/${AGENT_HOME_SUBPATH}`;
    const remapHome = (s) => config.homeMountPath !== '/workspace'
      ? s.replace(new RegExp(config.homeMountPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), homeOnWorkspace)
      : s;
    const workspaceDirOnPvc = remapHome(config.workspaceDir);
    let initHomeScript = `mkdir -p "${workspaceDirOnPvc}" && chmod 700 "${workspaceDirOnPvc}"`;
    if (config.initScript) {
      initHomeScript += ` && ${remapHome(config.initScript)}`;
    }

    // Chown workspace dirs to the target user when not running as root
    if (config.runAsUser !== 0) {
      initHomeScript += ` && chown -R ${config.runAsUser}:${config.runAsGroup} "${workspaceDirOnPvc}" "${homeOnWorkspace}"`;
    }

    const initContainers = [{
      name: 'init-home',
      image: config.image,
      command: ['/bin/sh', '-c', initHomeScript],
      // Always run as root so we can mkdir/chown on the fresh PVC
      securityContext: { runAsUser: 0, runAsGroup: 0 },
      resources: {
        requests: { cpu: '50m', memory: '64Mi' },
        limits: { cpu: '1', memory: '2Gi' },
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
      ],
    }];

    if (gitRepo) {
      initContainers.push({
        name: 'clone-repo',
        image: config.image,
      command: [
        '/bin/bash',
        '-lc',
        `set -u
if [ -z "\${GIT_REPO:-}" ]; then
  exit 0
fi
repo_name="$(basename "\${GIT_REPO}")"
repo_name="\${repo_name%.git}"
if [ -z "\${repo_name}" ] || [ "\${repo_name}" = "." ] || [ "\${repo_name}" = "/" ]; then
  repo_name="project"
fi
target_dir="/workspace/\${repo_name}"
if [ ! -d "\${target_dir}/.git" ]; then
  echo "Cloning \${GIT_REPO} into \${target_dir}"
  if ! git clone --depth 1 "\${GIT_REPO}" "\${target_dir}"; then
    echo "WARNING: git clone failed for \${GIT_REPO}" >&2
  fi
else
  echo "Repository already exists at \${target_dir}; skipping clone"
fi
if [ -d "\${target_dir}" ]; then
  printf '%s' "\${target_dir}" > /workspace/.startup-cwd
fi`,
      ],
      env: [{ name: 'GIT_REPO', value: gitRepo }],
      resources: {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '1', memory: '2Gi' },
      },
      volumeMounts: [
        { name: 'workspace', mountPath: '/workspace' },
      ],
      });
    }

    // Add init-skills container when flavours are selected
    if (allSkills.length > 0) {
      // Skills use owner/repo/skill-name format (e.g. wshobson/agents/typescript-advanced-types).
      // The skills CLI expects: npx skills add owner/repo -s skill-name -y -g
      // We read from fd 3 to prevent npx from consuming the skill list via stdin.
      // git is required for cloning skill repos but not included in node:22-alpine.
      const installScript = `#!/bin/sh
set -e
apk add --no-cache git >/dev/null 2>&1
export HOME=/workspace/.home
export PATH="/usr/local/bin:$PATH"
printf '%s\\n' "$SKILLS_LIST" > /tmp/skills.txt
total=0; ok=0; fail=0
while IFS= read -r skill <&3; do
  [ -z "$skill" ] && continue
  total=$((total + 1))
  repo="$(echo "$skill" | cut -d/ -f1-2)"
  skill_name="$(echo "$skill" | cut -d/ -f3-)"
  if [ -z "$skill_name" ]; then
    echo "[$total] Installing: $repo (all skills)"
    if npx -y skills add "$repo" -y -g </dev/null 2>&1; then
      echo "    -> OK"; ok=$((ok + 1))
    else
      echo "    -> FAILED (non-fatal)" >&2; fail=$((fail + 1))
    fi
  else
    echo "[$total] Installing: $repo -s $skill_name"
    if npx -y skills add "$repo" -s "$skill_name" -y -g </dev/null 2>&1; then
      echo "    -> OK"; ok=$((ok + 1))
    else
      echo "    -> FAILED (non-fatal)" >&2; fail=$((fail + 1))
    fi
  fi
done 3< /tmp/skills.txt
echo "=== Done: $ok/$total succeeded, $fail failed ==="`;

      initContainers.push({
        name: 'init-skills',
        image: 'node:22-alpine',
        command: ['/bin/sh', '-c', installScript],
        env: [{ name: 'SKILLS_LIST', value: allSkills.join('\n') }],
        securityContext: { runAsUser: 0, runAsGroup: 0 },
        resources: {
          requests: { cpu: '200m', memory: '256Mi' },
          limits: { cpu: '2', memory: '4Gi' },
        },
        volumeMounts: [
          { name: 'workspace', mountPath: '/workspace' },
        ],
      });
    }

    const sandboxBody = {
      apiVersion: `${SANDBOX_GROUP}/${SANDBOX_VERSION}`,
      kind: 'Sandbox',
      metadata: {
        name: agentName,
        namespace: AGENT_NAMESPACE,
        labels: {
          'agents.maas/managed': 'true',
          'agents.maas/type': agentType,
          sandbox: agentName,
        },
        annotations: {
          'agents.maas/type': agentType,
          'agents.maas/mode': agentMode,
          'agents.maas/git-repo': gitRepo || '',
          'agents.maas/port': String(config.port),
          ...(resolvedFlavourIds.length ? { 'agents.maas/flavours': resolvedFlavourIds.join(',') } : {}),
        },
      },
      spec: {
        podTemplate: {
          metadata: {
            labels: {
              sandbox: agentName,
            },
          },
          spec: {
            runtimeClassName: 'gvisor',
            securityContext: {
              runAsUser: config.runAsUser,
              runAsGroup: config.runAsGroup,
            },
            ...(initContainers.length ? { initContainers } : {}),
            containers: [
              {
                name: config.containerName,
                image: config.image,
                command: config.command,
                ...(config.workingDir ? { workingDir: config.workingDir } : {}),
                ports: [{ containerPort: config.port, protocol: 'TCP' }],
                env: envVars,
                resources: {
                  requests: { cpu: '500m', memory: '1Gi' },
                  limits: { cpu: '2', memory: '4Gi', 'ephemeral-storage': '10Gi' },
                },
                volumeMounts: [
                  { name: 'workspace', mountPath: '/workspace' },
                  { name: 'workspace', mountPath: config.homeMountPath, subPath: AGENT_HOME_SUBPATH },
                ],
              },
            ],
          },
        },
        volumeClaimTemplates: [{
          metadata: {
            name: 'workspace',
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            ...(AGENT_WORKSPACE_STORAGE_CLASS ? { storageClassName: AGENT_WORKSPACE_STORAGE_CLASS } : {}),
            resources: {
              requests: {
                storage: AGENT_WORKSPACE_SIZE,
              },
            },
          },
        }],
      },
    };

    await customObjectsApi.createNamespacedCustomObject({
      group: SANDBOX_GROUP,
      version: SANDBOX_VERSION,
      namespace: AGENT_NAMESPACE,
      plural: SANDBOX_PLURAL,
      body: sandboxBody,
    });

    // Update port cache for proxy routing
    agentPortCache.set(agentName, config.port);

    // Create a headless Service so the proxy can reach the pod via DNS
    // (<agentName>.<namespace>.svc.cluster.local resolves to the pod IP)
    const serviceBody = {
      metadata: {
        name: agentName,
        namespace: AGENT_NAMESPACE,
        labels: {
          'agents.maas/managed': 'true',
          sandbox: agentName,
        },
      },
      spec: {
        clusterIP: 'None',
        selector: { sandbox: agentName },
        ports: [{ port: config.port, targetPort: config.port, protocol: 'TCP' }],
      },
    };

    try {
      await coreV1Api.createNamespacedService({
        namespace: AGENT_NAMESPACE,
        body: serviceBody,
      });
    } catch (serviceError) {
      if (!isK8sAlreadyExistsError(serviceError)) {
        throw serviceError;
      }
      // If the Service already exists for this agent name, reuse it when managed by MaaS.
      const existingResponse = await coreV1Api.readNamespacedService({
        name: agentName,
        namespace: AGENT_NAMESPACE,
      });
      const existing = existingResponse?.body || existingResponse;
      const labels = existing?.metadata?.labels || {};
      const selector = existing?.spec?.selector || {};
      const isManaged = labels['agents.maas/managed'] === 'true';
      const pointsToAgent = selector.sandbox === agentName;
      if (!(isManaged || pointsToAgent)) {
        const conflictErr = new Error(`Service "${agentName}" already exists and is not managed by MaaS`);
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
    }

    const responseBody = {
      name: agentName,
      type: agentType,
      mode: agentMode,
      gitRepo: gitRepo || '',
      flavours: resolvedFlavourIds,
      status: 'creating',
    };
    // Include gateway token in response for openclaw so the frontend can show it
    if (typeEnv.token) {
      responseBody.gatewayToken = typeEnv.token;
    }
    res.status(201).json(responseBody);
  } catch (error) {
    if (isK8sAlreadyExistsError(error)) {
      return res.status(409).json({
        error: `Agent "${req.body?.name || 'unknown'}" already exists`
      });
    }
    console.error('Error creating agent:', error.body?.message || error.message);
    res.status(error.statusCode || 500).json({
      error: error.body?.message || error.message || 'Failed to create agent'
    });
  }
});

// Delete an agent
app.delete('/api/agents/:name', async (req, res) => {
  try {
    let sandboxMissing = false;
    try {
      await customObjectsApi.deleteNamespacedCustomObject({
        group: SANDBOX_GROUP,
        version: SANDBOX_VERSION,
        namespace: AGENT_NAMESPACE,
        plural: SANDBOX_PLURAL,
        name: req.params.name,
      });
    } catch (sandboxError) {
      if (isK8sNotFoundError(sandboxError)) {
        sandboxMissing = true;
      } else {
        throw sandboxError;
      }
    }
    // Clean up the headless Service created alongside the sandbox
    try {
      await coreV1Api.deleteNamespacedService({
        name: req.params.name,
        namespace: AGENT_NAMESPACE,
      });
    } catch (serviceError) {
      if (!isK8sNotFoundError(serviceError)) {
        throw serviceError;
      }
    }
    res.json({
      message: sandboxMissing ? 'Agent already deleted' : 'Agent deleted',
      name: req.params.name
    });
  } catch (error) {
    console.error('Error deleting agent:', error.body?.message || error.message);
    res.status(error.statusCode || 500).json({
      error: error.body?.message || error.message || 'Failed to delete agent'
    });
  }
});

// Script injected into proxied HTML to rewrite fetch/WebSocket/XHR/EventSource
// URLs so the iframe's network requests go through the proxy path.
function buildProxyPatchScript(proxyBase) {
  return `<script>(function(){
var B="${proxyBase}";
var H=location.host;
function r(u){try{var p=new URL(u,location.href);if(p.host===H&&!p.pathname.startsWith(B)){p.pathname=B+p.pathname;return p.toString()}}catch(e){}return u}
var _WS=WebSocket;window.WebSocket=function(u,p){u=r(u);return p!==undefined?new _WS(u,p):new _WS(u)};window.WebSocket.prototype=_WS.prototype;window.WebSocket.CONNECTING=_WS.CONNECTING;window.WebSocket.OPEN=_WS.OPEN;window.WebSocket.CLOSING=_WS.CLOSING;window.WebSocket.CLOSED=_WS.CLOSED;
var _F=fetch;window.fetch=function(i,o){if(typeof i==="string")i=r(i);else if(i instanceof Request){var u=r(i.url);if(u!==i.url)i=new Request(u,i)}return _F.call(this,i,o).then(function(resp){try{if(resp.status===404&&!window.__maasReloading){var fu=typeof i==="string"?i:(i&&i.url)||"";if(fu.indexOf("/session/ses_")>=0){var rk="__maasReloadAt"+B;var last=parseInt(sessionStorage.getItem(rk)||"0",10);if(Date.now()-last>5000){window.__maasReloading=true;sessionStorage.setItem(rk,String(Date.now()));try{var rl=window.__maasRawLS;if(rl){var pf="__maas_ls__"+B+"__",dl=[];for(var x=0;x<localStorage.length;x++){var kk=rl.ky.call(localStorage,x);if(kk&&kk.indexOf(pf)===0)dl.push(kk)}for(var y=0;y<dl.length;y++)rl.ri.call(localStorage,dl[y])}}catch(e){}location.reload()}}}}catch(e){}return resp})};
var _O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string")u=r(u);return _O.apply(this,[m,u].concat([].slice.call(arguments,2)))};
if(window.EventSource){var _E=EventSource;window.EventSource=function(u,c){return new _E(r(u),c)};window.EventSource.prototype=_E.prototype}
if(window.Storage&&window.localStorage&&!window.__maasStoragePatched){window.__maasStoragePatched=true;var P=Storage.prototype;var _gi=P.getItem,_si=P.setItem,_ri=P.removeItem,_cl=P.clear,_ky=P.key;window.__maasRawLS={ri:_ri,ky:_ky};function px(k){return "__maas_ls__"+B+"__"+String(k)}P.getItem=function(k){return this===window.localStorage?_gi.call(this,px(k)):_gi.call(this,k)};P.setItem=function(k,v){return this===window.localStorage?_si.call(this,px(k),v):_si.call(this,k,v)};P.removeItem=function(k){return this===window.localStorage?_ri.call(this,px(k)):_ri.call(this,k)};P.clear=function(){if(this===window.localStorage){var rm=[];for(var i=0;i<this.length;i++){var k=_ky.call(this,i);if(k&&k.indexOf("__maas_ls__"+B+"__")===0)rm.push(k)}for(var j=0;j<rm.length;j++)_ri.call(this,rm[j]);return}return _cl.call(this)};P.key=function(i){if(this===window.localStorage){var ks=[];for(var j=0;j<this.length;j++){var k=_ky.call(this,j);if(k&&k.indexOf("__maas_ls__"+B+"__")===0)ks.push(k.slice(("__maas_ls__"+B+"__").length))}return ks[i]||null}return _ky.call(this,i)}}
var _cd=Object.getOwnPropertyDescriptor(Document.prototype,"cookie")||Object.getOwnPropertyDescriptor(HTMLDocument.prototype,"cookie");if(_cd){Object.defineProperty(document,"cookie",{get:function(){return _cd.get.call(this)},set:function(v){if(!/;\\s*[Pp]ath\\s*=/.test(v))v+="; Path="+B;_cd.set.call(this,v)},configurable:true})}
})();</script>`;
}

// Helper: fetch upstream and rewrite HTML/CSS absolute paths so the iframe
// resolves assets through the proxy instead of the MaaS server root.
// Only handles GET/HEAD — POST/PUT/DELETE bypass Express via http-proxy.
async function proxyWithRewrite(agentName, forwardPath, req, res) {
  const targetHost = `${agentName}.${AGENT_NAMESPACE}.svc.cluster.local`;
  const port = getAgentPort(agentName);
  const targetUrl = `http://${targetHost}:${port}${forwardPath}`;
  const proxyBase = `/api/agents/${agentName}/proxy`;

  try {
    // For non-opencode agents, keep the browser's Host header so origin checks pass.
    const hostHeader = port === 8080 ? targetHost : req.headers.host;
    const fetchOpts = {
      method: req.method,
      headers: { ...req.headers, host: hostHeader },
    };
    delete fetchOpts.headers['content-length'];
    delete fetchOpts.headers['transfer-encoding'];
    delete fetchOpts.headers['connection'];

    const upstream = await fetch(targetUrl, fetchOpts);

    // Stale session ID after pod restart — pass the 404 through as-is.
    // OpenCode's JS handles missing sessions by creating a new one.

    const setCookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie().map(c => rewriteProxyCookie(c, proxyBase))
      : [];
    if (setCookies.length) {
      res.setHeader('set-cookie', setCookies);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const skipHeaders = new Set(['transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);

    if (contentType.includes('text/event-stream')) {
      // SSE — stream through without buffering
      res.status(upstream.status);
      for (const [key, value] of upstream.headers.entries()) {
        if (!skipHeaders.has(key.toLowerCase())) res.set(key, value);
      }
      res.flushHeaders();
      if (!upstream.body) {
        if (!res.writableEnded) res.end();
        return;
      }
      const { Readable } = await import('stream');
      const upstreamStream = Readable.fromWeb(upstream.body);
      upstreamStream.on('error', (streamErr) => {
        if (!isExpectedDisconnectError(streamErr)) {
          console.error(`SSE proxy stream error for agent ${agentName}:`, streamErr.message);
        }
        if (!res.writableEnded) {
          res.end();
        }
      });
      res.on('close', () => {
        if (!upstreamStream.destroyed) {
          upstreamStream.destroy();
        }
      });
      upstreamStream.pipe(res);
    } else if (contentType.includes('text/html')) {
      let html = await upstream.text();
      // Rewrite absolute paths in src="/" and href="/" attributes
      // (but not protocol-relative "//..." or already-proxied "/api/")
      html = html.replace(/(src|href|action)=(["'])\/(?!\/|api\/)/g, `$1=$2${proxyBase}/`);
      // Inject network-patching script and CSS fix at the start of <head>
      // so they run before any other script or style.
      const iframeFit = '<style>html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}*{box-sizing:border-box!important}</style>';
      html = html.replace(/<head([^>]*)>/, `<head$1>${buildProxyPatchScript(proxyBase)}${iframeFit}`);
      res.status(upstream.status).type('html').send(html);
    } else if (contentType.includes('text/css')) {
      let css = await upstream.text();
      // Rewrite absolute url() paths in CSS (fonts, images, etc.)
      css = css.replace(/url\(\s*(['"]?)\/(?!\/|api\/)/g, `url($1${proxyBase}/`);
      res.status(upstream.status).type('css').send(css);
    } else if (contentType.includes('javascript')) {
      let js = await upstream.text();
      // Rewrite absolute /assets/ paths in JS string literals so dynamically
      // created @font-face rules and <link preload> tags resolve through proxy.
      js = js.replace(/"\/assets\//g, `"${proxyBase}/assets/`);
      js = js.replace(/'\/assets\//g, `'${proxyBase}/assets/`);
      // Patch OpenCode yi() path normalizer to handle undefined input
      // (crashes when path.directory is not yet set during session filtering)
      js = js.replace(
        /const yi=e=>\{const t=e\.match\(/g,
        'const yi=e=>{if(!e)return"";const t=e.match('
      );
      res.status(upstream.status).set('content-type', contentType).send(js);
    } else {
      // Non-text (images, fonts, JSON, etc.) — pass through as-is
      res.status(upstream.status);
      for (const [key, value] of upstream.headers.entries()) {
        if (!skipHeaders.has(key.toLowerCase())) res.set(key, value);
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    if (!isExpectedDisconnectError(err)) {
      console.error(`Proxy error for agent ${agentName}:`, err.message);
    }
    if (!res.headersSent) {
      const accept = req.headers['accept'] || '';
      if (accept.includes('text/html') && !accept.includes('application/json')) {
        // Browser page navigation — show auto-retrying page
        res.status(502).type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Agent starting…</title>
<style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Inter,system-ui,sans-serif;background:#faf8f5;color:#3d3d3d}
.c{text-align:center}.sp{width:40px;height:40px;border:3px solid #e5e2dc;border-top-color:#c4704b;border-radius:50%;animation:s .8s linear infinite;margin:0 auto 16px}
@keyframes s{to{transform:rotate(360deg)}}</style>
</head><body><div class="c"><div class="sp"></div><p>Agent <b>${agentName}</b> is starting&hellip;</p><p style="font-size:13px;color:#888">Retrying automatically</p></div>
<script>setTimeout(()=>location.reload(),3000)</script></body></html>`);
      } else {
        // API call (fetch/XHR/SSE) — return proper JSON error
        res.status(502).json({ error: `Cannot reach agent: ${agentName}` });
      }
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

function getProxyForwardPath(req) {
  const parsed = new URL(req.originalUrl || req.url, `http://${req.headers.host}`);
  const m = parsed.pathname.match(PROXY_ROUTE_RE);
  const basePath = m?.[2] || '/';
  const defaultDir = AGENT_DEFAULT_DIRECTORY;
  // OpenCode treats some empty query params as undefined and returns 400.
  // Normalize to safe defaults for iframe navigation stability.
  if (basePath === '/file' && !parsed.searchParams.get('path')) {
    parsed.searchParams.set('path', defaultDir);
  }
  if (basePath === '/find/file' && !parsed.searchParams.get('query')) {
    parsed.searchParams.set('query', '.');
  }
  if (basePath === '/find/file' && !parsed.searchParams.get('directory')) {
    parsed.searchParams.set('directory', defaultDir);
  }
  if (basePath.startsWith('/session/') && !parsed.searchParams.get('directory')) {
    parsed.searchParams.set('directory', defaultDir);
  }
  if (basePath === '/session' && !parsed.searchParams.get('directory')) {
    parsed.searchParams.set('directory', defaultDir);
  }
  const search = parsed.searchParams.toString();
  return `${basePath}${search ? `?${search}` : ''}`;
}

// Proxy GET/HEAD requests to a sandbox pod (for iframe web mode).
// POST/PUT/DELETE are handled by http-proxy at the server level before Express.
app.get('/api/agents/:name/proxy/{*proxyPath}', (req, res) => {
  const forwardPath = getProxyForwardPath(req);
  proxyWithRewrite(req.params.name, forwardPath, req, res);
});

app.get('/api/agents/:name/proxy', (req, res) => {
  const forwardPath = getProxyForwardPath(req);
  proxyWithRewrite(req.params.name, forwardPath, req, res);
});

// ============================================================================
// WebSocket Handling (Terminal + Proxy)
// ============================================================================

// WebSocket upgrade handler on the HTTP server
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const terminalMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/terminal$/);
  const proxyMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/proxy(\/.*)?$/);

  if (terminalMatch) {
    // xterm.js terminal WebSocket
    const agentName = terminalMatch[1];
    handleTerminalUpgrade(req, socket, head, agentName);
  } else if (proxyMatch) {
    // WebSocket proxy for agent web UI
    const agentName = proxyMatch[1];
    const targetPath = (proxyMatch[2] || '/') + url.search;
    const targetHost = `${agentName}.${AGENT_NAMESPACE}.svc.cluster.local`;
    const port = getAgentPort(agentName);
    const targetUrl = `http://${targetHost}:${port}`;
    req.url = targetPath;
    // Non-opencode agents (e.g. openclaw) need the browser's original Host header
    // so dangerouslyAllowHostHeaderOriginFallback origin checks pass.
    const changeOrigin = port === 8080;
    proxy.ws(req, socket, head, { target: targetUrl, changeOrigin }, (err) => {
      console.error(`WS proxy error for agent ${agentName}:`, err.message);
      socket.destroy();
    });
  } else {
    // Not our WebSocket, let it pass through (or destroy)
    socket.destroy();
  }
});

// Terminal WebSocket server (noServer mode)
const terminalWss = new WebSocketServer({ noServer: true });

async function handleTerminalUpgrade(req, socket, head, agentName) {
  terminalWss.handleUpgrade(req, socket, head, (ws) => {
    handleTerminalConnection(ws, agentName);
  });
}

async function handleTerminalConnection(ws, agentName) {
  try {
    // Find the pod for this sandbox
    const pods = await coreV1Api.listNamespacedPod({
      namespace: AGENT_NAMESPACE,
      labelSelector: `sandbox=${agentName}`,
    });

    const pod = pods.items.find(p => p.status?.phase === 'Running');
    if (!pod) {
      ws.send('\r\n\x1b[31mError: Agent pod is not running yet. Please wait...\x1b[0m\r\n');
      ws.close();
      return;
    }

    const podName = pod.metadata.name;

    // Use K8s exec API to start a shell
    const exec = new k8s.Exec(kc);
    const { PassThrough } = await import('stream');
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const execConn = await exec.exec(
      AGENT_NAMESPACE,
      podName,
      'opencode',
      [
        '/bin/bash',
        '-lc',
        'STARTUP_CWD="$(cat /workspace/.startup-cwd 2>/dev/null || true)"; if [ -n "$STARTUP_CWD" ] && [ -d "$STARTUP_CWD" ]; then cd "$STARTUP_CWD"; else cd /workspace; fi; exec opencode',
      ],
      stdout,
      stderr,
      stdin,
      true // tty
    );

    // Pipe stdout/stderr to browser WebSocket
    stdout.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    stderr.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle browser -> pod
    ws.on('message', (data) => {
      const msg = data.toString();
      // Check if it's a resize message
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          // Send resize to K8s exec via channel 4
          if (execConn && execConn.readyState === WebSocket.OPEN) {
            const resizeMsg = JSON.stringify({ Width: parsed.cols, Height: parsed.rows });
            const buf = Buffer.alloc(resizeMsg.length + 1);
            buf.writeUInt8(4, 0); // Channel 4 = resize
            buf.write(resizeMsg, 1);
            execConn.send(buf);
          }
          return;
        }
      } catch {
        // Not JSON, treat as terminal input
      }
      stdin.write(data);
    });

    ws.on('close', () => {
      stdin.end();
      if (execConn && execConn.readyState === WebSocket.OPEN) {
        execConn.close();
      }
    });

    ws.on('error', (err) => {
      console.error('Terminal WebSocket error:', err.message);
      stdin.end();
    });

    // Handle K8s exec connection close
    if (execConn) {
      execConn.on('close', () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('\r\n\x1b[33mSession ended.\x1b[0m\r\n');
          ws.close();
        }
      });
    }
  } catch (error) {
    console.error('Terminal exec error:', error.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
      ws.close();
    }
  }
}

// Catch-all route - serve index.html for client-side routing (must be after all API routes)
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`LiteLLM API Base: ${LITELLM_API_BASE}`);
  console.log(`Agent Namespace: ${AGENT_NAMESPACE}`);
  console.log(`Serving frontend from: ${frontendDistPath}`);
});
