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
// The data volume (/dev/xvdb) can be pre-populated with container images via EBS snapshots
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
                volumeSize: "200Gi",  // Large data volume for container images
                volumeType: "gp3",
                iops: 10000,
                throughput: 500,
                encrypted: true,
                deleteOnTermination: true,
                // EBS snapshot with pre-cached container images can be added here
                // snapshotID: "snap-xxxxxxxxx",
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

// COMMENTED OUT - Model deployments (enable after KServe is installed)
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
}, {provider: k8sProvider, dependsOn: [kserve]});

// COMMENTED OUT FOR MIGRATION TO STANDARD KARPENTER WITH EBS SNAPSHOTS
// Deploy Meta-Llama-3-8B-Instruct using OCI storage (KServe Modelcars)
// Uses pre-packaged model image from ECR for faster startup (no HF download at runtime)
// Model image built with 99-model-oci-image project
// Runs on G5 instances with A10G GPU (24GB VRAM)
// Reference: https://kserve.github.io/website/docs/model-serving/storage/providers/oci
// const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
//     // OCI URI pointing to ECR repository with pre-packaged model
//     // Built using: cd 99-model-oci-image && pulumi up
//     modelUri: "oci://052848974346.dkr.ecr.us-west-2.amazonaws.com/kserve-models/meta-llama-meta-llama-3-8b-instruct:v1.0",
//     modelName: "meta-llama/Meta-Llama-3-8B-Instruct",
//     storageType: "oci",  // Use OCI storage via Modelcars (faster startup, cached on nodes)
//     namespace: "default",
//     replicas: 1,
//     resources: {
//         cpuLimit: "4",
//         memoryLimit: "32Gi",
//         gpuCount: 1,
//         cpuRequest: "2",
//         memoryRequest: "16Gi",
//     },
//     // No serviceAccountName needed - OCI images use standard ECR auth
//     // vLLM args for A10G GPU (24GB VRAM)
//     args: [
//         "--max_model_len=8192",
//         "--gpu_memory_utilization=0.9",
//     ],
// }, {provider: kuebeconfigProvider, dependsOn: [kserve]});


export const escName = pulumi.interpolate`${environmentResource.project}/${environmentResource.name}`
export const kubeconfig = pulumi.secret(cluster.kubeconfigJson)
