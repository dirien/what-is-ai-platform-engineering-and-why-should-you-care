# AI Platform Engineering Demo

This repository demonstrates AI platform engineering patterns with Pulumi and EKS.

## Project Structure

- [00-infrastructure](./00-infrastructure/CLAUDE.md) - EKS Auto Mode cluster with Karpenter GPU NodePools, KServe, and LLM deployments
- `01-maas/` - Model-as-a-Service application with LiteLLM proxy
- [99-model-oci-image](./99-model-oci-image/CLAUDE.md) - OCI image builder for KServe Modelcars (faster model loading)

## Deployment Order

Projects must be deployed in this order:

1. **99-model-oci-image** - Creates ECR repos and CodeBuild projects for model OCI images
2. **00-infrastructure** - EKS cluster, Karpenter, KServe, and LLM deployments (requires ECR base URL from step 1)
3. **01-maas** - MaaS application with LiteLLM proxy (requires running cluster from step 2)

## Quick Start

```bash
# 1. Build model OCI images (creates ECR repos)
cd 99-model-oci-image
npm install && pulumi stack select dev && pulumi up
# Trigger CodeBuild to build images:
# pulumi env run pulumi-idp/auth -- aws codebuild start-build --project-name <project-name>

# 2. Deploy infrastructure
cd ../00-infrastructure
npm install && pulumi stack select dev
# Set required config:
pulumi config set clusterName demo-ai-idp-cluster
pulumi config set ecrBaseUrl <account-id>.dkr.ecr.<region>.amazonaws.com
pulumi config set gpuSnapshotId <snapshot-id>  # EBS snapshot with pre-cached images
pulumi up

# 3. Deploy MaaS application
cd ../01-maas/infra
npm install && pulumi stack select dev && pulumi up
```

## Model Storage Options

The platform supports two model storage approaches:

| Storage Type | Pros | Cons |
|-------------|------|------|
| **HuggingFace (`hf://`)** | Simple setup, always latest | Slow startup, requires HF token at runtime |
| **OCI Modelcars (`oci://`)** | Fast startup, cached on nodes | Requires pre-building images |

See [99-model-oci-image](./99-model-oci-image/CLAUDE.md) for building OCI model images.

## Skills

When working with Pulumi TypeScript projects in this repo, use the `pulumi-skills:pulumi-typescript` skill for best practices on ESC integration, component patterns, and TypeScript idioms.
