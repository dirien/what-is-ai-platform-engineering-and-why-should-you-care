# MaaS Platform (01-maas)

This folder contains the Model-as-a-Service (MaaS) platform for the AI Platform Engineering demo. It bundles LiteLLM API gateway (v1.81.12-stable), a custom frontend application, and JupyterHub notebook support.

## Structure

- `app/` - Full-stack MaaS application
  - `frontend/` - React + Vite frontend with Tailwind CSS (port 3000)
    - "Warm Sophistication" design theme with coral/terracotta primary colors
    - Cream backgrounds, sage accents, Inter + Plus Jakarta Sans typography
    - Component styles: cards, badges, buttons, tables defined in index.css
    - **Notebooks page** for JupyterHub integration
    - **FinOps Dashboard** with server-side spend aggregation and team spend view
  - `backend/` - Express.js API server (port 3001)
    - JupyterHub API integration for notebook management
    - Team management CRUD endpoints
    - Budget alert webhook receiver
    - Server-side spend reporting via `/global/spend/report`
  - `Dockerfile` - Multi-stage Docker build (Node.js 22 Alpine)
- `infra/` - Pulumi infrastructure for ECR, Docker build, RDS, MaaS and JupyterHub deployment
  - `src/components/` - Pulumi component resources (EcrRepositoryComponent, MaaSComponent, JupyterHubComponent)
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

The `infra/` folder uses Pulumi TypeScript with components in `infra/src/components/`:

### Components

- **EcrRepositoryComponent** (`src/components/ecrComponent.ts`) - Reusable component for ECR repositories with:
  - Vulnerability scanning enabled
  - Server-side encryption (AES256)
  - Lifecycle policy for image cleanup

- **MaaSComponent** (`src/components/maasComponent.ts`) - Bundles LiteLLM and the MaaS frontend app:
  - Deploys to dedicated `maas` namespace
  - LiteLLM API gateway via Helm chart (v1.81.12-stable)
  - **RDS PostgreSQL** (db.t4g.micro, PostgreSQL 16.12) for LiteLLM persistence with automated backups, encryption, and final snapshot protection
  - MaaS frontend app Deployment and Service
  - Internet-facing AWS NLB via Load Balancer Controller
  - JupyterHub API token secret management
  - Budget alert webhook configuration

- **JupyterHubComponent** (`src/components/jupyterhubComponent.ts`) - Deploys JupyterHub for notebook support:
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
  - self-service-ai-application-platforms/demo-ai-idp-cluster-cluster
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
- `maasLoadBalancerUrl` - Public NLB URL for MaaS app
- `maasCloudFrontUrl` - Public CloudFront HTTPS URL for MaaS app (`*.cloudfront.net`, when enabled)
- `maasPublicUrl` - Effective public URL (CloudFront URL when enabled, otherwise NLB URL)
- `rdsEndpoint` - RDS PostgreSQL endpoint for LiteLLM database
- `jupyterhubNamespace` - JupyterHub Kubernetes namespace
- `jupyterhubPublicUrl` - Public NLB URL for JupyterHub
- `ecrLoginCommand` - AWS CLI command for Docker login
- `dockerPullCommand` - Command to pull the image

## Configuration

| Config Key | Description | Required |
|------------|-------------|----------|
| `appName` | Application name prefix | No (default: maas) |
| `litellmMasterKey` | LiteLLM master key for admin API access (secret) | Yes |
| `enableMaaSCloudFront` | Create CloudFront HTTPS front door for MaaS (`*.cloudfront.net`) | No (default: true) |
| `maasTlsCertificateArn` | ACM certificate ARN for MaaS NLB TLS listener (port 443) | No |
| `maasPublicHostname` | Custom DNS hostname for MaaS public URL output (must point to MaaS NLB) | No |
| `infra:vpcId` | VPC ID for RDS subnet group | Yes |
| `infra:privateSubnetIds` | Private subnet IDs for RDS (JSON array) | Yes |
| `infra:clusterSecurityGroupId` | EKS cluster security group ID for RDS ingress | Yes |

### HTTPS endpoint for proxy reliability (recommended, no domain needed)

By default, the stack now creates a CloudFront distribution in front of MaaS and exposes:

- `maasCloudFrontUrl`: `https://<distribution-id>.cloudfront.net`
- `maasPublicUrl`: same CloudFront URL when enabled

This avoids browser protocol issues on plain HTTP NLB endpoints and does not require buying a domain.

To disable CloudFront and use raw NLB URL:

```bash
pulumi config set enableMaaSCloudFront false
pulumi up
```

### Optional custom domain + NLB TLS

If browsers are unreliable against the plain HTTP NLB endpoint, configure HTTPS:

```bash
pulumi config set maasTlsCertificateArn arn:aws:acm:us-east-1:<account-id>:certificate/<cert-id>
pulumi config set maasPublicHostname maas.<your-domain>
pulumi up
```

Then create a DNS CNAME/ALIAS from `maas.<your-domain>` to the MaaS NLB hostname and use the `maasPublicUrl` output.

## Cost Calculation

See [@COST_CALCULATION.md](./COST_CALCULATION.md) for the methodology used to calculate per-token costs for self-hosted models. This includes:
- Infrastructure cost formulas based on GPU instance hourly rates
- Input/output token cost differentiation (prefill vs decode phases)
- Current model costs for LiteLLM chargeback configuration

## Skills

When working with this Pulumi TypeScript project, use `pulumi-skills:pulumi-typescript` for best practices.
