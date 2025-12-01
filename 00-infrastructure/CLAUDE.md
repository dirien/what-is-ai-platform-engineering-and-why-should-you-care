# 00-infrastructure

Pulumi TypeScript project for EKS Auto Mode cluster with GPU support via Karpenter and KServe LLMInferenceService.

## Stack

- **Stack name:** `dev`
- **Select stack:** `pulumi stack select dev`

## Components

### KarpenterNodePoolComponent

Reusable component for creating Karpenter NodePools. Located in `karpenterNodePoolComponent.ts`.

**Required:**
- `instanceTypes: string[]` - Instance types (e.g., `["g5.2xlarge"]`)

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
    instanceTypes: ["g5.2xlarge"],
    capacityTypes: ["on-demand"],
    limits: { cpu: 1000 },
    taints: [{ key: "nvidia.com/gpu", value: "true", effect: "NoSchedule" }],
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "1m",
    },
}, { provider: kuebeconfigProvider });
```

### KServeComponent

Component for installing KServe v0.16 with all dependencies. Located in `kserveComponent.ts`.

**Installs:**
- cert-manager (from Jetstack Helm repo)
- kserve-crd (from OCI registry)
- kserve controller (from OCI registry)
- llmisvc-crd (LLMInferenceService CRDs)
- llmisvc-resources (LLMInferenceService controller and runtimes)

**Args:**
- `certManagerVersion?: string` - cert-manager version (default: `"v1.16.1"`)
- `kserveVersion?: string` - KServe version (default: `"v0.16.0"`)
- `deploymentMode?: "Standard" | "Serverless"` - Deployment mode (default: `"Standard"`)
- `storageInitializer?: StorageInitializerConfig` - Storage initializer resource config

**StorageInitializerConfig:**
- `memoryRequest?: string` - Memory request (default: `"100Mi"`)
- `memoryLimit?: string` - Memory limit (default: `"1Gi"`)
- `cpuRequest?: string` - CPU request (default: `"100m"`)
- `cpuLimit?: string` - CPU limit (default: `"1"`)

**Example:**
```typescript
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.16.1",
    kserveVersion: "v0.16.0",
    deploymentMode: "Standard",
    storageInitializer: {
        memoryRequest: "8Gi",
        memoryLimit: "16Gi",
        cpuRequest: "1",
        cpuLimit: "4",
    },
}, { provider: kuebeconfigProvider, dependsOn: [gpuStandardNodePool] });
```

### LLMInferenceServiceComponent

Component for deploying LLMs using KServe's LLMInferenceService (v1alpha1). Located in `llmInferenceServiceComponent.ts`.

**Required:**
- `modelUri: string` - Model URI (e.g., `"hf://Qwen/Qwen2.5-7B-Instruct"`)
- `modelName: string` - Model name for vLLM

**Optional:**
- `namespace?: string` - K8s namespace (default: `"default"`)
- `replicas?: number` - Number of replicas (default: `1`)
- `resources?: LLMResourceConfig` - CPU, memory, GPU resources
- `args?: string[]` - Additional vLLM arguments
- `env?: EnvVar[]` - Environment variables
- `tolerations?: Toleration[]` - Pod tolerations

**Example:**
```typescript
const qwen2Model = new LLMInferenceServiceComponent("qwen2-7b-instruct", {
    modelUri: "hf://Qwen/Qwen2.5-7B-Instruct",
    modelName: "Qwen/Qwen2.5-7B-Instruct",
    namespace: "default",
    replicas: 1,
    resources: {
        cpuLimit: "4",
        memoryLimit: "32Gi",
        gpuCount: 1,
        cpuRequest: "2",
        memoryRequest: "16Gi",
    },
    args: [
        "--max_model_len=8192",
        "--gpu_memory_utilization=0.9",
    ],
}, { provider: kuebeconfigProvider });
```

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
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- kubectl <command>
# Example: pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- kubectl get nodes
# Example: pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- kubectl get pods -A
```

**For Pulumi operations** (stack is configured in `Pulumi.dev.yaml`):
```bash
pulumi stack select dev
pulumi preview
pulumi up --yes
```

> **Note:** Do NOT use `pulumi env` for `pulumi up` - the environment is already set in `Pulumi.dev.yaml`.

## GPU Node Isolation

GPU nodes are tainted to ensure only GPU workloads run on them:
- **Taint:** `nvidia.com/gpu=true:NoSchedule`

Non-GPU workloads (cert-manager, kserve-controller, etc.) run on EKS Auto Mode general-purpose nodes.

## Testing the LLM

After deployment, test the model with port-forward:

```bash
# Port forward
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- \
  kubectl port-forward svc/qwen2-7b-instruct-kserve-workload-svc 8000:8000 -n default

# Check available models
curl http://localhost:8000/v1/models

# Chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "/mnt/models",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## GPU Instance Sizing

| Model Size | GPU Memory | Recommended Instance |
|------------|------------|---------------------|
| 3B         | ~6GB       | g4dn.xlarge (T4 16GB) |
| 7B         | ~14GB      | g5.2xlarge (A10G 24GB) |
| 13B        | ~26GB      | g5.4xlarge (A10G 24GB) or p4d |
