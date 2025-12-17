import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as dockerBuild from "@pulumi/docker-build";
import { EcrRepositoryComponent } from "./ecrComponent";
import { JupyterHubComponent } from "./jupyterhubComponent";
import { MaaSComponent } from "./maasComponent";

// Configuration
const config = new pulumi.Config();
const appName = config.get("appName") || "maas";
const environment = pulumi.getStack();

// Tags for all resources
const tags = {
    Environment: environment,
    Project: appName,
    ManagedBy: "Pulumi",
};

// =============================================================================
// Kubernetes Provider (from ESC environment)
// =============================================================================

// The kubeconfig is provided via ESC environment import in Pulumi.dev.yaml
// ESC injects kubernetes:kubeconfig into the Pulumi config
const k8sConfig = new pulumi.Config("kubernetes");
const kubeconfig = k8sConfig.require("kubeconfig");

const k8sProvider = new k8s.Provider("k8s-provider", {
    kubeconfig: kubeconfig,
    enableServerSideApply: true,
});

// =============================================================================
// ECR Repository
// =============================================================================

// Create ECR repository using component resource
const ecr = new EcrRepositoryComponent(`${appName}-ecr`, {
    repositoryName: appName,
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true, // Set to false for production
    tags: tags,
});

// =============================================================================
// Docker Image Build and Push
// =============================================================================

// Get ECR authorization token for Docker registry authentication
const authToken = aws.ecr.getAuthorizationTokenOutput({
    registryId: ecr.registryId,
});

// Build and push Docker image using docker-build provider
// This provider uses Docker Buildx with BuildKit for improved performance
const image = new dockerBuild.Image(`${appName}-image`, {
    // Image tag includes environment for easy identification
    tags: [
        pulumi.interpolate`${ecr.repositoryUrl}:${environment}`,
        pulumi.interpolate`${ecr.repositoryUrl}:latest`,
    ],
    // Build context is the app directory
    context: {
        location: "../app",
    },
    // Dockerfile location
    dockerfile: {
        location: "../app/Dockerfile",
    },
    // Build for linux/amd64 architecture (EKS nodes)
    platforms: [dockerBuild.Platform.Linux_amd64],
    // Build arguments
    buildArgs: {
        NODE_ENV: "production",
    },
    // Push to ECR
    push: true,
    // ECR registry credentials
    registries: [{
        address: ecr.repositoryUrl,
        username: authToken.userName,
        password: pulumi.secret(authToken.password),
    }],
});

// =============================================================================
// JupyterHub Deployment
// =============================================================================

// Deploy JupyterHub for notebook support (in its own namespace)
// Provides Jupyter notebooks with LiteLLM integration for data scientists
const jupyterhub = new JupyterHubComponent("jupyterhub", {
    namespace: "jupyterhub",
    chartVersion: "4.3.2-0.dev.git.7211.hba50290a",
    // LiteLLM URL will be updated after MaaS component is created
    litellmServiceUrl: "http://maas-litellm.maas.svc.cluster.local:4000",
    storageSize: "10Gi",
    idleTimeout: 3600, // 1 hour
    adminUsers: ["admin"],
    enableLoadBalancer: true, // Expose JupyterHub via AWS LoadBalancer
    profiles: [
        {
            displayName: "CPU - Standard",
            description: "Standard CPU notebook for data analysis and development",
            cpuLimit: "2",
            memoryLimit: "4Gi",
            cpuRequest: "500m",
            memoryRequest: "1Gi",
            default: true,
        },
        {
            displayName: "CPU - Large",
            description: "Large CPU notebook for intensive data processing",
            cpuLimit: "4",
            memoryLimit: "16Gi",
            cpuRequest: "1",
            memoryRequest: "4Gi",
        },
        {
            displayName: "GPU - ML/AI",
            description: "GPU-enabled notebook for machine learning and AI workloads",
            cpuLimit: "4",
            memoryLimit: "32Gi",
            cpuRequest: "2",
            memoryRequest: "8Gi",
            gpuCount: 1,
        },
    ],
}, { provider: k8sProvider });

// =============================================================================
// MaaS Component (LiteLLM + MaaS App)
// =============================================================================

// Deploy MaaS platform in dedicated namespace
// Bundles LiteLLM API gateway and MaaS frontend app
const maas = new MaaSComponent("maas", {
    namespace: "maas",
    imageRef: image.ref,
    litellmChartVersion: "0.1.830",
    litellmUsername: "admin",
    litellmPassword: "admin",
    jupyterhubApiUrl: "http://hub.jupyterhub.svc.cluster.local:8081",
    jupyterhubPublicUrl: jupyterhub.publicUrl,
    jupyterhubApiToken: jupyterhub.apiToken,
    enableLoadBalancer: true,
    litellmResources: {
        requests: {
            cpu: "500m",
            memory: "1Gi",
        },
        limits: {
            cpu: "2000m",
            memory: "4Gi",
        },
    },
    appResources: {
        requests: {
            cpu: "100m",
            memory: "128Mi",
        },
        limits: {
            cpu: "500m",
            memory: "512Mi",
        },
    },
}, { provider: k8sProvider, dependsOn: [image, jupyterhub] });

// =============================================================================
// Outputs
// =============================================================================

// ECR Repository outputs
export const ecrRepositoryUrl = ecr.repositoryUrl;
export const ecrRepositoryArn = ecr.repositoryArn;
export const ecrRepositoryName = ecr.repository.name;

// Docker image outputs
export const imageRef = image.ref;
export const imageDigest = image.digest;

// MaaS outputs
export const maasNamespace = maas.namespace.metadata.name;
export const litellmReleaseName = maas.litellmReleaseName;
export const litellmServiceUrl = maas.litellmServiceUrl;
export const litellmPublicUrl = maas.litellmPublicUrl;
export const maasServiceUrl = maas.appServiceUrl;
export const maasPublicUrl = maas.publicUrl;

// JupyterHub outputs
export const jupyterhubNamespace = jupyterhub.namespace.metadata.name;
export const jupyterhubProxyUrl = pulumi.interpolate`http://proxy-public.jupyterhub.svc.cluster.local`;
export const jupyterhubPublicUrl = jupyterhub.publicUrl;

// Useful commands
export const ecrLoginCommand = pulumi.interpolate`aws ecr get-login-password --region ${aws.getRegionOutput().name} | docker login --username AWS --password-stdin ${ecr.repositoryUrl}`;
export const dockerPullCommand = pulumi.interpolate`docker pull ${ecr.repositoryUrl}:${environment}`;
