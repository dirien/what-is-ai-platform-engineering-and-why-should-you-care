# Adding AWS Bedrock Models to LiteLLM, Creating Teams, and Testing

This guide walks through the complete workflow for adding AWS Bedrock models (e.g., Claude Sonnet, Claude Opus) to a LiteLLM gateway running on EKS, setting up team-based access control with budgets, and testing the models through the unified OpenAI-compatible API.

## Prerequisites

- LiteLLM proxy running on EKS (deployed via the `MaaSComponent` in `01-maas/infra/`)
- LiteLLM master key (stored in Pulumi config as `litellmMasterKey`)
- AWS Bedrock model access enabled in the AWS Console for the target region
- EKS Pod Identity configured for the LiteLLM service account (see [Infrastructure Setup](#1-infrastructure-setup))

Get the LiteLLM URL and master key:

```bash
cd 01-maas/infra
LITELLM_URL=$(pulumi stack output litellmPublicUrl)
LITELLM_KEY=$(pulumi config get litellmMasterKey)

# Quick health check
curl -s "$LITELLM_URL/health" | python3 -m json.tool
```

---

## 1. Infrastructure Setup

Before LiteLLM can call Bedrock, the EKS pods need AWS credentials. The platform uses **EKS Pod Identity** (no static keys required).

### IAM Role (managed by Pulumi)

The `MaaSComponent` automatically creates:

1. An IAM role (`<namespace>-litellm-bedrock`) with a trust policy for `pods.eks.amazonaws.com`
2. A policy allowing `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on Anthropic foundation models and inference profiles
3. A Pod Identity Association binding the role to the `litellm` service account in the `maas` namespace

```typescript
// From infra/src/components/maasComponent.ts (simplified)
const bedrockRole = new aws.iam.Role(`${name}-bedrock-role`, {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: { Service: "pods.eks.amazonaws.com" },
            Action: ["sts:AssumeRole", "sts:TagSession"],
        }],
    }),
});

new aws.iam.RolePolicy(`${name}-bedrock-policy`, {
    role: bedrockRole.name,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
            ],
            Resource: [
                "arn:aws:bedrock:*::foundation-model/anthropic.*",
                "arn:aws:bedrock:*:*:inference-profile/*anthropic*",
            ],
        }],
    }),
});

new aws.eks.PodIdentityAssociation(`${name}-bedrock-pod-identity`, {
    clusterName: args.clusterName,
    namespace: namespaceName,
    serviceAccount: "litellm",
    roleArn: bedrockRole.arn,
});
```

The Helm chart also sets `AWS_REGION_NAME` as an environment variable on the LiteLLM pods:

```typescript
envVars: {
    AWS_REGION_NAME: args.awsRegion || "us-east-1",
},
```

### Enable Model Access in AWS Console

Before LiteLLM can call a Bedrock model, you must enable it in the AWS Console:

1. Go to **Amazon Bedrock** > **Model access** in the target region (e.g., `us-east-1`)
2. Click **Manage model access**
3. Enable the models you need (e.g., `Anthropic Claude Sonnet 4.6`, `Anthropic Claude Opus 4.6`)
4. Wait for the status to show **Access granted** (can take 1-2 minutes)

> **Note:** If you skip this step, LiteLLM returns: `Model access is denied due to IAM user or service role is not authorized to perform the required AWS Marketplace actions`.

---

## 2. Add Bedrock Models to LiteLLM

Use the LiteLLM `/model/new` API to register each Bedrock model. The key fields are:

- `model`: Use the `bedrock/<model-id>` format. For cross-region inference profiles, use `bedrock/us.anthropic.<model>`.
- `aws_region_name`: The AWS region where Bedrock is enabled.
- `max_tokens`: Maximum output tokens the model supports.
- Cost fields: `input_cost_per_token` and `output_cost_per_token` for chargeback tracking.

### Add Claude Sonnet 4.6

```bash
curl -X POST "$LITELLM_URL/model/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "claude-sonnet-4-6",
    "litellm_params": {
      "model": "bedrock/us.anthropic.claude-sonnet-4-6",
      "aws_region_name": "us-east-1",
      "max_tokens": 16384
    },
    "model_info": {
      "id": "claude-sonnet-4-6",
      "mode": "chat",
      "input_cost_per_token": 0.0000033,
      "output_cost_per_token": 0.0000165,
      "max_tokens": 200000,
      "max_input_tokens": 200000,
      "max_output_tokens": 16384,
      "base_model": "anthropic.claude-sonnet-4-6",
      "description": "Claude Sonnet 4.6 via AWS Bedrock (US inference profile)"
    }
  }'
```

### Add Claude Opus 4.6

```bash
curl -X POST "$LITELLM_URL/model/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "claude-opus-4-6",
    "litellm_params": {
      "model": "bedrock/us.anthropic.claude-opus-4-6-v1",
      "aws_region_name": "us-east-1",
      "max_tokens": 16384
    },
    "model_info": {
      "id": "claude-opus-4-6",
      "mode": "chat",
      "input_cost_per_token": 0.0000055,
      "output_cost_per_token": 0.0000275,
      "max_tokens": 200000,
      "max_input_tokens": 200000,
      "max_output_tokens": 16384,
      "base_model": "anthropic.claude-opus-4-6-v1",
      "description": "Claude Opus 4.6 via AWS Bedrock (US inference profile)"
    }
  }'
```

### Publish Models to Public Hub

Make models visible in the MaaS frontend model catalog:

```bash
# List models to find their IDs
curl -s "$LITELLM_URL/model/info" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "import sys,json; [print(m['model_name']) for m in json.load(sys.stdin).get('data',[])]"
```

### Verify Models

```bash
curl -s "$LITELLM_URL/model/info" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "
import sys,json
for m in json.load(sys.stdin).get('data',[]):
    p = m.get('litellm_params',{})
    print(f\"{m['model_name']:30s} provider={p.get('model','')}  region={p.get('aws_region_name','-')}\")"
```

Expected output:

```
qwen2.5-7b-instruct            provider=openai/Qwen/Qwen2.5-7B-Instruct  region=-
qwen3-8b                        provider=openai/Qwen/Qwen3-8B             region=-
claude-opus-4-6                  provider=bedrock/us.anthropic.claude-opus-4-6-v1  region=us-east-1
claude-sonnet-4-6                provider=bedrock/us.anthropic.claude-sonnet-4-6   region=us-east-1
```

---

## 3. Create Teams with Budgets

Teams let you group API keys, enforce budget limits, and restrict which models each team can access.

### Create an ML Research team

Higher budget, access to the most capable (and expensive) Bedrock model:

```bash
curl -X POST "$LITELLM_URL/team/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_alias": "ML Research",
    "max_budget": 500,
    "budget_duration": "1mo",
    "models": [
      "qwen2.5-7b-instruct",
      "qwen3-8b",
      "claude-opus-4-6",
      "claude-sonnet-4-6"
    ]
  }'
```

### Create a Platform Engineering team

Lower budget, cost-efficient Bedrock model only:

```bash
curl -X POST "$LITELLM_URL/team/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_alias": "Platform Engineering",
    "max_budget": 150,
    "budget_duration": "1mo",
    "models": [
      "qwen2.5-7b-instruct",
      "qwen3-8b",
      "claude-sonnet-4-6"
    ]
  }'
```

### Verify Teams

```bash
curl -s "$LITELLM_URL/team/list" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    print(f\"{t['team_alias']:25s}  id={t['team_id']}  budget=\${t.get('max_budget',0):.0f}/{t.get('budget_duration','?')}  models={t.get('models',[])}\")"
```

> **Budget parameters:**
> - `max_budget`: Maximum spend in USD before the key is blocked
> - `budget_duration`: Reset period — `1mo` (monthly), `1d` (daily), `7d` (weekly), or omit for lifetime budget
> - LiteLLM auto-resets `spend` to 0 at the start of each period

---

## 4. Generate API Keys for Each Team

API keys are scoped to a team and can be further restricted to specific models.

### Key for ML Research

```bash
# Save the team_id from the team creation response, or look it up:
ML_TEAM_ID=$(curl -s "$LITELLM_URL/team/list" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "import sys,json; [print(t['team_id']) for t in json.load(sys.stdin) if t.get('team_alias')=='ML Research']")

curl -s -X POST "$LITELLM_URL/key/generate" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"key_alias\": \"ml-research-prod\",
    \"team_id\": \"$ML_TEAM_ID\",
    \"models\": [\"qwen2.5-7b-instruct\", \"qwen3-8b\", \"claude-opus-4-6\"],
    \"metadata\": {\"created_by\": \"admin\", \"name\": \"ml-research-prod\"}
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Key: {d['key']}\nTeam: {d['team_id']}\")"
```

### Key for Platform Engineering

```bash
PE_TEAM_ID=$(curl -s "$LITELLM_URL/team/list" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "import sys,json; [print(t['team_id']) for t in json.load(sys.stdin) if t.get('team_alias')=='Platform Engineering']")

curl -s -X POST "$LITELLM_URL/key/generate" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"key_alias\": \"platform-eng-prod\",
    \"team_id\": \"$PE_TEAM_ID\",
    \"models\": [\"qwen2.5-7b-instruct\", \"qwen3-8b\", \"claude-sonnet-4-6\"],
    \"metadata\": {\"created_by\": \"admin\", \"name\": \"platform-eng-prod\"}
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Key: {d['key']}\nTeam: {d['team_id']}\")"
```

> **Important:** Save the `key` value from the response. It is only shown once (the `sk-...` token). Subsequent API calls use this key for authentication.

---

## 5. Test Models via the LiteLLM Gateway

All models are exposed through a single OpenAI-compatible endpoint at `$LITELLM_URL/chat/completions`. Switch between models by changing the `model` field.

### Set up your keys

```bash
export LITELLM_URL="http://<your-litellm-nlb>:4000"
export ML_KEY="sk-..."       # ML Research key from step 4
export PE_KEY="sk-..."       # Platform Engineering key from step 4
```

### Test 1: ML Research — Claude Opus (Bedrock)

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ML_KEY" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [
      {"role": "user", "content": "Explain multi-head attention in transformers. What problem does it solve compared to single-head attention?"}
    ],
    "max_tokens": 300
  }'
```

### Test 2: ML Research — Claude Opus follow-up (multi-turn)

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ML_KEY" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [
      {"role": "user", "content": "Explain multi-head attention in transformers."},
      {"role": "assistant", "content": "Multi-head attention runs multiple attention computations in parallel, each learning different relationship patterns."},
      {"role": "user", "content": "Can I prune redundant attention heads after training to reduce inference cost? What techniques exist?"}
    ],
    "max_tokens": 250
  }'
```

### Test 3: ML Research — Qwen3-8B (self-hosted OSS)

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ML_KEY" \
  -d '{
    "model": "qwen3-8b",
    "messages": [
      {"role": "user", "content": "Compare BLEU, pass@k, and HumanEval for evaluating LLM code generation. Which should I use?"}
    ],
    "max_tokens": 300
  }'
```

### Test 4: ML Research — Qwen2.5-7B follow-up

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ML_KEY" \
  -d '{
    "model": "qwen2.5-7b-instruct",
    "messages": [
      {"role": "user", "content": "Compare BLEU and pass@k for code generation evaluation."},
      {"role": "assistant", "content": "BLEU measures n-gram overlap which is poor for code. pass@k measures functional correctness by running generated code against test cases."},
      {"role": "user", "content": "How many samples k do I need for a reliable pass@k estimate? What is the variance like with k=1 vs k=10 vs k=100?"}
    ],
    "max_tokens": 250
  }'
```

### Test 5: Platform Engineering — Claude Sonnet (Bedrock)

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PE_KEY" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [
      {"role": "user", "content": "Write a Terraform module for an S3 bucket with versioning, encryption, and Glacier lifecycle after 90 days."}
    ],
    "max_tokens": 400
  }'
```

### Test 6: Platform Engineering — Claude Sonnet follow-up

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PE_KEY" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [
      {"role": "user", "content": "Write a Terraform S3 module with versioning, encryption, and Glacier lifecycle."},
      {"role": "assistant", "content": "Here is a module with aws_s3_bucket, aws_s3_bucket_versioning, aws_s3_bucket_server_side_encryption_configuration, and aws_s3_bucket_lifecycle_configuration resources."},
      {"role": "user", "content": "Now add cross-region replication to us-west-2 for disaster recovery. What IAM role does it need?"}
    ],
    "max_tokens": 350
  }'
```

### Test 7: Platform Engineering — Qwen3-8B (self-hosted OSS)

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PE_KEY" \
  -d '{
    "model": "qwen3-8b",
    "messages": [
      {"role": "user", "content": "How do I configure a Kubernetes HPA to scale based on custom Prometheus metrics? Give a YAML example."}
    ],
    "max_tokens": 350
  }'
```

### Test 8: Platform Engineering — Qwen2.5-7B follow-up

```bash
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PE_KEY" \
  -d '{
    "model": "qwen2.5-7b-instruct",
    "messages": [
      {"role": "user", "content": "How do I configure K8s HPA with custom Prometheus metrics?"},
      {"role": "assistant", "content": "You need prometheus-adapter to expose custom metrics via the custom.metrics.k8s.io API, then reference them in the HPA spec."},
      {"role": "user", "content": "When should I use KEDA instead of HPA with prometheus-adapter? What are the tradeoffs?"}
    ],
    "max_tokens": 300
  }'
```

### Verify: Access control works

The Platform Engineering key should **not** be able to use `claude-opus-4-6`:

```bash
# This should return a 403 error
curl -s "$LITELLM_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PE_KEY" \
  -d '{
    "model": "claude-opus-4-6",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

Expected error: `"This is an enterprise feature..."` or a model access denied response because `claude-opus-4-6` is not in the Platform Engineering team's allowed models.

---

## 6. Using the Python OpenAI SDK

The LiteLLM gateway is fully OpenAI-compatible, so any OpenAI SDK works:

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-...",  # Your team API key
    base_url="http://<your-litellm-nlb>:4000"
)

# Use a Bedrock model
response = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[
        {"role": "user", "content": "Explain Kubernetes network policies in 3 sentences."}
    ],
    max_tokens=200
)
print(response.choices[0].message.content)

# Switch to a self-hosted model — same API, same key
response = client.chat.completions.create(
    model="qwen2.5-7b-instruct",
    messages=[
        {"role": "user", "content": "Explain Kubernetes network policies in 3 sentences."}
    ],
    max_tokens=200
)
print(response.choices[0].message.content)
```

---

## 7. Monitor Spend and Budget Utilization

### Check team spend

```bash
curl -s "$LITELLM_URL/team/list" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "
import sys,json
for t in json.load(sys.stdin):
    spend = t.get('spend', 0)
    budget = t.get('max_budget', 0)
    pct = (spend / budget * 100) if budget else 0
    print(f\"{t['team_alias']:25s}  \${spend:.4f} / \${budget:.0f}  ({pct:.1f}%)  resets={t.get('budget_reset_at','N/A')}\")"
```

### Check key-level spend

```bash
curl -s "$LITELLM_URL/key/list?page=1&size=100&return_full_object=true" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -c "
import sys,json
for k in json.load(sys.stdin).get('keys',[]):
    alias = k.get('key_alias','')
    if alias:
        print(f\"{alias:25s}  spend=\${k.get('spend',0):.4f}  team={k.get('team_id','none')[:12]}...\")"
```

### Spend report by team (aggregated)

```bash
START=$(date -v-30d +%Y-%m-%d)  # macOS; use date -d '-30 days' on Linux
END=$(date +%Y-%m-%d)

curl -s "$LITELLM_URL/global/spend/report?start_date=$START&end_date=$END&group_by=team" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  | python3 -m json.tool
```

### MaaS Dashboard

The MaaS frontend provides visual dashboards:

- **Teams** page: Read-only view with budget utilization bars (green <70%, yellow 70-90%, red >90%)
- **FinOps Dashboard**: Team Budget Utilization section with spend vs. budget progress bars
- **API Keys** page: Shows which team each key belongs to

---

## Quick Reference

| Task | Endpoint | Method |
|------|----------|--------|
| Add model | `/model/new` | POST |
| List models | `/model/info` | GET |
| Delete model | `/model/delete` | POST |
| Create team | `/team/new` | POST |
| List teams | `/team/list` | GET |
| Update team | `/team/update` | POST |
| Delete team | `/team/delete` | POST |
| Generate key | `/key/generate` | POST |
| List keys | `/key/list` | GET |
| Update key | `/key/update` | POST |
| Delete key | `/key/delete` | POST |
| Chat completion | `/chat/completions` | POST |
| Spend report | `/global/spend/report` | GET |

All endpoints require `Authorization: Bearer $LITELLM_KEY` (master key for admin operations, team key for chat completions).

---

## 8. Image Generation with Amazon Nova Canvas

Amazon Nova Canvas (`amazon.nova-canvas-v1:0`) is a text-to-image model available through AWS Bedrock. LiteLLM exposes it through the standard OpenAI `/v1/images/generations` endpoint.

### Prerequisites

1. Enable **Amazon Nova Canvas** in the AWS Bedrock console (Model Access) for your region
2. The existing Pod Identity role needs Bedrock `InvokeModel` permission on Nova Canvas (already covered by the `anthropic.*` wildcard — if you use a stricter policy, add `arn:aws:bedrock:*::foundation-model/amazon.nova-canvas*`)

### Register Nova Canvas in LiteLLM

```bash
curl -X POST "$LITELLM_URL/model/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "amazon-nova-canvas",
    "litellm_params": {
      "model": "bedrock/amazon.nova-canvas-v1:0",
      "aws_region_name": "us-east-1"
    },
    "model_info": {
      "id": "amazon-nova-canvas",
      "mode": "image_generation",
      "description": "Amazon Nova Canvas - Text-to-image generation via Bedrock"
    }
  }'
```

### Test via curl

```bash
curl -s "$LITELLM_URL/v1/images/generations" \
  -H "Authorization: Bearer $ML_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "amazon-nova-canvas",
    "prompt": "A futuristic city skyline at sunset, cyberpunk style",
    "size": "1024x1024",
    "n": 1
  }' | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
img = base64.b64decode(data['data'][0]['b64_json'])
with open('test_image.png', 'wb') as f:
    f.write(img)
print('Saved to test_image.png')"
```

### Python SDK Usage

```python
from openai import OpenAI
import base64
from IPython.display import Image, display

client = OpenAI(
    base_url="http://litellm.maas.svc.cluster.local:4000/v1",
    api_key="sk-..."  # LiteLLM API key
)

response = client.images.generate(
    model="amazon-nova-canvas",
    prompt="A futuristic city skyline at sunset, cyberpunk style",
    size="1024x1024",
    n=1
)

# Display the generated image (in Jupyter)
img_data = base64.b64decode(response.data[0].b64_json)
display(Image(data=img_data))
```

### Create a Marketing Team with Image Generation Access

```bash
curl -X POST "$LITELLM_URL/team/new" \
  -H "Authorization: Bearer $LITELLM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_alias": "Marketing",
    "models": ["claude-sonnet-4-6", "amazon-nova-canvas"],
    "max_budget": 200,
    "budget_duration": "1mo"
  }'
```

This team gets access to Claude Sonnet (text/copy) and Nova Canvas (images) — a realistic use case for a marketing team generating copy and visuals.

### Example Notebook

See `01-maas/notebook-image/examples/02-image-generation-nova-canvas.ipynb` for a complete Jupyter notebook demonstrating text-to-image generation through the LiteLLM gateway.
