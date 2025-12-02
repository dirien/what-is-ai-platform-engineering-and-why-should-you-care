import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as dockerBuild from "@pulumi/docker-build";
import { EcrRepositoryComponent } from "./ecrComponent";

// Configuration
const config = new pulumi.Config();
const appName = config.get("appName") || "litellm-app";
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
    repositoryName: `${appName}`,
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
// LiteLLM Deployment
// =============================================================================

// Deploy LiteLLM as the API gateway for model inference
// LiteLLM provides a unified OpenAI-compatible API for multiple model backends
// Using latest Helm chart version 0.1.825 from ghcr.io/berriai/litellm-helm
const litellm = new k8s.helm.v3.Release("litellm", {
    chart: "oci://ghcr.io/berriai/litellm-helm",
    version: "0.1.825",
    namespace: "default",
    values: {
        envVars: {
            UI_USERNAME: "admin",
            UI_PASSWORD: "admin",
            STORE_MODEL_IN_DB: "True",
        },
    },
}, { provider: k8sProvider });

// =============================================================================
// Custom App Deployment (LiteLLM Model Discovery UI)
// =============================================================================

const appNamespace = "default";
const appLabels = { app: appName };

// Deploy the custom LiteLLM Model Discovery app
// Uses the LiteLLM Helm chart's auto-generated masterkey secret
const appDeployment = new k8s.apps.v1.Deployment(`${appName}-deployment`, {
    metadata: {
        name: appName,
        namespace: appNamespace,
        labels: appLabels,
    },
    spec: {
        replicas: 1,
        selector: {
            matchLabels: appLabels,
        },
        template: {
            metadata: {
                labels: appLabels,
            },
            spec: {
                containers: [{
                    name: appName,
                    image: image.ref,
                    ports: [{
                        containerPort: 3001,
                        name: "http",
                    }],
                    env: [
                        {
                            name: "PORT",
                            value: "3001",
                        },
                        {
                            // LiteLLM service URL - using Helm release name
                            // The Helm chart creates a service with the release name
                            name: "LITELLM_API_BASE",
                            value: pulumi.interpolate`http://${litellm.name}.${appNamespace}.svc.cluster.local:4000`,
                        },
                        {
                            // Use the LiteLLM Helm chart's auto-generated masterkey
                            name: "LITELLM_MASTER_KEY",
                            valueFrom: {
                                secretKeyRef: {
                                    name: pulumi.interpolate`${litellm.name}-masterkey`,
                                    key: "masterkey",
                                },
                            },
                        },
                    ],
                    resources: {
                        requests: {
                            cpu: "100m",
                            memory: "128Mi",
                        },
                        limits: {
                            cpu: "500m",
                            memory: "512Mi",
                        },
                    },
                    livenessProbe: {
                        httpGet: {
                            path: "/api/health",
                            port: "http",
                        },
                        initialDelaySeconds: 10,
                        periodSeconds: 10,
                    },
                    readinessProbe: {
                        httpGet: {
                            path: "/api/health",
                            port: "http",
                        },
                        initialDelaySeconds: 5,
                        periodSeconds: 5,
                    },
                }],
            },
        },
    },
}, { provider: k8sProvider, dependsOn: [litellm, image] });

// Create ClusterIP service for the app
const appService = new k8s.core.v1.Service(`${appName}-service`, {
    metadata: {
        name: appName,
        namespace: appNamespace,
        labels: appLabels,
    },
    spec: {
        type: "ClusterIP",
        selector: appLabels,
        ports: [{
            port: 80,
            targetPort: 3001,
            protocol: "TCP",
            name: "http",
        }],
    },
}, { provider: k8sProvider });

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

// LiteLLM outputs
export const litellmReleaseName = litellm.name;
export const litellmServiceUrl = pulumi.interpolate`http://${litellm.name}.${appNamespace}.svc.cluster.local:4000`;

// Custom app outputs
export const appServiceName = appService.metadata.name;
export const appServiceUrl = pulumi.interpolate`http://${appService.metadata.name}.${appNamespace}.svc.cluster.local`;

// Useful commands
export const ecrLoginCommand = pulumi.interpolate`aws ecr get-login-password --region ${aws.getRegionOutput().name} | docker login --username AWS --password-stdin ${ecr.repositoryUrl}`;
export const dockerPullCommand = pulumi.interpolate`docker pull ${ecr.repositoryUrl}:${environment}`;
