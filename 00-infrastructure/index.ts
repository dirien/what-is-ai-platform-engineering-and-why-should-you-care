import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";
import * as awsx from "@pulumi/awsx";
import * as k8s from "@pulumi/kubernetes";
import {SubnetType} from "@pulumi/awsx/ec2";
import * as pulumiservice from "@pulumi/pulumiservice";
import {KarpenterNodePoolComponent} from "./karpenterNodePoolComponent";
import {KServeComponent} from "./kserveComponent";
import {LLMInferenceServiceComponent} from "./llmInferenceServiceComponent";

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
    }
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

// Install KServe v0.16 with cert-manager, LLMInferenceService CRDs and resources
// Uses Standard deployment mode to avoid Istio/Knative dependencies
// Storage initializer memory is increased for large model downloads (Qwen2.5-7B is ~15GB)
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.16.1",
    kserveVersion: "v0.16.0",
    deploymentMode: "Standard",
    // Configure default ClusterStorageContainer resources for large model downloads
    storageInitializer: {
        memoryRequest: "8Gi",
        memoryLimit: "16Gi",
        cpuRequest: "1",
        cpuLimit: "4",
    },
}, {provider: kuebeconfigProvider, dependsOn: [gpuStandardNodePool]});

// Storage class for persistent volumes (Prometheus, Grafana)
const storageClass = new k8s.storage.v1.StorageClass("prometheus-storage-class", {
    metadata: {
        name: "auto-ebs-sc",
        annotations: {
            "storageclass.kubernetes.io/is-default-class": "true",
        },
    },
    provisioner: "ebs.csi.eks.amazonaws.com",
    volumeBindingMode: "WaitForFirstConsumer",
    parameters: {
        type: "gp3",
        encrypted: "true",
    }
}, {provider: kuebeconfigProvider});

// Metrics Server for basic Kubernetes metrics (required for HPA)
const metricsServer = new k8s.helm.v3.Release("metrics-server", {
    chart: "metrics-server",
    version: "3.13.0",
    repositoryOpts: {
        repo: "https://kubernetes-sigs.github.io/metrics-server/",
    },
    namespace: "kube-system",
}, {provider: kuebeconfigProvider});

// kube-prometheus-stack for comprehensive monitoring with Prometheus and Grafana
// Includes DCGM dashboard (ID: 12239) for GPU metrics visualization
const kubePrometheusStack = new k8s.helm.v3.Release("kube-prometheus-stack", {
    chart: "kube-prometheus-stack",
    version: "79.9.0",
    repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    namespace: "monitoring",
    createNamespace: true,
    values: {
        alertmanager: {
            enabled: false,
        },
        prometheus: {
            prometheusSpec: {
                storageSpec: {
                    volumeClaimTemplate: {
                        spec: {
                            storageClassName: storageClass.metadata.name,
                            accessModes: ["ReadWriteOnce"],
                            resources: {
                                requests: {
                                    storage: "50Gi",
                                },
                            },
                        },
                    },
                },
                // ServiceMonitor selector to pick up DCGM exporter
                serviceMonitorSelectorNilUsesHelmValues: false,
                podMonitorSelectorNilUsesHelmValues: false,
            },
        },
        grafana: {
            enabled: true,
            adminPassword: "admin", // Change in production!
            persistence: {
                enabled: true,
                storageClassName: storageClass.metadata.name,
                size: "10Gi",
            },
            // Pre-provision NVIDIA DCGM dashboard
            dashboardProviders: {
                "dashboardproviders.yaml": {
                    apiVersion: 1,
                    providers: [
                        {
                            name: "nvidia-dcgm",
                            orgId: 1,
                            folder: "NVIDIA",
                            type: "file",
                            disableDeletion: false,
                            editable: true,
                            options: {
                                path: "/var/lib/grafana/dashboards/nvidia-dcgm",
                            },
                        },
                    ],
                },
            },
            dashboards: {
                "nvidia-dcgm": {
                    "nvidia-dcgm-exporter": {
                        gnetId: 12239,
                        revision: 2,
                        datasource: "Prometheus",
                    },
                },
            },
            sidecar: {
                dashboards: {
                    enabled: true,
                },
            },
        },
        // Disable components not needed in EKS Auto Mode
        kubeStateMetrics: {
            enabled: true,
        },
        nodeExporter: {
            enabled: true,
        },
        prometheusOperator: {
            enabled: true,
        },
    },
}, {provider: kuebeconfigProvider, dependsOn: [storageClass]});

// NVIDIA DCGM Exporter for GPU metrics
// EKS Auto Mode handles GPU drivers automatically, but we need DCGM exporter for metrics
const dcgmExporter = new k8s.helm.v3.Release("dcgm-exporter", {
    chart: "dcgm-exporter",
    version: "4.6.0",
    repositoryOpts: {
        repo: "https://nvidia.github.io/dcgm-exporter/helm-charts",
    },
    namespace: "monitoring",
    values: {
        serviceMonitor: {
            enabled: true,
            interval: "15s",
            honorLabels: false,
            additionalLabels: {
                release: "kube-prometheus-stack",
            },
        },
        // Tolerate GPU nodes
        tolerations: [
            {
                key: "nvidia.com/gpu",
                operator: "Exists",
                effect: "NoSchedule",
            },
        ],
        // Only run on GPU nodes
        nodeSelector: {
            "karpenter.sh/nodepool": "gpu-standard",
        },
        // Resource limits - DCGM exporter needs ~500Mi memory on GPU nodes
        resources: {
            requests: {
                cpu: "100m",
                memory: "512Mi",
            },
            limits: {
                cpu: "500m",
                memory: "1Gi",
            },
        },
    },
}, {provider: kuebeconfigProvider, dependsOn: [kubePrometheusStack, gpuStandardNodePool]});

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

