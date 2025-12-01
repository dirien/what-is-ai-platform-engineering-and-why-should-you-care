# 00-infrastructure

Pulumi TypeScript project for EKS Auto Mode cluster with GPU support via Karpenter.

## Stack

- **Stack name:** `dev`
- **Select stack:** `pulumi stack select dev`

## Components

### KarpenterNodePoolComponent

Reusable component for creating Karpenter NodePools. Located in `karpenterNodePoolComponent.ts`.

**Required:**
- `instanceTypes: string[]` - Instance types (e.g., `["g4dn.xlarge", "g5.xlarge"]`)

**Optional:**
- `poolName?: string` - NodePool name in K8s (defaults to resource name)
- `capacityTypes?: CapacityType[]` - `"spot"` or `"on-demand"` (default: `["on-demand"]`)
- `nodeClassName?: string` - EKS NodeClass reference (default: `"default"`)
- `labels?: Record<string, string>` - Node labels
- `taints?: NodeTaint[]` - Node taints with `key`, `value?`, `effect`
- `requirements?: NodeRequirement[]` - Additional custom requirements
- `limits?: ResourceLimits` - `cpu` and/or `memory` limits
- `disruption?: DisruptionConfig` - `consolidationPolicy` and `consolidateAfter`
- `availabilityZones?: string[]` - AZs to use
- `instanceCategories?: string[]` - Instance categories (e.g., `["g", "p"]` for GPU)
- `instanceGeneration?: string` - Min generation (Gt operator)
- `architecture?: string` - CPU arch (e.g., `"amd64"`)

**Example:**
```typescript
const gpuPool = new KarpenterNodePoolComponent("gpu-standard", {
    instanceTypes: ["g4dn.xlarge", "g5.xlarge"],
    capacityTypes: ["on-demand"],
    limits: { cpu: 1000 },
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "1m",
    },
}, { provider: cluster.provider });
```

### AIModelComponent

Component for deploying AI models with vLLM on LeaderWorkerSet. Located in `aiModelComponent.ts`.

**Required:**
- `modelName: string` - HuggingFace model name

**Optional:**
- `namespaceName?: string` - K8s namespace (default: `"lws-system"`)
- `size?: string` - T-shirt size: `"small"`, `"medium"`, `"large"`
- `monitoringEnabled?: boolean` - Enable Prometheus scraping
- `notParallel?: boolean` - Disable pipeline parallelism

## Config Values

Set via `pulumi config set`:
- `clusterName` (required) - EKS cluster name
- `gpuInstanceGeneration` (optional) - Min GPU instance generation (default: `"4"`)
- `gpuInstanceArch` (optional) - CPU architecture (default: `"amd64"`)
- `huggingface-token` (secret) - HuggingFace API token for model downloads

## Commands

```bash
pulumi stack select dev
pulumi preview
pulumi up
```
