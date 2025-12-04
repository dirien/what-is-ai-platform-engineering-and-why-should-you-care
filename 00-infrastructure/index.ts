import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as awsx from "@pulumi/awsx";
import * as k8s from "@pulumi/kubernetes";
import {SubnetType} from "@pulumi/awsx/ec2";
import * as pulumiservice from "@pulumi/pulumiservice";
import {KarpenterNodePoolComponent} from "./karpenterNodePoolComponent";
import {KarpenterComponent} from "./karpenterComponent";
import {AwsLbControllerComponent} from "./awsLbControllerComponent";
import {KServeComponent} from "./kserveComponent";
import {ObservabilityComponent} from "./observabilityComponent";
import {LLMInferenceServiceComponent} from "./llmInferenceServiceComponent";

const config = new pulumi.Config();
const clusterName = config.require("clusterName");
const currentIdentity = aws.getCallerIdentity();
const currentRegion = aws.getRegion();


// VPC for EKS cluster with public and private subnets
// Tagged for Kubernetes load balancer discovery
const eksVpc = new awsx.ec2.Vpc("eks-vpc", {
    enableDnsHostnames: true,
    cidrBlock: "10.0.0.0/16",
    subnetSpecs: [
        {
            type: SubnetType.Public,
            tags: {
                [`kubernetes.io/cluster/${clusterName}`]: "shared",
                "kubernetes.io/role/elb": "1",
                [`karpenter.sh/discovery`]: clusterName, // For Karpenter subnet discovery
            }
        },
        {
            type: SubnetType.Private,
            tags: {
                [`kubernetes.io/cluster/${clusterName}`]: "shared",
                "kubernetes.io/role/internal-elb": "1",
                [`karpenter.sh/discovery`]: clusterName, // For Karpenter subnet discovery
            }
        },
    ],
    subnetStrategy: "Auto"
});

// Standard EKS cluster (not Auto Mode) with managed node group for system workloads
// Karpenter will be installed via Helm to manage GPU nodes with EBS snapshot support
const cluster = new eks.Cluster("eks-cluster", {
    name: clusterName,
    // Use API authentication mode for access entries
    authenticationMode: eks.AuthenticationMode.Api,
    vpcId: eksVpc.vpcId,
    publicSubnetIds: eksVpc.publicSubnetIds,
    privateSubnetIds: eksVpc.privateSubnetIds,
    // Standard cluster - no Auto Mode
    // We'll use a managed node group for system workloads and Karpenter for GPU nodes
    skipDefaultNodeGroup: true,
    // Enable OIDC provider for IRSA (IAM Roles for Service Accounts)
    createOidcProvider: true,
    // EKS version
    version: "1.31",
});

// Tag the EKS cluster security group for Karpenter discovery
// This is the security group created by EKS for cluster communication
const clusterSgTag = new aws.ec2.Tag("eks-cluster-sg-karpenter-tag", {
    resourceId: cluster.eksCluster.vpcConfig.clusterSecurityGroupId,
    key: "karpenter.sh/discovery",
    value: clusterName,
});

// IAM role for managed node group
const nodeRole = new aws.iam.Role("system-node-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ec2.amazonaws.com",
            },
        }],
    }),
});

// Attach required policies for EKS worker nodes
const nodeRolePolicies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
];

nodeRolePolicies.forEach((policyArn, index) => {
    new aws.iam.RolePolicyAttachment(`system-node-policy-${index}`, {
        role: nodeRole.name,
        policyArn: policyArn,
    });
});

// Managed node group for system workloads (Karpenter controller, CoreDNS, etc.)
// These nodes run cluster-critical workloads that shouldn't be on spot/preemptible instances
const systemNodeGroup = new eks.ManagedNodeGroup("system-nodes", {
    cluster: cluster,
    nodeGroupName: "system-nodes",
    nodeRole: nodeRole,
    instanceTypes: ["m6i.large"],
    scalingConfig: {
        minSize: 2,
        maxSize: 4,
        desiredSize: 2,
    },
    subnetIds: eksVpc.privateSubnetIds,
    amiType: "AL2023_x86_64_STANDARD",
    labels: {
        "node-role": "system",
    },
    taints: [{
        key: "CriticalAddonsOnly",
        value: "true",
        effect: "NO_SCHEDULE",
    }],
});

// EKS Addons - managed by AWS for automatic updates and compatibility
// Note: vpc-cni and kube-proxy are automatically created by the eks.Cluster component

// CoreDNS - Cluster DNS (v1.11.4 is the latest for EKS 1.31)
const coreDnsAddon = new aws.eks.Addon("coredns", {
    clusterName: cluster.eksCluster.name,
    addonName: "coredns",
    addonVersion: "v1.11.4-eksbuild.24",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
}, {dependsOn: [systemNodeGroup]});

// EKS Pod Identity Agent - For IRSA replacement (modern pod identity)
const podIdentityAddon = new aws.eks.Addon("eks-pod-identity-agent", {
    clusterName: cluster.eksCluster.name,
    addonName: "eks-pod-identity-agent",
    addonVersion: "v1.3.10-eksbuild.1",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
}, {dependsOn: [systemNodeGroup]});

// EBS CSI Driver - Required for persistent volumes with EBS
// Creates IAM role with Pod Identity for the ebs-csi-controller-sa service account
const ebsCsiRole = new aws.iam.Role("ebs-csi-role", {
    name: pulumi.interpolate`AmazonEKS_EBS_CSI_DriverRole-${clusterName}`,
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Service: "pods.eks.amazonaws.com",
            },
            Action: [
                "sts:AssumeRole",
                "sts:TagSession",
            ],
        }],
    }),
});

new aws.iam.RolePolicyAttachment("ebs-csi-policy-attachment", {
    role: ebsCsiRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
});

const ebsCsiPodIdentity = new aws.eks.PodIdentityAssociation("ebs-csi-pod-identity", {
    clusterName: cluster.eksCluster.name,
    namespace: "kube-system",
    serviceAccount: "ebs-csi-controller-sa",
    roleArn: ebsCsiRole.arn,
}, {dependsOn: [podIdentityAddon]});

const ebsCsiAddon = new aws.eks.Addon("aws-ebs-csi-driver", {
    clusterName: cluster.eksCluster.name,
    addonName: "aws-ebs-csi-driver",
    addonVersion: "v1.43.0-eksbuild.1",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
}, {dependsOn: [systemNodeGroup, ebsCsiPodIdentity]});

// Kubernetes provider for Karpenter and other K8s resources
const k8sProvider = new k8s.Provider("k8s-provider", {
    kubeconfig: cluster.kubeconfigJson,
    enableServerSideApply: true,
});

// Default gp3 StorageClass for EBS volumes
// This is a general-purpose storage class used by all workloads requiring persistent storage
const gp3StorageClass = new k8s.storage.v1.StorageClass("gp3-storage-class", {
    metadata: {
        name: "gp3",
        annotations: {
            "storageclass.kubernetes.io/is-default-class": "true",
        },
    },
    provisioner: "ebs.csi.aws.com",
    volumeBindingMode: "WaitForFirstConsumer",
    reclaimPolicy: "Delete",
    allowVolumeExpansion: true,
    parameters: {
        type: "gp3",
        encrypted: "true",
    },
}, {provider: k8sProvider, dependsOn: [ebsCsiAddon]});

// Install Karpenter using Pod Identity (no IRSA needed)
// Karpenter manages GPU nodes with EBS snapshot support for faster container startup
const karpenter = new KarpenterComponent("karpenter", {
    clusterName: clusterName,
    clusterEndpoint: cluster.eksCluster.endpoint,
    clusterSecurityGroupId: cluster.nodeSecurityGroup.apply(sg => sg!.id),
    karpenterVersion: "1.8.2",
    namespace: "kube-system",
    awsRegion: currentRegion.then(r => r.region),
    awsAccountId: currentIdentity.then(id => id.accountId),
}, {
    provider: k8sProvider,
    dependsOn: [podIdentityAddon, systemNodeGroup],
});

// EC2NodeClass for GPU nodes with Bottlerocket and EBS snapshot support
// Uses Bottlerocket for fast boot times and optimized container runtime
// The data volume (/dev/xvdb) is pre-populated with container images via EBS snapshot
// Snapshot contains: Meta Llama 3 8B, Qwen 2.5 7B, Qwen 3 8B, llm-d-dev images
const gpuNodeClass = karpenter.createEC2NodeClass("gpu-nodeclass", {
    name: "gpu-bottlerocket",
    amiFamily: "Bottlerocket",
    blockDeviceMappings: [
        {
            deviceName: "/dev/xvda",
            rootVolume: true,
            ebs: {
                volumeSize: "4Gi",
                volumeType: "gp3",
                encrypted: true,
                deleteOnTermination: true,
            },
        },
        {
            deviceName: "/dev/xvdb",
            ebs: {
                volumeSize: "250Gi",  // Data volume for pre-cached model images
                volumeType: "gp3",
                iops: 16000,          // Max gp3 IOPS for faster container/model loading
                throughput: 1000,     // Max gp3 throughput (MB/s) for faster sequential reads
                encrypted: true,
                deleteOnTermination: true,
                // EBS snapshot with pre-cached container images (built via 99-model-oci-image)
                // Contains: meta-llama-3-8b-instruct, qwen2.5-7b-instruct, qwen3-8b, gpt-oss-20b, llm-d-dev:v0.2.2
                snapshotID: "snap-0dca38ea429a621b1",
            },
        },
    ],
    tags: {
        "karpenter.sh/discovery": clusterName,
        "Name": `${clusterName}-gpu-node`,
    },
}, clusterName, {provider: k8sProvider});

// EC2NodeClass for general workloads (non-GPU)
const generalNodeClass = karpenter.createEC2NodeClass("general-nodeclass", {
    name: "general-bottlerocket",
    amiFamily: "Bottlerocket",
    blockDeviceMappings: [
        {
            deviceName: "/dev/xvda",
            rootVolume: true,
            ebs: {
                volumeSize: "4Gi",
                volumeType: "gp3",
                encrypted: true,
                deleteOnTermination: true,
            },
        },
        {
            deviceName: "/dev/xvdb",
            ebs: {
                volumeSize: "100Gi",
                volumeType: "gp3",
                iops: 3000,
                throughput: 125,
                encrypted: true,
                deleteOnTermination: true,
            },
        },
    ],
    tags: {
        "karpenter.sh/discovery": clusterName,
        "Name": `${clusterName}-general-node`,
    },
}, clusterName, {provider: k8sProvider});

// NodePool for general workloads (non-GPU) - Prometheus, Grafana, KServe controllers, etc.
const generalNodePool = new KarpenterNodePoolComponent("general", {
    nodeClassName: "general-bottlerocket",
    instanceTypes: ["m6i.large", "m6i.xlarge", "m6i.2xlarge", "m7i.large", "m7i.xlarge"],
    capacityTypes: ["spot", "on-demand"],  // Use spot for cost savings
    limits: {
        cpu: 100,
    },
    // No taints - general workloads can schedule here
    disruption: {
        consolidationPolicy: "WhenEmptyOrUnderutilized",
        consolidateAfter: "1m",
    },
}, {provider: k8sProvider, dependsOn: [generalNodeClass]});

// NodePool for GPU workloads (G5 instances with A10G GPUs)
const gpuNodePool = new KarpenterNodePoolComponent("gpu-standard", {
    nodeClassName: "gpu-bottlerocket",
    instanceTypes: ["g5.xlarge", "g5.2xlarge", "g5.4xlarge"],
    capacityTypes: ["on-demand"],
    limits: {
        cpu: 1000,
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
        consolidateAfter: "1m",
    },
}, {provider: k8sProvider, dependsOn: [gpuNodeClass]});

// AWS Load Balancer Controller - manages ALB/NLB for Ingress and Service resources
// Uses Pod Identity for IAM authentication (same as Karpenter)
const awsLbController = new AwsLbControllerComponent("aws-lb-controller", {
    clusterName: clusterName,
    vpcId: eksVpc.vpcId,
    chartVersion: "1.16.0",
    namespace: "kube-system",
    awsRegion: currentRegion.then(r => r.region),
}, {
    provider: k8sProvider,
    dependsOn: [podIdentityAddon, systemNodeGroup],
});

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


// TODO: Add A100 NodePool for large MoE models when needed
// const gpuA100NodePool = new KarpenterNodePoolComponent("gpu-a100", {
//     nodeClassName: "gpu-bottlerocket",  // Reuse same EC2NodeClass
//     instanceTypes: ["p4de.24xlarge"],   // 8x A100 80GB GPUs
//     capacityTypes: ["on-demand"],
//     limits: { cpu: 2000 },
//     taints: [{ key: "nvidia.com/gpu", value: "true", effect: "NoSchedule" }],
//     disruption: { consolidationPolicy: "WhenEmpty", consolidateAfter: "5m" },
// }, { provider: k8sProvider, dependsOn: [gpuNodeClass] });

// KServe for model serving with LLMInferenceService support
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.16.1",
    kserveVersion: "v0.16.0",
    deploymentMode: "Standard",
    storageInitializer: {memoryRequest: "16Gi", memoryLimit: "64Gi", cpuRequest: "2", cpuLimit: "8"},
    llmisvController: {cpuRequest: "200m", cpuLimit: "1", memoryRequest: "512Mi", memoryLimit: "2Gi"},
}, {provider: k8sProvider, dependsOn: [generalNodePool, gpuNodePool]});

// Observability stack: Prometheus, Grafana, DCGM Exporter, Metrics Server
// Uses the gp3 StorageClass created above for persistent volumes
const observability = new ObservabilityComponent("observability", {
    namespace: "monitoring",
    storageClassName: "gp3",  // Use the gp3 StorageClass created in index.ts
    metricsServer: {enabled: true, version: "3.13.0"},
    prometheusStack: {version: "79.9.0", alertmanagerEnabled: false, storageSize: "50Gi"},
    grafana: {enabled: true, adminPassword: "admin", storageSize: "10Gi"},
    dcgmExporter: {
        enabled: true,
        version: "4.6.0",
        nodeSelector: {"karpenter.k8s.aws/instance-gpu-count": "1"},  // Updated for Karpenter labels
        tolerations: [{key: "nvidia.com/gpu", operator: "Exists", effect: "NoSchedule"}],
        memoryRequest: "512Mi",
        memoryLimit: "1Gi",
    },
}, {provider: k8sProvider, dependsOn: [generalNodePool, gpuNodePool, gp3StorageClass]});

// Deploy Qwen2.5-7B-Instruct using KServe LLMInferenceService (v1alpha1)
// Uses OCI storage for faster startup - model image is pre-cached on GPU nodes
// Runs on G5 instances with A10G GPU (24GB VRAM)
// Reference: https://kserve.github.io/website/docs/getting-started/genai-first-llmisvc
const qwen2Model = new LLMInferenceServiceComponent("qwen2-7b-instruct", {
    modelUri: "oci://052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen2-5-7b-instruct:latest",
    modelName: "Qwen/Qwen2.5-7B-Instruct",
    storageType: "oci",
    namespace: "default",
    replicas: 1,
    resources: {
        cpuLimit: "4",
        memoryLimit: "32Gi",
        gpuCount: 1,
        cpuRequest: "2",
        memoryRequest: "16Gi",
    },
    // vLLM args for A10G GPU (24GB VRAM) - 32K native context
    args: [
        "--max_model_len=32768",
        "--gpu_memory_utilization=0.9",
    ],
    // Startup probe: 32K context needs ~5 min for model load + CUDA graph compilation
    startupProbe: {
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 20,  // 60s + 20*30s = 11 min max
    },
}, {provider: k8sProvider, dependsOn: [kserve]});


// Deploy Meta Llama 3 8B Instruct using KServe LLMInferenceService
// Uses OCI storage for faster startup - model image is pre-cached on GPU nodes via EBS snapshot
// The snapshot (snap-0dca38ea429a621b1) contains the container image, eliminating download time
const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
    modelUri: "oci://052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/meta-llama-meta-llama-3-8b-instruct:latest",
    modelName: "meta-llama/Meta-Llama-3-8B-Instruct",
    storageType: "oci",
    namespace: "default",
    replicas: 1,
    resources: {
        cpuLimit: "4",
        memoryLimit: "32Gi",
        gpuCount: 1,
        cpuRequest: "2",
        memoryRequest: "16Gi",
    },
    // vLLM args for A10G GPU (24GB VRAM) - 8K native context
    args: [
        "--max_model_len=8192",
        "--gpu_memory_utilization=0.9",
    ],
    // Startup probe: 8K context is faster, ~3 min for model load
    startupProbe: {
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 10,  // 60s + 10*30s = 6 min max
    },
}, {provider: k8sProvider, dependsOn: [kserve]});

// Deploy Qwen3-8B using KServe LLMInferenceService
// Uses OCI storage - model image is pre-cached on GPU nodes via EBS snapshot
// Note: Qwen3-8B (8.2B params) is larger than Qwen2.5-7B, limiting KV cache to ~20K context on A10G
const qwen3Model = new LLMInferenceServiceComponent("qwen3-8b", {
    modelUri: "oci://052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-8b:latest",
    modelName: "Qwen/Qwen3-8B",
    storageType: "oci",
    namespace: "default",
    replicas: 1,
    resources: {
        cpuLimit: "4",
        memoryLimit: "32Gi",
        gpuCount: 1,
        cpuRequest: "2",
        memoryRequest: "16Gi",
    },
    // vLLM args for A10G GPU (24GB VRAM) - 20K context (limited by KV cache memory)
    // Native 32K requires ~4.5GB KV cache but only ~3.2GB available after model load
    args: [
        "--max_model_len=20480",
        "--gpu_memory_utilization=0.9",
    ],
    // Startup probe: ~5 min for model load + CUDA graph compilation
    startupProbe: {
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 20,  // 60s + 20*30s = 11 min max
    },
}, {provider: k8sProvider, dependsOn: [kserve]});

export const escName = pulumi.interpolate`${environmentResource.project}/${environmentResource.name}`
export const kubeconfig = pulumi.secret(cluster.kubeconfigJson)
