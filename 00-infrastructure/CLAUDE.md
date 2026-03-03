# 00-infrastructure

Pulumi TypeScript project for EKS cluster with GPU support via Karpenter, H100 MIG managed node group, GPU Operator, EBS CSI driver, and KServe LLMInferenceService.

## Stack

- **Stack name:** `dev`
- **Select stack:** `pulumi stack select dev`

## Components

### KarpenterNodePoolComponent

Reusable component for creating Karpenter NodePools. Located in `src/components/karpenterNodePoolComponent.ts`.

**Required:**
- `instanceTypes: string[]` - Instance types (e.g., `["m6i.large"]`)

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
const generalPool = new KarpenterNodePoolComponent("general", {
    instanceTypes: ["m6i.large", "m6i.xlarge"],
    capacityTypes: ["spot", "on-demand"],
    limits: { cpu: 100 },
    disruption: {
        consolidationPolicy: "WhenEmptyOrUnderutilized",
        consolidateAfter: "1m",
    },
}, { provider: k8sProvider });
```

### GpuOperatorComponent

Component for deploying the NVIDIA GPU Operator with MIG support. Located in `src/components/gpuOperatorComponent.ts`.

**Args:**
- `namespace?: string` - Namespace for the GPU Operator (default: `"gpu-operator"`)
- `gpuOperatorVersion?: string` - GPU Operator Helm chart version (default: `"v25.3.0"`)

**Features:**
- Installs NVIDIA device plugin (targeted to `gpu-type: h100` nodes)
- Enables Node Feature Discovery (NFD)
- Configures MIG Manager with `all-3g.40gb` default profile
- Disables driver/toolkit (uses host drivers from AL2023 NVIDIA AMI)
- Disables DCGM exporter (handled by ObservabilityComponent)

**Example:**
```typescript
const gpuOperator = new GpuOperatorComponent("gpu-operator", {
    namespace: "gpu-operator",
}, { provider: k8sProvider, dependsOn: [h100NodeGroup] });
```

### KServeComponent

Component for installing KServe v0.16 with all dependencies. Located in `src/components/kserveComponent.ts`.

**Installs:**
- cert-manager (from Jetstack Helm repo)
- LeaderWorkerSet (LWS) for multi-node inference
- kserve-crd (from OCI registry)
- kserve controller (from OCI registry)
- llmisvc-crd (LLMInferenceService CRDs)
- llmisvc-resources (LLMInferenceService controller and runtimes)

**Args:**
- `certManagerVersion?: string` - cert-manager version (default: `"v1.19.3"`)
- `kserveVersion?: string` - KServe version (default: `"v0.16.0"`)
- `gatewayApiVersion?: string` - Gateway API CRDs version (default: `"v1.4.1"`)
- `deploymentMode?: "RawDeployment" | "Serverless"` - Deployment mode (default: `"RawDeployment"`)
- `lwsVersion?: string` - LeaderWorkerSet version (default: `"0.7.0"`)
- `storageInitializer?: StorageInitializerConfig` - Storage initializer resource config
- `llmisvController?: LLMISvcControllerConfig` - LLMInferenceService controller resource config

**StorageInitializerConfig:**
- `memoryRequest?: string` - Memory request (default: `"100Mi"`)
- `memoryLimit?: string` - Memory limit (default: `"1Gi"`)
- `cpuRequest?: string` - CPU request (default: `"100m"`)
- `cpuLimit?: string` - CPU limit (default: `"1"`)

**LLMISvcControllerConfig:**
- `cpuRequest?: string` - CPU request (default: `"100m"`)
- `cpuLimit?: string` - CPU limit (default: `"500m"`)
- `memoryRequest?: string` - Memory request (default: `"300Mi"`)
- `memoryLimit?: string` - Memory limit (default: `"1Gi"`)

**Example:**
```typescript
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.19.3",
    kserveVersion: "v0.16.0",
    deploymentMode: "RawDeployment",
    lwsVersion: "0.7.0",
    storageInitializer: {
        memoryRequest: "16Gi",
        memoryLimit: "64Gi",
        cpuRequest: "2",
        cpuLimit: "8",
    },
    llmisvController: {
        cpuRequest: "200m",
        cpuLimit: "1",
        memoryRequest: "512Mi",
        memoryLimit: "2Gi",
    },
}, { provider: k8sProvider, dependsOn: [generalNodePool, h100NodeGroup] });
```

### LLMInferenceServiceComponent

Component for deploying LLMs using KServe's LLMInferenceService (v1alpha1). Located in `src/components/llmInferenceServiceComponent.ts`.

**Required:**
- `modelUri: string` - Model URI (e.g., `"oci://...ecr.../kserve-models/openai-gpt-oss-20b:latest"` or `"hf://Qwen/Qwen2.5-7B-Instruct"`)
- `modelName: string` - Model name for vLLM

**Optional:**
- `storageType?: "oci" | "hf"` - Storage type (`"oci"` for Modelcars, `"hf"` for HuggingFace)
- `namespace?: string` - K8s namespace (default: `"default"`)
- `replicas?: number` - Number of replicas (default: `1`)
- `resources?: LLMResourceConfig` - CPU, memory, GPU resources
- `gpuResourceName?: string` - GPU resource name for scheduling (default: `"nvidia.com/gpu"`). For MIG slices, use e.g. `"nvidia.com/mig-3g.40gb"`
- `args?: string[]` - Additional vLLM arguments (e.g., `--max_model_len`, `--enable-auto-tool-choice`, `--tool-call-parser`)
- `env?: EnvVar[]` - Environment variables
- `tolerations?: Toleration[]` - Pod tolerations
- `startupProbe?: ProbeConfig` - Startup probe for slow-starting models (recommended for large context lengths)
- `livenessProbe?: ProbeConfig` - Liveness probe configuration

**Startup Probe (recommended for LLMs):**

LLMs can take 10-30+ minutes to load (model loading + torch.compile + CUDA graph warmup). Use `startupProbe` to prevent premature pod restarts:

```typescript
startupProbe: {
    initialDelaySeconds: 120,   // Wait before first probe
    periodSeconds: 30,          // Probe interval
    timeoutSeconds: 30,         // Probe timeout
    failureThreshold: 60,       // Max failures (120s + 60*30s = 32 min)
}
```

**Example:**
```typescript
const gptOss20b = new LLMInferenceServiceComponent("gpt-oss-20b", {
    modelUri: `oci://${ecrBaseUrl}/kserve-models/openai-gpt-oss-20b:latest`,
    modelName: "openai/gpt-oss-20b",
    storageType: "oci",
    namespace: "default",
    replicas: 1,
    gpuResourceName: "nvidia.com/mig-3g.40gb",
    resources: {
        cpuLimit: "8",
        memoryLimit: "64Gi",
        gpuCount: 1,
        cpuRequest: "4",
        memoryRequest: "32Gi",
    },
    args: [
        "--max_model_len=32768",
        "--async-scheduling",
        "--enable-auto-tool-choice",
        "--tool-call-parser=openai",
    ],
    tolerations: [{key: "nvidia.com/gpu", operator: "Equal", value: "h100", effect: "NoSchedule"}],
    startupProbe: {
        initialDelaySeconds: 120,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 60,
    },
}, { provider: k8sProvider, dependsOn: [kserve, gpuOperator] });
```

**Context Length Guidelines for H100 MIG 3g.40gb (40GB VRAM):**

| Model | Native Context | Recommended `--max_model_len` |
|-------|----------------|-------------------------------|
| openai/gpt-oss-20b | 32K | 32768 |
| Qwen/Qwen3-30B-A3B | 32K | 16384 (MoE, limited by KV cache) |

### ObservabilityComponent

Reusable component for deploying a complete observability stack. Located in `src/components/observabilityComponent.ts`.

**Installs:**
- Metrics Server (for HPA support)
- kube-prometheus-stack (Prometheus, Grafana, node-exporter, kube-state-metrics)
- NVIDIA DCGM Exporter (GPU metrics)
- Pre-provisioned NVIDIA DCGM dashboard (Grafana ID 12239)

**Note:** The gp3 StorageClass should be created in `index.ts` before deploying this component.

**Args:**
- `namespace?: string` - Namespace for monitoring stack (default: `"monitoring"`)
- `storageClassName?: string` - Storage class name (default: `"gp3"`)
- `metricsServer?: MetricsServerConfig` - Metrics server configuration
- `prometheusStack?: PrometheusStackConfig` - Prometheus stack configuration
- `grafana?: GrafanaConfig` - Grafana configuration
- `dcgmExporter?: DcgmExporterConfig` - DCGM exporter configuration

**Example:**
```typescript
const observability = new ObservabilityComponent("observability", {
    namespace: "monitoring",
    storageClassName: "gp3",
    metricsServer: { enabled: true, version: "3.13.0" },
    prometheusStack: {
        version: "82.2.1",
        alertmanagerEnabled: false,
        storageSize: "50Gi",
    },
    grafana: {
        enabled: true,
        adminPassword: "admin",
        storageSize: "10Gi",
    },
    dcgmExporter: {
        enabled: true,
        version: "4.8.1",
        nodeSelector: { "gpu-type": "h100" },
        tolerations: [{ key: "nvidia.com/gpu", operator: "Equal", value: "h100", effect: "NoSchedule" }],
        memoryRequest: "512Mi",
        memoryLimit: "1Gi",
    },
}, { provider: k8sProvider, dependsOn: [gp3StorageClass] });
```

**Access Grafana:**
```bash
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- \
  kubectl port-forward svc/observability-kube-prometheus-stack-grafana 3000:80 -n monitoring
# Open http://localhost:3000 (admin/admin)
```

## Config Values

Set via `pulumi config set`:
- `clusterName` (required) - EKS cluster name
- `ecrBaseUrl` (required for OCI models) - ECR registry base URL (e.g., `052848974346.dkr.ecr.us-east-1.amazonaws.com`)
- `h100SnapshotId` (recommended) - EBS snapshot ID with pre-cached container images for faster H100 node startup
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

H100 GPU nodes are tainted to ensure only GPU workloads run on them:
- **Taint:** `nvidia.com/gpu=h100:NoSchedule`

Non-GPU workloads (cert-manager, kserve-controller, etc.) run on:
- System managed node group (with `CriticalAddonsOnly` taint for cluster-critical workloads)
- Karpenter-provisioned general nodes (for observability, KServe controllers, etc.)

## Testing the LLM

After deployment, test the model with port-forward:

```bash
# Port forward to gpt-oss-20b
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -i -- \
  kubectl port-forward svc/gpt-oss-20b-kserve-workload-svc 8000:8000 -n default

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

| Model Size | GPU Memory | Recommended Instance / MIG Profile |
|------------|------------|-----------------------------------|
| 7B-20B     | ~14-40GB   | H100 MIG 3g.40gb (40GB VRAM per slice) |
| 30B MoE    | ~20GB active | H100 MIG 3g.40gb (MoE only loads active params) |
| 70B        | ~140GB     | p5.48xlarge (8x H100 80GB) |

## NodePools

Two node groups handle workloads:

- **general** (Karpenter NodePool): `m6i.large`, `m6i.xlarge`, `m7i.large`, `m7i.xlarge`, etc. (on-demand) - For general workloads (observability, KServe controllers, JupyterHub)
- **h100-mig-nodes** (EKS Managed Node Group): `p5.4xlarge` (H100 80GB with MIG 3g.40gb) - For LLM inference using MIG slices

## Networking

KServe's LLMInferenceService controller requires a Gateway API Gateway for networking reconciliation. A dummy `kserve-ingress-gateway` Gateway resource is created in the `kserve` namespace to satisfy this validation. Ingress creation is disabled (`disableIngressCreation: true`) since LiteLLM routes to models directly via Kubernetes service names.

## Infrastructure Components

- **EKS Cluster**: Standard EKS cluster with API authentication mode
- **System Node Group**: Managed node group for cluster-critical workloads (Karpenter, CoreDNS, etc.)
- **H100 MIG Node Group**: Managed node group with AL2023 NVIDIA AMI for GPU inference with MIG support
- **EBS CSI Driver**: Installed via EKS addon with Pod Identity for persistent volume provisioning
- **gp3 StorageClass**: Default storage class for all persistent volumes
- **Karpenter**: Manages general workload nodes with Bottlerocket AMI
- **GPU Operator**: NVIDIA GPU Operator for MIG management (device plugin + MIG manager) on H100 nodes
- **AWS Load Balancer Controller**: Manages ALB/NLB for Ingress and Service resources
- **LeaderWorkerSet (LWS)**: For multi-node inference support
- **Gateway API CRDs**: Required by KServe's LLMInferenceService networking

## Gated Models

Some models on HuggingFace require license acceptance:

- **Meta Llama 3**: Accept license at https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct
- Ensure your `HF_TOKEN` is from the same account that accepted the license
