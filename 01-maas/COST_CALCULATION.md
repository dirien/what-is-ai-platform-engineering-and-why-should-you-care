# Model Cost Calculation for Chargeback

This document explains the methodology for calculating per-token costs for self-hosted LLM models running on AWS GPU instances. These costs are used for internal chargeback and usage tracking in LiteLLM.

## Overview

When running self-hosted models, there's no direct per-token billing like with cloud APIs (OpenAI, Anthropic). Instead, costs are based on:

1. **Infrastructure cost** (GPU instance hourly rate)
2. **Model throughput** (tokens generated per second)

The formula derives a per-token cost that can be used for chargeback across teams.

## Cost Calculation Formula

```
Cost per 1M tokens = (Hourly Instance Cost / Tokens per Hour) × 1,000,000
```

Where:
```
Tokens per Hour = Throughput (tokens/sec) × 3600
```

## Step-by-Step Calculation

### Step 1: Identify the GPU Instance Type

Check which instance type each model runs on:

```bash
# Get GPU nodes and their instance types
kubectl get nodes -l karpenter.sh/nodepool=gpu-standard \
  -o custom-columns='NAME:.metadata.name,INSTANCE:.metadata.labels.node\.kubernetes\.io/instance-type'
```

### Step 2: Get Instance Hourly Cost

AWS G5 instance on-demand pricing (us-east-1, December 2024):

| Instance Type | vCPUs | Memory | GPU | Hourly Cost |
|---------------|-------|--------|-----|-------------|
| g5.xlarge | 4 | 16 GiB | 1x A10G (24GB) | $1.006 |
| g5.2xlarge | 8 | 32 GiB | 1x A10G (24GB) | $1.212 |
| g5.4xlarge | 16 | 64 GiB | 1x A10G (24GB) | $1.624 |
| g5.8xlarge | 32 | 128 GiB | 1x A10G (24GB) | $2.448 |
| g5.12xlarge | 48 | 192 GiB | 4x A10G (96GB) | $5.672 |

Source: [AWS EC2 Pricing](https://aws.amazon.com/ec2/pricing/on-demand/)

### Step 3: Estimate Model Throughput

Throughput varies based on:
- Model size (parameters)
- Sequence length
- Batch size
- GPU memory bandwidth

**Conservative estimates for A10G GPU (24GB VRAM):**

| Model Size | Decode Throughput | Notes |
|------------|-------------------|-------|
| 7-8B | 30-40 tokens/sec | Single request, no batching |
| 13B | 20-30 tokens/sec | May need quantization |
| 20B+ | 15-25 tokens/sec | Requires high memory utilization |

For chargeback, use **conservative estimates** (lower throughput = higher cost per token). This ensures cost recovery and accounts for:
- Cold start overhead
- Variable request patterns
- Underutilization during low-traffic periods

**Important: Input vs Output Cost Difference**

LLM inference has two distinct phases with different compute characteristics:

1. **Prefill (Input)** - Processes entire prompt in parallel, GPU compute-bound, very fast
2. **Decode (Output)** - Generates tokens one at a time, memory bandwidth-bound, slower

Because output generation is ~3x more compute-intensive per token, we split costs:
- **Input cost**: ~25% of total (prefill is fast)
- **Output cost**: ~75% of total (decode is the bottleneck)

### Step 4: Calculate Cost per 1M Tokens

**Example: Qwen2.5-7B / Llama-3-8B on g5.2xlarge**

```
Hourly Cost: $1.212
Estimated Decode Throughput: 35 tokens/sec (conservative)
Tokens per Hour: 35 × 3600 = 126,000 tokens

Total Cost per 1M tokens = ($1.212 / 126,000) × 1,000,000
                        = $9.62 per 1M tokens

Split by input/output (25%/75%):
  - Input:  $9.62 × 0.25 = $2.40 → rounded to $3.00/1M
  - Output: $9.62 × 0.75 = $7.22 → rounded to $9.00/1M
```

**Example: Qwen3-8B on g5.4xlarge**

```
Hourly Cost: $1.624
Estimated Decode Throughput: 35 tokens/sec (conservative)
Tokens per Hour: 35 × 3600 = 126,000 tokens

Total Cost per 1M tokens = ($1.624 / 126,000) × 1,000,000
                        = $12.89 per 1M tokens

Split by input/output (25%/75%):
  - Input:  $12.89 × 0.25 = $3.22 → rounded to $3.50/1M
  - Output: $12.89 × 0.75 = $9.67 → rounded to $10.00/1M
```

## Current Model Costs

| Model | Instance | Hourly Cost | Throughput Est. | Input/1M | Output/1M |
|-------|----------|-------------|-----------------|----------|-----------|
| qwen2.5-7b-instruct | g5.2xlarge | $1.212 | 35 tok/s | $3.00 | $9.00 |
| llama-3-8b-instruct | g5.2xlarge | $1.212 | 35 tok/s | $3.00 | $9.00 |
| qwen3-8b | g5.4xlarge | $1.624 | 35 tok/s | $3.50 | $10.00 |

**Per-token costs for LiteLLM:**

| Model | `input_cost_per_token` | `output_cost_per_token` | `max_tokens` |
|-------|------------------------|-------------------------|--------------|
| qwen2.5-7b-instruct | 0.000003 | 0.000009 | 32768 |
| llama-3-8b-instruct | 0.000003 | 0.000009 | 8192 |
| qwen3-8b | 0.0000035 | 0.00001 | 20480 |

**Note on context lengths:**

| Model | Native Context | Extended (YaRN) | Our vLLM Config | Notes |
|-------|----------------|-----------------|-----------------|-------|
| Qwen2.5-7B-Instruct | 32K | 131K | 32K | Native context fits on A10G |
| Llama-3-8B-Instruct | 8K | N/A | 8K | Native context |
| Qwen3-8B | 32K | 131K | 20K | Limited by KV cache memory on A10G |

We configure `--max_model_len` in vLLM based on available GPU memory. Qwen3-8B requires more KV cache memory per token than Qwen2.5-7B, so its context is limited to 20K on A10G (24GB VRAM) with `--gpu_memory_utilization=0.9`. Set `max_tokens` in LiteLLM to match the actual vLLM configuration.

## Adding Models to LiteLLM

When adding a new model to LiteLLM, include the cost metadata:

```bash
curl -X POST http://localhost:4000/model/new \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "your-model-name",
    "litellm_params": {
      "model": "openai//mnt/models",
      "api_base": "http://your-model-svc.default.svc.cluster.local:8000/v1",
      "api_key": "not-needed"
    },
    "model_info": {
      "id": "your-model-name",
      "mode": "chat",
      "input_cost_per_token": 0.000003,
      "output_cost_per_token": 0.000009,
      "max_tokens": 32768,
      "base_model": "org/Model-Name",
      "description": "Model description with instance info ($X.XX/hr on instance-type)"
    }
  }'
```

**Note:** The vLLM model name is `/mnt/models` (where KServe mounts the model), so use `openai//mnt/models` as the model identifier in LiteLLM.

## Updating Costs

Costs should be reviewed and updated when:

1. **Instance pricing changes** - AWS periodically adjusts pricing
2. **Instance type changes** - Model moved to different GPU
3. **Throughput improvements** - vLLM updates, batching enabled
4. **Spot instances** - If using spot, costs are ~60-70% lower

### Spot Instance Adjustment

If using Karpenter with spot instances:

```
Spot Cost ≈ On-Demand Cost × 0.35 (typical 65% savings)
```

Update the `capacityTypes` in the NodePool to enable spot:

```typescript
capacityTypes: ["spot", "on-demand"]
```

## Comparison with Cloud APIs

| Provider | Model | Input/1M | Output/1M |
|----------|-------|----------|-----------|
| OpenAI | GPT-4o | $2.50 | $10.00 |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 |
| Anthropic | Claude 3.5 Sonnet | $3.00 | $15.00 |
| **Self-hosted** | Qwen2.5-7B | $3.00 | $9.00 |
| **Self-hosted** | Llama-3-8B | $3.00 | $9.00 |
| **Self-hosted** | Qwen3-8B | $3.50 | $10.00 |

Self-hosted models are cost-competitive for:
- High-volume workloads (amortize fixed costs)
- Data privacy requirements
- Customization/fine-tuning needs
- Predictable budgeting

## Future Improvements

1. **Actual throughput measurement** - Implement metrics collection from vLLM to get real throughput data
2. **Dynamic pricing** - Adjust costs based on actual utilization
3. **Batching efficiency** - Higher throughput with concurrent requests reduces per-token cost
