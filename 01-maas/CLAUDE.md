# MaaS Platform (01-maas)

This folder contains the Model-as-a-Service (MaaS) platform for the AI Platform Engineering demo. It bundles LiteLLM API gateway, a custom frontend application, and JupyterHub notebook support.

## Structure

- `app/` - Full-stack MaaS application
  - `frontend/` - React + Vite frontend with Tailwind CSS (port 3000)
    - "Warm Sophistication" design theme with coral/terracotta primary colors
    - Cream backgrounds, sage accents, Inter + Plus Jakarta Sans typography
    - Component styles: cards, badges, buttons, tables defined in index.css
    - **Notebooks page** for JupyterHub integration
  - `backend/` - Express.js API server (port 3001)
    - JupyterHub API integration for notebook management
  - `Dockerfile` - Multi-stage Docker build
- `infra/` - Pulumi infrastructure for ECR, Docker build, MaaS and JupyterHub deployment
- `notebook-image/` - Custom JupyterHub notebook Docker image (optional)

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
pulumi up
```

## Infrastructure

The `infra/` folder uses Pulumi TypeScript with:

### Components

- **EcrRepositoryComponent** - Reusable component for ECR repositories with:
  - Vulnerability scanning enabled
  - Server-side encryption (AES256)
  - Lifecycle policy for image cleanup

- **MaaSComponent** - Bundles LiteLLM and the MaaS frontend app:
  - Deploys to dedicated `maas` namespace
  - LiteLLM API gateway via Helm chart
  - MaaS frontend app Deployment and Service
  - Internet-facing AWS NLB via Load Balancer Controller
  - JupyterHub API token secret management

- **JupyterHubComponent** - Deploys JupyterHub for notebook support:
  - Deploys to dedicated `jupyterhub` namespace
  - Multiple notebook profiles (CPU Standard, CPU Large, GPU ML/AI)
  - LiteLLM integration for OpenAI SDK access in notebooks
  - Persistent storage for user data
  - Idle notebook culling
  - Internet-facing AWS NLB via Load Balancer Controller

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
- `maasNamespace` - MaaS Kubernetes namespace
- `litellmReleaseName` - LiteLLM Helm release name
- `litellmServiceUrl` - Internal cluster URL for LiteLLM API
- `litellmPublicUrl` - Public NLB URL for LiteLLM API (for external access)
- `maasServiceUrl` - Internal cluster URL for MaaS app
- `maasPublicUrl` - Public NLB URL for MaaS app
- `jupyterhubNamespace` - JupyterHub Kubernetes namespace
- `jupyterhubPublicUrl` - Public NLB URL for JupyterHub
- `ecrLoginCommand` - AWS CLI command for Docker login
- `dockerPullCommand` - Command to pull the image

## Configuration

| Config Key | Description | Required |
|------------|-------------|----------|
| `appName` | Application name prefix | No (default: maas) |

## Cost Calculation

See [COST_CALCULATION.md](./COST_CALCULATION.md) for the methodology used to calculate per-token costs for self-hosted models. This includes:
- Infrastructure cost formulas based on GPU instance hourly rates
- Input/output token cost differentiation (prefill vs decode phases)
- Current model costs for LiteLLM chargeback configuration

## Skills

When working with this Pulumi TypeScript project, use `pulumi-skills:pulumi-typescript` for best practices.
