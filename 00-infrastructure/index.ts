import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";
import * as awsx from "@pulumi/awsx";
import * as k8s from "@pulumi/kubernetes";
import {SubnetType} from "@pulumi/awsx/ec2";
import * as pulumiservice from "@pulumi/pulumiservice";
import {KarpenterNodePoolComponent} from "./karpenterNodePoolComponent";
import {KServeComponent} from "./kserveComponent";
import {LLMInferenceServiceComponent} from "./llmInferenceServiceComponent";
import {ObservabilityComponent} from "./observabilityComponent";

const config = new pulumi.Config();
const clusterName = config.require("clusterName");
const gpuInstanceGeneration = config.get("gpuInstanceGeneration") || "4"; // Default to 4th generation GPU instances (e.g., G4dn, G5)
const gpuInstanceArch = config.get("gpuInstanceArch") || "amd64"; // Default to amd64 architecture

const eksVpc = new awsx.ec2.Vpc("eks-auto-mode", {
    enableDnsHostnames: true,
    cidrBlock: "10.0.0.0/16",
    subnetSpecs: [
        // Necessary tags for EKS Auto Mode to identify the subnets for the load balancers.
        // See: https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.1/deploy/subnet_discovery/
        {
            type: SubnetType.Public,
            tags: {[`kubernetes.io/cluster/${clusterName}`]: "shared", "kubernetes.io/role/elb": "1"}
        },
        {
            type: SubnetType.Private,
            tags: {[`kubernetes.io/cluster/${clusterName}`]: "shared", "kubernetes.io/role/internal-elb": "1"}
        },
    ],
    subnetStrategy: "Auto"
});

const cluster = new eks.Cluster("eks-auto-mode", {
    name: clusterName,
    // EKS Auto Mode requires Access Entries, use either the `Api` or `ApiAndConfigMap` authentication mode.
    authenticationMode: eks.AuthenticationMode.Api,
    vpcId: eksVpc.vpcId,
    publicSubnetIds: eksVpc.publicSubnetIds,
    privateSubnetIds: eksVpc.privateSubnetIds,
    // Enables compute, storage and load balancing for the cluster.
    autoMode: {
        enabled: true,
    },
    corednsAddonOptions: {
        enabled: false, // Disable CoreDNS addon to avoid a conflict with the default CoreDNS installed by EKS Auto Mode.
    },
});

export const kubeconfig = pulumi.secret(cluster.kubeconfigJson)

const kuebeconfigProvider = new k8s.Provider("kubeconfig-provider", {
    kubeconfig: cluster.kubeconfigJson,
    enableServerSideApply: true,
});

const gpuStandardNodePool = new KarpenterNodePoolComponent("gpu-standard", {
    // Use G5 instances with A10G GPUs (24GB VRAM) to fit 7B models
    instanceTypes: ["g5.2xlarge"],
    capacityTypes: ["on-demand"],
    limits: {
        cpu: 1000,
    },
    // Taint GPU nodes so only workloads that tolerate GPUs are scheduled here
    taints: [
        {
            key: "nvidia.com/gpu",
            value: "true",
            effect: "NoSchedule",
        },
    ],
    // Note: EKS Auto Mode doesn't support custom labels like "node-type: gpu"
    // Use karpenter.sh/nodepool label in nodeSelector instead to target this pool
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "1m",
    },
}, {provider: kuebeconfigProvider});

// NodePool for large MoE models requiring 8x A100 80GB GPUs (Qwen3-Coder-480B)
// p4de.24xlarge provides 8x A100 80GB GPUs with NVSwitch interconnect
// Total: 640GB VRAM - required for 480B MoE models (~250GB for FP8)
const gpuA100NodePool = new KarpenterNodePoolComponent("gpu-a100", {
    instanceTypes: ["p4de.24xlarge"],
    capacityTypes: ["on-demand"],
    limits: {
        cpu: 2000,
    },
    taints: [
        {
            key: "nvidia.com/gpu",
            value: "true",
            effect: "NoSchedule",
        },
    ],
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "5m",  // Longer consolidation for expensive instances
    },
}, {provider: kuebeconfigProvider});

// Install KServe v0.16 with cert-manager, LLMInferenceService CRDs and resources
// Uses Standard deployment mode to avoid Istio/Knative dependencies
// Storage initializer memory is increased for large model downloads (Qwen2.5-7B is ~15GB)
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.16.1",
    kserveVersion: "v0.16.0",
    deploymentMode: "Standard",
    // Configure default ClusterStorageContainer resources for large model downloads
    // Qwen3-Coder-480B is ~250GB, needs significant memory for download/extraction
    storageInitializer: {
        memoryRequest: "16Gi",
        memoryLimit: "64Gi",
        cpuRequest: "2",
        cpuLimit: "8",
    },
    // Increase LLMInferenceService controller resources for managing multiple models
    llmisvController: {
        cpuRequest: "200m",
        cpuLimit: "1",
        memoryRequest: "512Mi",
        memoryLimit: "2Gi",
    },
}, {provider: kuebeconfigProvider, dependsOn: [gpuStandardNodePool, gpuA100NodePool]});

// Observability stack: Prometheus, Grafana, DCGM Exporter, Metrics Server
// Provides GPU monitoring with pre-provisioned NVIDIA DCGM dashboard
const observability = new ObservabilityComponent("observability", {
    namespace: "monitoring",
    // Metrics server for HPA support
    metricsServer: {
        enabled: true,
        version: "3.13.0",
    },
    // Prometheus stack configuration
    prometheusStack: {
        version: "79.9.0",
        alertmanagerEnabled: false,
        storageSize: "50Gi",
    },
    // Grafana with NVIDIA DCGM dashboard
    grafana: {
        enabled: true,
        adminPassword: "admin", // Change in production!
        storageSize: "10Gi",
    },
    // DCGM exporter for GPU metrics - runs on all GPU nodes via DaemonSet
    dcgmExporter: {
        enabled: true,
        version: "4.6.0",
        // Only schedule on nodes that have GPUs (EKS labels GPU nodes with instance-gpu-manufacturer)
        nodeSelector: {
            "eks.amazonaws.com/instance-gpu-manufacturer": "nvidia",
        },
        // Tolerate GPU node taints
        tolerations: [
            {
                key: "nvidia.com/gpu",
                operator: "Exists",
                effect: "NoSchedule",
            },
        ],
        // DCGM exporter needs ~500Mi memory
        memoryRequest: "512Mi",
        memoryLimit: "1Gi",
    },
}, {provider: kuebeconfigProvider, dependsOn: [gpuStandardNodePool, gpuA100NodePool]});

const environmentResource = new pulumiservice.Environment("environmentResource", {
    name: clusterName + "-cluster",
    project: "self-service-ai-application-platforms",
    organization: pulumi.getOrganization(),
    yaml: new pulumi.asset.StringAsset(`
imports:
- pulumi-idp/auth
values:
  stackRefs:
    fn::open::pulumi-stacks:
      stacks:
        aws:
          stack: ${pulumi.getProject()}/${pulumi.getStack()}
  pulumiConfig:
    kubernetes:kubeconfig: \${stackRefs.aws.kubeconfig}
  files:
    KUBECONFIG: \${stackRefs.aws.kubeconfig}    
`),
}, {
    dependsOn: [cluster],
});

export const escName = pulumi.interpolate`${environmentResource.project}/${environmentResource.name}`

// Create HuggingFace secret for model downloads
// The secret must contain HF_TOKEN key (not 'token')
const huggingFaceSecret = new k8s.core.v1.Secret("hf-secret", {
    metadata: {
        name: "hf-secret",
        namespace: "default",
    },
    stringData: {
        HF_TOKEN: config.requireSecret("huggingface-token"),
    },
}, {provider: kuebeconfigProvider});


// Deploy Qwen2.5-7B-Instruct using KServe LLMInferenceService (v1alpha1)
// Uses the new GenAI-first API with built-in router, gateway and scheduler
// Runs on G5 instances with A10G GPU (24GB VRAM)
// Reference: https://kserve.github.io/website/docs/getting-started/genai-first-llmisvc
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
    // vLLM args for A10G GPU (24GB VRAM)
    args: [
        "--max_model_len=8192",
        "--gpu_memory_utilization=0.9",
    ],
}, {provider: kuebeconfigProvider});

// TODO: Deploy Meta-Llama-3-8B-Instruct after accepting Meta's license
// Llama 3 8B is Meta's instruction-tuned model with 8K context
// Runs on G5 instances with A10G GPU (24GB VRAM)
// Note: Requires accepting Meta's license at https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct
// Reference: https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct
// const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
//     modelUri: "hf://meta-llama/Meta-Llama-3-8B-Instruct",
//     modelName: "meta-llama/Meta-Llama-3-8B-Instruct",
//     namespace: "default",
//     replicas: 1,
//     resources: {
//         cpuLimit: "4",
//         memoryLimit: "32Gi",
//         gpuCount: 1,
//         cpuRequest: "2",
//         memoryRequest: "16Gi",
//     },
//     // vLLM args for A10G GPU (24GB VRAM)
//     args: [
//         "--max_model_len=8192",
//         "--gpu_memory_utilization=0.9",
//     ],
// }, {provider: kuebeconfigProvider});

// TODO: Deploy Qwen3-Coder-480B-A35B-Instruct when p4de.24xlarge capacity is available
// Qwen3-Coder is a 480B parameter MoE model (35B active) with 256K context
// Requires 8x A100 80GB GPUs with tensor parallelism (~250GB for FP8)
// Reference: https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct
// const qwen3Coder = new LLMInferenceServiceComponent("qwen3-coder-480b", {
//     modelUri: "hf://Qwen/Qwen3-Coder-480B-A35B-Instruct",
//     modelName: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
//     namespace: "default",
//     replicas: 1,
//     resources: {
//         cpuLimit: "96",
//         memoryLimit: "512Gi",
//         gpuCount: 8,  // Requires 8 GPUs for tensor parallelism
//         cpuRequest: "48",
//         memoryRequest: "256Gi",
//     },
//     // vLLM args for Qwen3-Coder with 8x GPU tensor parallelism and expert parallelism
//     args: [
//         "--tensor-parallel-size=8",
//         "--enable-expert-parallel",
//         "--max-model-len=32768",
//         "--tool-call-parser=qwen3_coder",
//         "--enable-auto-tool-choice",
//         "--gpu_memory_utilization=0.9",
//     ],
// }, {provider: kuebeconfigProvider});

