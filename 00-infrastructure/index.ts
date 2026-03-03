import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as awsx from "@pulumi/awsx";
import * as k8s from "@pulumi/kubernetes";
import {SubnetType} from "@pulumi/awsx/ec2";
import * as pulumiservice from "@pulumi/pulumiservice";
import {KarpenterNodePoolComponent} from "./src/components/karpenterNodePoolComponent";
import {KarpenterComponent} from "./src/components/karpenterComponent";
import {AwsLbControllerComponent} from "./src/components/awsLbControllerComponent";
import {KServeComponent} from "./src/components/kserveComponent";
import {ObservabilityComponent} from "./src/components/observabilityComponent";
import {LLMInferenceServiceComponent} from "./src/components/llmInferenceServiceComponent";
// TODO(demo-day): Uncomment when H100 MIG is re-enabled
// import {GpuOperatorComponent} from "./src/components/gpuOperatorComponent";

const config = new pulumi.Config();
const clusterName = config.require("clusterName");
const ecrBaseUrl = config.get("ecrBaseUrl") || "";
const h100SnapshotId = config.get("h100SnapshotId") || "";
const gpuSnapshotId = config.get("gpuSnapshotId") || "";
const owner = config.get("owner") || "dirien";
const currentIdentity = aws.getCallerIdentity();
const currentRegion = aws.getRegion();
const tags = {
    Environment: pulumi.getStack(),
    Project: pulumi.getProject(),
    ManagedBy: "Pulumi",
    Owner: owner,
};


// VPC for EKS cluster with public and private subnets
// Tagged for Kubernetes load balancer discovery
const eksVpc = new awsx.ec2.Vpc("eks-vpc", {
    enableDnsHostnames: true,
    cidrBlock: "10.0.0.0/16",
    tags: tags,
    subnetSpecs: [
        {
            type: SubnetType.Public,
            tags: {
                ...tags,
                [`kubernetes.io/cluster/${clusterName}`]: "shared",
                "kubernetes.io/role/elb": "1",
                [`karpenter.sh/discovery`]: clusterName, // For Karpenter subnet discovery
            }
        },
        {
            type: SubnetType.Private,
            tags: {
                ...tags,
                [`kubernetes.io/cluster/${clusterName}`]: "shared",
                "kubernetes.io/role/internal-elb": "1",
                [`karpenter.sh/discovery`]: clusterName, // For Karpenter subnet discovery
            }
        },
    ],
    subnetStrategy: "Auto",
    availabilityZoneNames: ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1f"],
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
    version: "1.32",
    tags: tags,
});

// Tag the EKS cluster security group for Karpenter discovery
// This is the security group created by EKS for cluster communication
const clusterSgTag = new aws.ec2.Tag("eks-cluster-sg-karpenter-tag", {
    resourceId: cluster.eksCluster.vpcConfig.clusterSecurityGroupId,
    key: "karpenter.sh/discovery",
    value: clusterName,
});

// Security group rules for NLB health checks
// NLB with IP target type sends health checks from IPs within the VPC CIDR
// These rules allow traffic from the VPC to reach pods on specific ports
const nlbHealthCheckPorts = [
    {port: 3001, description: "MaaS frontend"},
    {port: 4000, description: "LiteLLM API"},
    {port: 8000, description: "JupyterHub proxy"},
];

nlbHealthCheckPorts.forEach(({port, description}) => {
    new aws.ec2.SecurityGroupRule(`nlb-health-check-${port}`, {
        type: "ingress",
        fromPort: port,
        toPort: port,
        protocol: "tcp",
        cidrBlocks: [eksVpc.vpc.cidrBlock],
        securityGroupId: cluster.eksCluster.vpcConfig.clusterSecurityGroupId,
        description: `Allow NLB health checks for ${description}`,
    });
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
    tags: tags,
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

/* TODO(demo-day): Uncomment H100 MIG resources when H100 capacity is available
// IAM role for H100 managed node group
const h100NodeRole = new aws.iam.Role("h100-node-role", {
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
    tags: tags,
});

const h100NodeRolePolicies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
];

h100NodeRolePolicies.forEach((policyArn, index) => {
    new aws.iam.RolePolicyAttachment(`h100-node-policy-${index}`, {
        role: h100NodeRole.name,
        policyArn: policyArn,
    });
});

// Launch template for H100 nodes with EBS snapshot pre-caching
const h100LaunchTemplate = new aws.ec2.LaunchTemplate("h100-launch-template", {
    blockDeviceMappings: [{
        deviceName: "/dev/xvdb",
        ebs: {
            volumeSize: 500,
            volumeType: "gp3",
            iops: 16000,
            throughput: 1000,
            encrypted: "true",
            deleteOnTermination: "true",
            snapshotId: h100SnapshotId || undefined,
        },
    }],
    userData: Buffer.from(`MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="BOUNDARY"

--BOUNDARY
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
# Mount pre-cached image data volume
if [ -b /dev/xvdb ]; then
    mkdir -p /mnt/data
    mount /dev/xvdb /mnt/data 2>/dev/null || (mkfs.xfs /dev/xvdb && mount /dev/xvdb /mnt/data)
    # Symlink containerd content to data volume if cached data exists
    if [ -d /mnt/data/containerd ]; then
        systemctl stop containerd
        rm -rf /var/lib/containerd
        ln -s /mnt/data/containerd /var/lib/containerd
        systemctl start containerd
    fi
fi

--BOUNDARY--
`).toString('base64'),
    tags: tags,
});
END TODO(demo-day) */

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
    tags: tags,
});

// EKS Addons - managed by AWS for automatic updates and compatibility
// Note: vpc-cni and kube-proxy are automatically created by the eks.Cluster component

// CoreDNS - Cluster DNS (v1.11.4 is the latest for EKS 1.32)
const coreDnsAddon = new aws.eks.Addon("coredns", {
    clusterName: cluster.eksCluster.name,
    addonName: "coredns",
    addonVersion: "v1.11.4-eksbuild.28",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
    tags: tags,
}, {dependsOn: [systemNodeGroup]});

// EKS Pod Identity Agent - For IRSA replacement (modern pod identity)
const podIdentityAddon = new aws.eks.Addon("eks-pod-identity-agent", {
    clusterName: cluster.eksCluster.name,
    addonName: "eks-pod-identity-agent",
    addonVersion: "v1.3.10-eksbuild.1",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
    tags: tags,
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
    tags: tags,
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
    tags: tags,
}, {dependsOn: [podIdentityAddon]});

const ebsCsiAddon = new aws.eks.Addon("aws-ebs-csi-driver", {
    clusterName: cluster.eksCluster.name,
    addonName: "aws-ebs-csi-driver",
    addonVersion: "v1.43.0-eksbuild.1",
    resolveConflictsOnCreate: "OVERWRITE",
    resolveConflictsOnUpdate: "OVERWRITE",
    tags: tags,
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
    clusterName: cluster.eksCluster.name,
    clusterEndpoint: cluster.eksCluster.endpoint,
    clusterSecurityGroupId: cluster.nodeSecurityGroup.apply(sg => sg!.id),
    karpenterVersion: "1.9.0",
    namespace: "kube-system",
    awsRegion: currentRegion.then(r => r.region),
    awsAccountId: currentIdentity.then(id => id.accountId),
    tags: tags,
}, {
    provider: k8sProvider,
    dependsOn: [podIdentityAddon, systemNodeGroup],
});

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
        ...tags,
        "karpenter.sh/discovery": clusterName,
        "Name": `${clusterName}-general-node`,
    },
}, {provider: k8sProvider});

// NodePool for general workloads (non-GPU) - Prometheus, Grafana, KServe controllers, etc.
const generalNodePool = new KarpenterNodePoolComponent("general", {
    nodeClassName: generalNodeClass.metadata.name,
    instanceTypes: ["m6i.large", "m6i.xlarge", "m6i.2xlarge", "m7i.large", "m7i.xlarge"],
    capacityTypes: ["on-demand"],  // On-demand only — stateful workloads (JupyterHub, Grafana, Prometheus) need stable nodes
    limits: {
        cpu: 100,
    },
    // No taints - general workloads can schedule here
    disruption: {
        consolidationPolicy: "WhenEmptyOrUnderutilized",
        consolidateAfter: "1m",
    },
}, {provider: k8sProvider, dependsOn: [generalNodeClass]});

// gVisor (runsc) support for agent-sandbox workloads
// AL2023 + Karpenter uses nodeadm, which requires MIME multipart userData.
// A plain bash script is silently ignored. We wrap the gVisor install in a
// MIME archive so cloud-init executes it after nodeadm bootstraps the node.
const gvisorUserData = `MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="BOUNDARY"

--BOUNDARY
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
set -euo pipefail

# Install gVisor (runsc + containerd shim)
ARCH=$(uname -m)
URL="https://storage.googleapis.com/gvisor/releases/release/latest/\${ARCH}"
curl -fsSL "\${URL}/runsc" -o /usr/local/bin/runsc
curl -fsSL "\${URL}/containerd-shim-runsc-v1" -o /usr/local/bin/containerd-shim-runsc-v1
chmod +x /usr/local/bin/runsc /usr/local/bin/containerd-shim-runsc-v1

# Register runsc runtime with containerd
# AL2023 EKS uses containerd v2.x which renamed the CRI plugin:
#   v1.x: plugins."io.containerd.grpc.v1.cri"
#   v2.x: plugins.'io.containerd.cri.v1.runtime'
cat >> /etc/containerd/config.toml << 'TOML'
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"
TOML

systemctl restart containerd

--BOUNDARY--
`;

// EC2NodeClass for gVisor nodes — AL2023 with runsc installed via userData
const gvisorNodeClass = karpenter.createEC2NodeClass("gvisor-nodeclass", {
    name: "gvisor-al2023",
    amiFamily: "AL2023",
    blockDeviceMappings: [{
        deviceName: "/dev/xvda",
        rootVolume: true,
        ebs: {
            volumeSize: "100Gi",
            volumeType: "gp3",
            iops: 3000,
            throughput: 125,
            encrypted: true,
            deleteOnTermination: true,
        },
    }],
    userData: gvisorUserData,
    tags: {
        ...tags,
        "karpenter.sh/discovery": clusterName,
        "Name": `${clusterName}-gvisor-node`,
    },
}, {provider: k8sProvider});

// NodePool for gVisor agent workloads
new KarpenterNodePoolComponent("gvisor-pool", {
    poolName: "gvisor-pool",
    nodeClassName: gvisorNodeClass.metadata.name,
    instanceTypes: ["m5.2xlarge", "m5.4xlarge"],
    capacityTypes: ["on-demand"],
    labels: {"runtime": "gvisor"},
    taints: [{key: "sandbox.gvisor/enabled", value: "true", effect: "NoSchedule"}],
    limits: {cpu: 100},
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "1m",
    },
}, {provider: k8sProvider, dependsOn: [gvisorNodeClass]});

// RuntimeClass for gVisor — pods with runtimeClassName: gvisor are auto-directed
// to nodes with label runtime=gvisor and tolerate the sandbox taint
new k8s.node.v1.RuntimeClass("gvisor-runtimeclass", {
    metadata: {name: "gvisor"},
    handler: "runsc",
    scheduling: {
        nodeSelector: {"runtime": "gvisor"},
        tolerations: [{key: "sandbox.gvisor/enabled", operator: "Equal", value: "true", effect: "NoSchedule"}],
    },
}, {provider: k8sProvider});

// agent-sandbox — manages isolated sandbox pods for coding agents
// Installs core CRDs + controller, then extensions (SandboxTemplate, SandboxClaim, WarmPool)
const agentSandboxVersion = "v0.1.1";

const agentSandboxCore = new k8s.yaml.ConfigFile("agent-sandbox-core", {
    file: `https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${agentSandboxVersion}/manifest.yaml`,
}, {provider: k8sProvider, dependsOn: [systemNodeGroup]});

new k8s.yaml.ConfigFile("agent-sandbox-extensions", {
    file: `https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${agentSandboxVersion}/extensions.yaml`,
    resourcePrefix: "ext",
}, {provider: k8sProvider, dependsOn: [agentSandboxCore]});

/* TODO(demo-day): Uncomment H100 MIG node group when capacity is available
// H100 MIG managed node group with AL2023 NVIDIA AMI
// Uses GPU Operator for MIG management (device plugin + MIG manager)
const h100NodeGroup = new eks.ManagedNodeGroup("h100-mig-nodes", {
    cluster: cluster,
    nodeGroupName: "h100-mig-nodes",
    nodeRole: h100NodeRole,
    // Switch back to ["p5.4xlarge"] when capacity is available — much cheaper ($13/hr vs $98/hr).
    // Mixed ["p5.4xlarge", "p5.48xlarge"] doesn't work: p5.48xlarge requires placement groups + EFA, p5.4xlarge doesn't.
    instanceTypes: ["p5.48xlarge"],
    scalingConfig: {
        minSize: 0,
        maxSize: 1,
        desiredSize: 1,
    },
    subnetIds: eksVpc.privateSubnetIds,
    amiType: "AL2023_x86_64_NVIDIA",
    launchTemplate: {
        id: h100LaunchTemplate.id,
        version: pulumi.interpolate`${h100LaunchTemplate.latestVersion}`,
    },
    labels: {
        "gpu-type": "h100",
        "nvidia.com/mig.config": "all-3g.40gb",
    },
    taints: [{
        key: "nvidia.com/gpu",
        value: "h100",
        effect: "NO_SCHEDULE",
    }],
    tags: tags,
});

// GPU Operator for NVIDIA MIG management on H100 nodes
const gpuOperator = new GpuOperatorComponent("gpu-operator", {
    namespace: "gpu-operator",
}, { provider: k8sProvider, dependsOn: [h100NodeGroup, generalNodePool] });
END TODO(demo-day) */

// EC2NodeClass for GPU workloads (Bottlerocket with NVIDIA support)
// Bottlerocket NVIDIA variant auto-includes NVIDIA drivers + device plugin
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
                volumeSize: "250Gi",
                volumeType: "gp3",
                iops: 16000,
                throughput: 1000,
                encrypted: true,
                deleteOnTermination: true,
                snapshotID: gpuSnapshotId || undefined,
            },
        },
    ],
    tags: {
        ...tags,
        "karpenter.sh/discovery": clusterName,
        "Name": `${clusterName}-gpu-node`,
    },
}, {provider: k8sProvider});

// NodePool for GPU workloads (G5 instances with A10G GPUs)
const gpuNodePool = new KarpenterNodePoolComponent("gpu-standard", {
    nodeClassName: gpuNodeClass.metadata.name,
    instanceTypes: ["g5.xlarge", "g5.2xlarge", "g5.4xlarge"],
    capacityTypes: ["on-demand"],
    limits: {
        cpu: 1000,
    },
    taints: [{
        key: "nvidia.com/gpu",
        value: "true",
        effect: "NoSchedule",
    }],
    disruption: {
        consolidationPolicy: "WhenEmpty",
        consolidateAfter: "1m",
    },
}, {provider: k8sProvider, dependsOn: [gpuNodeClass]});

// AWS Load Balancer Controller - manages ALB/NLB for Ingress and Service resources
// Uses Pod Identity for IAM authentication (same as Karpenter)
const awsLbController = new AwsLbControllerComponent("aws-lb-controller", {
    clusterName: cluster.eksCluster.name,
    vpcId: eksVpc.vpcId,
    chartVersion: "3.0.0",
    namespace: "kube-system",
    awsRegion: currentRegion.then(r => r.region),
    tags: tags,
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
    infra:vpcId: \${stackRefs.aws.vpcId}
    infra:privateSubnetIds: \${stackRefs.aws.privateSubnetIds}
    infra:clusterSecurityGroupId: \${stackRefs.aws.clusterSecurityGroupId}
    infra:clusterName: \${stackRefs.aws.clusterName}
  files:
    KUBECONFIG: \${stackRefs.aws.kubeconfig}
`),
}, {
    dependsOn: [cluster],
});

// KServe for model serving with LLMInferenceService support
const kserve = new KServeComponent("kserve", {
    certManagerVersion: "v1.19.3",
    kserveVersion: "v0.16.0",
    deploymentMode: "RawDeployment",
    lwsVersion: "0.7.0",
    storageInitializer: {memoryRequest: "16Gi", memoryLimit: "64Gi", cpuRequest: "2", cpuLimit: "8"},
    llmisvController: {cpuRequest: "200m", cpuLimit: "1", memoryRequest: "512Mi", memoryLimit: "2Gi"},
}, {provider: k8sProvider, dependsOn: [generalNodePool, gpuNodePool]});

// Observability stack: Prometheus, Grafana, DCGM Exporter, Metrics Server
// Uses the gp3 StorageClass created above for persistent volumes
const observability = new ObservabilityComponent("observability", {
    namespace: "monitoring",
    storageClassName: "gp3",  // Use the gp3 StorageClass created in index.ts
    metricsServer: {enabled: true, version: "3.13.0"},
    prometheusStack: {version: "82.2.1", alertmanagerEnabled: false, storageSize: "50Gi"},
    grafana: {enabled: true, adminPassword: "admin", storageSize: "10Gi"},
    dcgmExporter: {
        enabled: true,
        version: "4.8.1",
        nodeSelector: {"karpenter.k8s.aws/instance-gpu-count": "1"},
        tolerations: [{key: "nvidia.com/gpu", operator: "Exists", effect: "NoSchedule"}],
        memoryRequest: "512Mi",
        memoryLimit: "1Gi",
    },
}, {provider: k8sProvider, dependsOn: [generalNodePool, gpuNodePool, gp3StorageClass]});

// Deploy Qwen2.5-7B-Instruct using KServe LLMInferenceService
// Runs on G5 instances with A10G GPU (24GB VRAM)
const qwen2Model = new LLMInferenceServiceComponent("qwen2-7b-instruct", {
    modelUri: `oci://${ecrBaseUrl}/kserve-models/qwen-qwen2-5-7b-instruct:latest`,
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
    args: [
        "--served-model-name=Qwen/Qwen2.5-7B-Instruct",
        "--max_model_len=32768",
        "--gpu_memory_utilization=0.9",
        "--enable-auto-tool-choice",
        "--tool-call-parser=hermes",
    ],
    startupProbe: {
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 60,
    },
}, {provider: k8sProvider, dependsOn: [kserve]});

// Deploy Qwen3-8B using KServe LLMInferenceService
// Runs on G5 instances with A10G GPU (24GB VRAM)
const qwen3Model = new LLMInferenceServiceComponent("qwen3-8b", {
    modelUri: `oci://${ecrBaseUrl}/kserve-models/qwen-qwen3-8b:latest`,
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
    args: [
        "--served-model-name=Qwen/Qwen3-8B",
        "--max_model_len=20480",
        "--gpu_memory_utilization=0.9",
        "--enable-auto-tool-choice",
        "--tool-call-parser=hermes",
    ],
    startupProbe: {
        initialDelaySeconds: 60,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 60,
    },
}, {provider: k8sProvider, dependsOn: [kserve]});

/* TODO(demo-day): Uncomment MIG-based LLM deployments when H100 is available
// Deploy gpt-oss-20b using KServe LLMInferenceService on H100 MIG slice
const gptOss20b = new LLMInferenceServiceComponent("gpt-oss-20b", {
    modelUri: `oci://${"${ecrBaseUrl}"}/kserve-models/openai-gpt-oss-20b:latest`,
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
}, {provider: k8sProvider, dependsOn: [kserve, gpuOperator]});

// Deploy Qwen3-30B-A3B (MoE) using KServe LLMInferenceService on H100 MIG slice
const qwen3Moe = new LLMInferenceServiceComponent("qwen3-30b-a3b", {
    modelUri: `oci://${"${ecrBaseUrl}"}/kserve-models/qwen-qwen3-30b-a3b:latest`,
    modelName: "Qwen/Qwen3-30B-A3B",
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
        "--max_model_len=16384",
        "--enable-auto-tool-choice",
        "--tool-call-parser=hermes",
    ],
    tolerations: [{key: "nvidia.com/gpu", operator: "Equal", value: "h100", effect: "NoSchedule"}],
    startupProbe: {
        initialDelaySeconds: 120,
        periodSeconds: 30,
        timeoutSeconds: 30,
        failureThreshold: 60,
    },
}, {provider: k8sProvider, dependsOn: [kserve, gpuOperator]});
END TODO(demo-day) */

export const escName = pulumi.interpolate`${environmentResource.project}/${environmentResource.name}`
export const kubeconfig = pulumi.secret(cluster.kubeconfigJson)

// Networking outputs (consumed by 01-maas via ESC)
export const vpcId = eksVpc.vpcId;
export const privateSubnetIds = eksVpc.privateSubnetIds;
export const clusterSecurityGroupId = cluster.eksCluster.vpcConfig.clusterSecurityGroupId;
export { clusterName };
