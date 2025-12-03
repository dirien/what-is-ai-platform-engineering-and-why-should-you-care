# AI Platform Engineering Demo

This repository demonstrates AI platform engineering patterns with Pulumi and EKS.

## Project Structure

- [00-infrastructure](./00-infrastructure/CLAUDE.md) - EKS Auto Mode cluster with Karpenter GPU NodePools, KServe, and LLM deployments
- `01-maas/` - Model-as-a-Service application with LiteLLM proxy
- [99-model-oci-image](./99-model-oci-image/CLAUDE.md) - OCI image builder for KServe Modelcars (faster model loading)

## Quick Start

```bash
# Deploy infrastructure
cd 00-infrastructure
pulumi stack select dev
pulumi up

# Build model OCI image (optional, for faster startup)
cd ../99-model-oci-image
pulumi up
# Then trigger CodeBuild to build the image
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
