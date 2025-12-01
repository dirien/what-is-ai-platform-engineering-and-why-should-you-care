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

## Pulumi ESC Commands

**For AWS CLI operations** (SSO authentication):
```bash
pulumi env run pulumi-idp/auth -i -- <aws-command>
# Example: pulumi env run pulumi-idp/auth -i -- aws sts get-caller-identity
```

**For kubectl operations** (cluster access via kubeconfig):
```bash
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- kubectl <command>
# Example: pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- kubectl get nodes
# Example: pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- kubectl get pods -A
```

**For Pulumi operations** (stack is configured in `Pulumi.dev.yaml`):
```bash
pulumi stack select dev
pulumi preview
pulumi up --yes
```

> **Note:** Do NOT use `pulumi env` for `pulumi up` - the environment is already set in `Pulumi.dev.yaml`.

### KServeComponent

Component for installing KServe v0.16 with all dependencies. Located in `kserveComponent.ts`.

**Installs:**
- cert-manager (from Jetstack Helm repo)
- kserve-crd (from OCI registry)
- kserve controller (from OCI registry, includes all ClusterServingRuntimes)
- llmisvc-crd (optional, for LLM features)

**Args:**
- `certManagerVersion?: string` - cert-manager version (default: `"v1.16.1"`)
- `kserveVersion?: string` - KServe version (default: `"v0.16.0"`)
- `deploymentMode?: "RawDeployment" | "Serverless"` - Deployment mode (default: `"RawDeployment"`)
- `installServingRuntimes?: boolean` - Install LLMInferenceService CRDs (default: `true`)

**Example:**
```typescript
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.16.1",
    kserveVersion: "v0.16.0",
    deploymentMode: "RawDeployment",
    installServingRuntimes: true,
}, { provider: cluster.provider, dependsOn: [gpuStandardNodePool] });
```

## GPU Node Isolation

GPU nodes are tainted to ensure only GPU workloads run on them:
- **Taint:** `nvidia.com/gpu=true:NoSchedule`
- **Label:** `node-type=gpu`

Non-GPU workloads (cert-manager, kserve-controller, etc.) run on EKS Auto Mode general-purpose nodes.
