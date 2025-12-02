# LiteLLM Model Discovery App (01-maas)

This folder contains the Model-as-a-Service application for the AI Platform Engineering demo.

## Structure

- `app/` - Full-stack LiteLLM Model Discovery application
  - `frontend/` - React + Vite frontend with Tailwind CSS (port 3000)
    - "Warm Sophistication" design theme with coral/terracotta primary colors
    - Cream backgrounds, sage accents, Inter + Plus Jakarta Sans typography
    - Component styles: cards, badges, buttons, tables defined in index.css
  - `backend/` - Express.js API server (port 3001)
  - `Dockerfile` - Multi-stage Docker build
- `infra/` - Pulumi infrastructure for ECR, Docker build, and LiteLLM deployment

## Quick Start

### Local Development

```bash
cd app
npm install
npm run dev  # Starts both frontend and backend
```

### Deploy Infrastructure

```bash
cd infra
npm install
pulumi stack select dev

# Set required secrets
pulumi config set --secret litellmMasterKey "sk-your-master-key"

pulumi up
```

## Infrastructure

The `infra/` folder uses Pulumi TypeScript with:

### Components

- **EcrRepositoryComponent** - Reusable component for ECR repositories with:
  - Vulnerability scanning enabled
  - Server-side encryption (AES256)
  - Lifecycle policy for image cleanup

- **LiteLLMComponent** - Deploys LiteLLM API gateway via Helm chart:
  - Unified OpenAI-compatible API for multiple model backends
  - Connects to KServe inference services from 00-infrastructure
  - PostgreSQL database for API key management
  - Configurable model routing

- **Docker Build** - Uses `@pulumi/docker-build` with:
  - BuildKit for improved performance
  - Multi-platform support (linux/amd64)
  - Build cache in ECR for faster rebuilds

### ESC Integration

The stack imports the kubeconfig from the 00-infrastructure ESC environment:

```yaml
# Pulumi.dev.yaml
environment:
  - self-service-ai-application-platforms/ai-platform-demo-cluster
```

This provides:
- `kubernetes:kubeconfig` - Kubeconfig for EKS cluster access

## Outputs

After `pulumi up`, you'll get:

- `ecrRepositoryUrl` - ECR repository URL for pulling images
- `imageRef` - Full image reference with tag
- `imageDigest` - Image digest for immutable deployments
- `litellmServiceName` - LiteLLM Kubernetes service name
- `litellmInternalUrl` - Internal cluster URL for LiteLLM API
- `ecrLoginCommand` - AWS CLI command for Docker login
- `dockerPullCommand` - Command to pull the image

## Configuration

| Config Key | Description | Required |
|------------|-------------|----------|
| `appName` | Application name prefix | No (default: litellm-app) |
| `litellmMasterKey` | Master API key for LiteLLM | Yes (secret) |

## Skills

When working with this Pulumi TypeScript project, use `pulumi-skills:pulumi-typescript` for best practices.
