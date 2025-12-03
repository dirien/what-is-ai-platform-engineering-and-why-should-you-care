# Model OCI Image Builder

This Pulumi project builds OCI container images containing HuggingFace models for use with KServe Modelcars.

## Purpose

Instead of downloading models from HuggingFace every time a pod starts, this packages models into OCI images that can be cached on Kubernetes nodes, significantly reducing startup times.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-Stage Docker Build                  │
├─────────────────────────────────────────────────────────────┤
│  Stage 1: python:3.11-slim (downloader)                     │
│  - Installs huggingface_hub                                 │
│  - Downloads model files to /models                         │
│  - Uses hf_transfer for faster downloads                    │
├─────────────────────────────────────────────────────────────┤
│  Stage 2: busybox (final image)                             │
│  - Minimal base image (~5MB)                                │
│  - Copies model files from Stage 1                          │
│  - No runtime dependencies                                   │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

1. **Pulumi deploys AWS CodeBuild** - Creates ECR repository, S3 bucket for source, and CodeBuild project
2. **CodeBuild builds the image** - Downloads model from HuggingFace and packages into OCI image
3. **Image pushed to ECR** - Ready for use with KServe Modelcars
4. **KServe pulls from ECR** - Model cached on nodes for fast startup

## Configuration

| Config Key | Description | Example |
|------------|-------------|---------|
| `modelId` | HuggingFace model ID | `meta-llama/Meta-Llama-3-8B-Instruct` |
| `imageTag` | Docker image tag | `v1.0` |
| `huggingface-token` | HuggingFace token (secret, for gated models) | `hf_xxx` |

## Usage

```bash
cd 99-model-oci-image

# Install dependencies
pulumi install

# Select stack
pulumi stack select dev

# Set HuggingFace token for gated models (like LLaMA)
pulumi config set --secret huggingface-token hf_your_token_here

# Deploy (creates ECR repo, CodeBuild project)
pulumi up

# Trigger the build via AWS CLI
pulumi env run pulumi-idp/auth -- aws codebuild start-build \
  --project-name codebuild-docker-sample \
  --region us-west-2
```

## AWS ECR Limits

- **Max layer size**: 10 GB per layer
- **Max images per repo**: 20,000
- **Recommendation**: For models > 10GB, model files are typically split across multiple layers automatically

## KServe Usage

After building, use the OCI URI in your LLMInferenceService (in `00-infrastructure`):

```typescript
const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
    modelUri: "oci://052848974346.dkr.ecr.us-west-2.amazonaws.com/kserve-models/meta-llama-meta-llama-3-8b-instruct:v1.0",
    modelName: "meta-llama/Meta-Llama-3-8B-Instruct",
    storageType: "oci",  // Use OCI storage via Modelcars
    // ... other config
});
```

## Benefits of OCI Modelcars

| Benefit | Description |
|---------|-------------|
| **Faster startup** | Model cached on nodes (~2-3 min pull vs ~10+ min HF download) |
| **No runtime token** | HF token only needed at build time |
| **Better scaling** | Image layers shared across pods |
| **Version control** | Immutable image tags for reproducibility |

## Files

- `index.ts` - Pulumi infrastructure code (ECR, CodeBuild, S3)
- `docker/Dockerfile` - Multi-stage Dockerfile
- `docker/download_model.py` - Python script to download HF models
- `docker/buildspec.yml` - AWS CodeBuild build specification
