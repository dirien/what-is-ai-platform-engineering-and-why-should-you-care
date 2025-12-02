import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const LITELLM_API_BASE = process.env.LITELLM_API_BASE || 'https://litellm-api.up.railway.app';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-litellm-master-key';
const JUPYTERHUB_API_URL = process.env.JUPYTERHUB_API_URL || 'http://proxy-public.jupyterhub.svc.cluster.local';
const JUPYTERHUB_PUBLIC_URL = process.env.JUPYTERHUB_PUBLIC_URL || JUPYTERHUB_API_URL; // Public URL for browser redirects
const JUPYTERHUB_API_TOKEN = process.env.JUPYTERHUB_API_TOKEN || '';

app.use(cors());
app.use(express.json());

// Serve static frontend files in production
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
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
    const maskedKeys = keys.map(key => {
      // Try multiple fields for the key name
      const keyName = key.key_alias ||
                      key.key_name ||
                      key.metadata?.name ||
                      key.metadata?.key_alias ||
                      (key.key ? key.key.substring(0, 20) : 'Unnamed Key');

      // Use the actual key as the ID (needed for API operations like delete/update/info)
      // Mask the key for display in the list view
      const maskedKey = key.key ? `${key.key.substring(0, 12)}...${key.key.substring(key.key.length - 4)}` : 'sk-...****';

      return {
        id: key.key, // Full key value needed for API operations
        name: keyName,
        key: maskedKey, // Masked for display in list
        models: key.models || [],
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

    const response = await axios.get(`${LITELLM_API_BASE}/key/info?key=${req.params.token}`, { headers });
    const keyData = response.data;

    console.log('LiteLLM key info response:', JSON.stringify(keyData, null, 2));

    // Try multiple fields for the key name
    const keyName = keyData.key_alias ||
                    keyData.key_name ||
                    keyData.metadata?.name ||
                    keyData.metadata?.key_alias ||
                    (keyData.key ? keyData.key.substring(0, 20) : 'Unnamed Key');

    // Transform to our format
    // Return the full key value for detail view
    const transformedKey = {
      id: keyData.key, // Full key value needed for API operations
      name: keyName,
      key: keyData.key, // Full key value for detail view
      models: keyData.models || [],
      created_at: keyData.created_at || new Date().toISOString(),
      last_used: keyData.last_used_at,
      usage_count: keyData.spend || 0
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
    const { name, models } = req.body;

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
    const newKey = {
      id: keyData.key, // Full key value needed for API operations
      name: name,
      key: keyData.key, // The actual sk-... key from LiteLLM
      models: models,
      created_at: keyData.created_at || new Date().toISOString(),
      last_used: null,
      usage_count: 0
    };

    console.log('Returning new key to frontend:', JSON.stringify({ ...newKey, key: newKey.key.substring(0, 20) + '...' }, null, 2));

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
    const { name, models } = req.body;

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
      id: req.params.token, // The actual key value
      name: name,
      key: req.params.token, // The actual key value
      models: models,
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
  try {
    const headers = {
      'Authorization': `Bearer ${LITELLM_MASTER_KEY}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.get(`${LITELLM_API_BASE}/global/spend/report`, {
      headers,
      params: req.query // Forward query params like start_date, end_date, group_by, etc.
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching spend report:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch spend report'
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

    const response = await axios.get(`${LITELLM_API_BASE}/spend/logs`, {
      headers,
      params: req.query // Forward query params like api_key, start_date, end_date, etc.
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching spend logs:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch spend logs'
    });
  }
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
      // Default server
      if (user.server) {
        notebooks.push({
          name: user.name,
          user: user.name,
          url: user.server,
          started: user.last_activity,
          ready: true,
          pending: null
        });
      }
      // Named servers (skip empty-string key as it's the same as user.server)
      if (user.servers) {
        for (const [serverName, server] of Object.entries(user.servers)) {
          // Skip the default server (empty string) - already added above via user.server
          if (serverName === '') continue;
          notebooks.push({
            name: serverName || user.name,
            user: user.name,
            url: server.url,
            started: server.started,
            ready: server.ready,
            pending: server.pending
          });
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

// Create/Start a notebook server
app.post('/api/notebooks', async (req, res) => {
  try {
    const { profile, username } = req.body;
    const user = username || 'default';

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

    const response = await axios.post(
      `${JUPYTERHUB_API_URL}/hub/api/users/${user}/server`,
      serverOptions,
      { headers: jupyterhubHeaders() }
    );

    // Return the URL to access the notebook (use public URL for browser)
    res.status(201).json({
      message: 'Notebook server started',
      user: user,
      url: `${JUPYTERHUB_PUBLIC_URL}/user/${user}/lab`,
      status: response.status === 201 ? 'starting' : 'started'
    });
  } catch (error) {
    console.error('Error creating notebook:', error.response?.data || error.message);

    // Handle "already running" case
    if (error.response?.status === 400) {
      const user = req.body.username || 'default';
      return res.json({
        message: 'Notebook server already running',
        user: user,
        url: `${JUPYTERHUB_PUBLIC_URL}/user/${user}/lab`,
        status: 'running'
      });
    }

    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message || 'Failed to create notebook'
    });
  }
});

// Stop a notebook server
app.delete('/api/notebooks/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;

    if (!JUPYTERHUB_API_TOKEN) {
      return res.status(503).json({
        error: 'JupyterHub not configured'
      });
    }

    // Stop the user's server
    await axios.delete(
      `${JUPYTERHUB_API_URL}/hub/api/users/${serverName}/server`,
      { headers: jupyterhubHeaders() }
    );

    res.json({
      message: 'Notebook server stopped',
      serverName: serverName
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

// Catch-all route - serve index.html for client-side routing (must be after all API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`LiteLLM API Base: ${LITELLM_API_BASE}`);
  console.log(`Serving frontend from: ${frontendDistPath}`);
});
