# Model OCI Image Builder

This Pulumi project builds OCI container images containing HuggingFace models for use with KServe Modelcars.

## Related Documentation

- [EBS Snapshot Guide](./EBS_SNAPSHOT_GUIDE.md) - How to create EBS snapshots with pre-cached container images for faster node startup

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

## Components

The project uses reusable Pulumi component resources:

- **EcrRepositoryComponent** - Creates an ECR repository with lifecycle policies and security best practices
- **CodeBuildModelBuilderComponent** - Creates CodeBuild project with IAM roles, S3 source bucket, and build configuration

## Configuration

The HuggingFace token is retrieved from Pulumi ESC environment. Model configurations are defined directly in `index.ts`.

| Config Key | Description | Source |
|------------|-------------|--------|
| `huggingface-token` | HuggingFace token for gated models | Pulumi ESC |

### CodeBuild Compute Types

For larger models (>10GB), use a larger compute type:

| Compute Type | Memory | vCPUs | Use Case |
|-------------|--------|-------|----------|
| `BUILD_GENERAL1_SMALL` | 3 GB | 2 | Models < 8GB (default) |
| `BUILD_GENERAL1_MEDIUM` | 7 GB | 4 | Models 8-15GB |
| `BUILD_GENERAL1_LARGE` | 15 GB | 8 | Models 15-40GB |
| `BUILD_GENERAL1_2XLARGE` | 145 GB | 72 | Very large models |

## Usage

### Adding a New Model

Edit `index.ts` and add ECR + CodeBuild component instances:

```typescript
// Example: Add Mistral-7B
const mistralEcr = new EcrRepositoryComponent("mistral-7b-ecr", {
    repositoryName: "kserve-models/mistral-7b",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const mistralBuilder = new CodeBuildModelBuilderComponent("mistral-7b-builder", {
    ecrRepositoryArn: mistralEcr.repositoryArn,
    ecrRepositoryName: mistralEcr.repository.name,
    modelId: "mistralai/Mistral-7B-v0.1",
    imageTag: "latest",
    hfToken: hfToken,
    computeType: "BUILD_GENERAL1_SMALL",  // Optional, defaults to SMALL
    tags: tags,
});
```

### Deploy and Build

```bash
cd 99-model-oci-image

# Install dependencies
npm install

# Select stack
pulumi stack select dev

# Deploy (creates ECR repos, CodeBuild projects)
pulumi up

# Trigger builds via AWS CLI
pulumi env run pulumi-idp/auth -- aws codebuild start-build \
  --project-name <project-name-from-output>
```

## Current Models

| Model | Compute Type | ECR Repository | Notes |
|-------|-------------|----------------|-------|
| openai/gpt-oss-20b | 2XLARGE | kserve-models/openai-gpt-oss-20b | Requires Hopper/Blackwell GPUs (H100, B200), special vLLM build (0.10.1+gptoss) |
| Qwen/Qwen3-30B-A3B | 2XLARGE | kserve-models/qwen-qwen3-30b-a3b | Mixture of Experts model, efficient inference with only 3B active parameters |

**Note:** Both models use `BUILD_GENERAL1_2XLARGE` compute type due to their large size (20B+ parameters). The older models (Meta-Llama-3-8B, Qwen3-8B, Qwen2.5-7B) have been removed.

## KServe Usage

After building, use the OCI URI in your LLMInferenceService (in `00-infrastructure`):

```typescript
const gptOssModel = new LLMInferenceServiceComponent("gpt-oss-20b", {
    modelUri: `oci://${ecrBaseUrl}/kserve-models/openai-gpt-oss-20b:latest`,
    modelName: "openai/gpt-oss-20b",
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

## EBS Snapshot Support

Two snapshot scripts are provided for pre-caching container images on GPU nodes:

| Script | AMI Family | Default Instance | Use Case |
|--------|-----------|-----------------|----------|
| `snapshot.sh` | Bottlerocket | `m5.large` | Standard GPU nodes (g5, g6) |
| `snapshot-al2023.sh` | AL2023 NVIDIA | `p5.4xlarge` | H100/MIG nodes (p5, p4d) |

See [EBS Snapshot Guide](./EBS_SNAPSHOT_GUIDE.md) for detailed usage.

## Files

- `index.ts` - Pulumi infrastructure code with model configurations
- `src/components/ecrRepositoryComponent.ts` - ECR repository component
- `src/components/codeBuildModelBuilderComponent.ts` - CodeBuild project component
- `docker/Dockerfile` - Multi-stage Dockerfile
- `docker/download_model.py` - Python script to download HF models
- `docker/buildspec.yml` - AWS CodeBuild build specification
- `snapshot.sh` - EBS snapshot builder for Bottlerocket nodes
- `snapshot-al2023.sh` - EBS snapshot builder for AL2023 NVIDIA nodes
- `ebs-snapshot-instance.yaml` - CloudFormation template for Bottlerocket snapshot instance
- `ebs-snapshot-instance-al2023.yaml` - CloudFormation template for AL2023 NVIDIA snapshot instance
