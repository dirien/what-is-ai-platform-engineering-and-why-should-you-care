import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as dockerBuild from "@pulumi/docker-build";
import { EcrRepositoryComponent } from "./src/components/ecrComponent";
import { JupyterHubComponent } from "./src/components/jupyterhubComponent";
import { MaaSComponent } from "./src/components/maasComponent";

// Configuration
const config = new pulumi.Config();
const appName = config.get("appName") || "maas";
const environment = pulumi.getStack();
const owner = config.get("owner") || "dirien";
const maasTlsCertificateArn = config.get("maasTlsCertificateArn");
const maasPublicHostname = config.get("maasPublicHostname");
const enableMaaSCloudFront = config.getBoolean("enableMaaSCloudFront") ?? true;
const agentWorkspaceStorageClass = config.get("agentWorkspaceStorageClass") || "gp3";
const agentWorkspaceSize = config.get("agentWorkspaceSize") || "50Gi";
const agentHomeSubPath = config.get("agentHomeSubPath") || ".home";

// Infrastructure config (VPC, subnets, security groups - set via Pulumi config or ESC)
const infraConfig = new pulumi.Config("infra");

// Tags for all resources
const tags = {
    Environment: environment,
    Project: appName,
    ManagedBy: "Pulumi",
    Owner: owner,
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
// OpenCode Agent Image (ECR + Docker Build)
// =============================================================================

const agentEcr = new EcrRepositoryComponent(`${appName}-agent-ecr`, {
    repositoryName: `${appName}-opencode`,
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const agentAuthToken = aws.ecr.getAuthorizationTokenOutput({
    registryId: agentEcr.registryId,
});

const agentImage = new dockerBuild.Image(`${appName}-agent-image`, {
    tags: [
        pulumi.interpolate`${agentEcr.repositoryUrl}:${environment}`,
        pulumi.interpolate`${agentEcr.repositoryUrl}:latest`,
    ],
    context: {
        location: "../images/opencode",
    },
    dockerfile: {
        location: "../images/opencode/Dockerfile",
    },
    platforms: [dockerBuild.Platform.Linux_amd64],
    push: true,
    registries: [{
        address: agentEcr.repositoryUrl,
        username: agentAuthToken.userName,
        password: pulumi.secret(agentAuthToken.password),
    }],
});

// =============================================================================
// JupyterHub Deployment
// =============================================================================

// Deploy JupyterHub for notebook support (in its own namespace)
// Provides Jupyter notebooks with LiteLLM integration for data scientists
const jupyterhub = new JupyterHubComponent("jupyterhub", {
    namespace: "jupyterhub",
    chartVersion: "4.3.2",
    // Use the fixed-name litellm-lb service created by MaaSComponent
    // (LoadBalancer services are also reachable via ClusterIP within the cluster)
    litellmServiceUrl: "http://litellm-lb.maas.svc.cluster.local:4000",
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
    tags: tags,
}, { provider: k8sProvider });

// =============================================================================
// MaaS Component (LiteLLM + MaaS App)
// =============================================================================

// Deploy MaaS platform in dedicated namespace
// Bundles LiteLLM API gateway and MaaS frontend app
const maas = new MaaSComponent("maas", {
    namespace: "maas",
    imageRef: image.ref,
    litellmChartVersion: "1.81.12-stable",
    litellmUsername: "admin",
    litellmPassword: "admin",
    litellmMasterKey: config.requireSecret("litellmMasterKey"),
    jupyterhubApiUrl: "http://hub.jupyterhub.svc.cluster.local:8081",
    jupyterhubPublicUrl: jupyterhub.publicUrl,
    jupyterhubApiToken: jupyterhub.apiToken,
    vpcId: infraConfig.require("vpcId"),
    privateSubnetIds: infraConfig.requireObject<string[]>("privateSubnetIds"),
    clusterSecurityGroupId: infraConfig.require("clusterSecurityGroupId"),
    clusterName: infraConfig.require("clusterName"),
    awsRegion: "us-east-1",
    enableLoadBalancer: true,
    maasTlsCertificateArn: maasTlsCertificateArn || undefined,
    maasPublicHostname: maasPublicHostname || undefined,
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
    agentImageRef: agentImage.ref,
    agentNamespace: "default",
    agentWorkspaceStorageClass: agentWorkspaceStorageClass,
    agentWorkspaceSize: agentWorkspaceSize,
    agentHomeSubPath: agentHomeSubPath,
    agentFlavours: [
        {
            id: "devops",
            name: "DevOps",
            description: "Docker, Kubernetes, CI/CD, Pulumi IaC, and infrastructure automation",
            icon: "devops",
            skills: [
                "sickn33/antigravity-awesome-skills/docker-expert",
                "wshobson/agents/github-actions-templates",
                "wshobson/agents/helm-chart-scaffolding",
                "jeffallan/claude-skills/kubernetes-specialist",
                "dirien/claude-skills/pulumi-typescript",
            ],
        },
        {
            id: "typescript",
            name: "TypeScript",
            description: "Advanced types, testing, and TypeScript best practices",
            icon: "code",
            skills: [
                "wshobson/agents/typescript-advanced-types",
                "github/awesome-copilot/javascript-typescript-jest",
                "sickn33/antigravity-awesome-skills/typescript-expert",
                "bmad-labs/skills/typescript-e2e-testing",
            ],
        },
    ],
    tags: tags,
}, { provider: k8sProvider, dependsOn: [image, agentImage, jupyterhub] });

// =============================================================================
// MaaS CloudFront HTTPS Front Door (no custom domain required)
// =============================================================================

let maasCloudFrontDistribution: aws.cloudfront.Distribution | undefined;

if (enableMaaSCloudFront) {
    // Forward all request context to preserve WebSockets, SSE, and cookie-based sessions.
    const maasOriginRequestPolicy = new aws.cloudfront.OriginRequestPolicy("maas-origin-request-policy", {
        name: `${appName}-${environment}-maas-all-viewer`,
        comment: "Forward all viewer headers/cookies/query strings for MaaS proxy traffic",
        headersConfig: {
            headerBehavior: "allViewer",
        },
        cookiesConfig: {
            cookieBehavior: "all",
        },
        queryStringsConfig: {
            queryStringBehavior: "all",
        },
    });

    // Disable caching for interactive API/proxy traffic.
    const maasNoCachePolicy = new aws.cloudfront.CachePolicy("maas-no-cache-policy", {
        name: `${appName}-${environment}-maas-no-cache`,
        comment: "No-cache policy for MaaS app and OpenCode proxy traffic",
        defaultTtl: 0,
        minTtl: 0,
        maxTtl: 1,
        parametersInCacheKeyAndForwardedToOrigin: {
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true,
            headersConfig: {
                headerBehavior: "none",
            },
            cookiesConfig: {
                cookieBehavior: "all",
            },
            queryStringsConfig: {
                queryStringBehavior: "all",
            },
        },
    });

    maasCloudFrontDistribution = new aws.cloudfront.Distribution("maas-cloudfront", {
        enabled: true,
        isIpv6Enabled: true,
        httpVersion: "http2and3",
        priceClass: "PriceClass_100",
        comment: `HTTPS front door for ${appName} (${environment})`,
        origins: [{
            domainName: maas.publicLoadBalancerHost,
            originId: "maas-nlb-origin",
            customOriginConfig: {
                httpPort: 80,
                httpsPort: 443,
                originProtocolPolicy: "http-only",
                originSslProtocols: ["TLSv1.2"],
            },
        }],
        defaultCacheBehavior: {
            targetOriginId: "maas-nlb-origin",
            viewerProtocolPolicy: "redirect-to-https",
            allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            cachedMethods: ["GET", "HEAD", "OPTIONS"],
            cachePolicyId: maasNoCachePolicy.id,
            originRequestPolicyId: maasOriginRequestPolicy.id,
            compress: true,
        },
        restrictions: {
            geoRestriction: {
                restrictionType: "none",
            },
        },
        viewerCertificate: {
            cloudfrontDefaultCertificate: true,
        },
    }, { dependsOn: [maas] });
}

// =============================================================================
// Outputs
// =============================================================================

// ECR Repository outputs
export const ecrRepositoryUrl = ecr.repositoryUrl;
export const ecrRepositoryArn = ecr.repositoryArn;
export const ecrRepositoryName = ecr.repositoryName;

// Docker image outputs
export const imageRef = image.ref;
export const imageDigest = image.digest;

// MaaS outputs
export const maasNamespace = maas.namespaceName;
export const litellmReleaseName = maas.litellmReleaseName;
export const litellmServiceUrl = maas.litellmServiceUrl;
export const litellmPublicUrl = maas.litellmPublicUrl;
export const maasServiceUrl = maas.appServiceUrl;
export const maasLoadBalancerHost = maas.publicLoadBalancerHost;
export const maasLoadBalancerUrl = maas.publicUrl;
export const maasCloudFrontUrl = maasCloudFrontDistribution
    ? pulumi.interpolate`https://${maasCloudFrontDistribution.domainName}`
    : pulumi.output<string | undefined>(undefined);
export const maasPublicUrl = maasCloudFrontDistribution
    ? pulumi.interpolate`https://${maasCloudFrontDistribution.domainName}`
    : maas.publicUrl;

// RDS outputs
export const rdsEndpoint = maas.rdsEndpoint;

// JupyterHub outputs
export const jupyterhubNamespace = jupyterhub.namespaceName;
export const jupyterhubProxyUrl = pulumi.interpolate`http://proxy-public.jupyterhub.svc.cluster.local`;
export const jupyterhubPublicUrl = jupyterhub.publicUrl;

// Agent outputs
export const agentEcrRepositoryUrl = agentEcr.repositoryUrl;
export const agentImageRef = agentImage.ref;

// Useful commands
export const ecrLoginCommand = pulumi.interpolate`aws ecr get-login-password --region ${aws.getRegionOutput().name} | docker login --username AWS --password-stdin ${ecr.repositoryUrl}`;
export const dockerPullCommand = pulumi.interpolate`docker pull ${ecr.repositoryUrl}:${environment}`;
