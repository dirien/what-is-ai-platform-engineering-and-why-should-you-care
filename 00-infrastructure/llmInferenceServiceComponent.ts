import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Arguments for HuggingFace storage container configuration
 */
export interface HuggingFaceStorageArgs {
    /**
     * Name of the Kubernetes secret containing HF_TOKEN
     */
    secretName: pulumi.Input<string>;
    /**
     * Key in the secret that contains the HuggingFace token
     * @default "HF_TOKEN"
     */
    secretKey?: pulumi.Input<string>;
    /**
     * Namespace where the secret is located
     * @default "default"
     */
    secretNamespace?: pulumi.Input<string>;
    /**
     * Storage initializer image
     * @default "kserve/storage-initializer:latest"
     */
    storageInitializerImage?: pulumi.Input<string>;
}

/**
 * HuggingFaceStorageContainerComponent creates a ClusterStorageContainer
 * that configures KServe to authenticate with HuggingFace when downloading
 * models using hf:// URIs.
 */
export class HuggingFaceStorageContainerComponent extends pulumi.ComponentResource {
    /**
     * The ClusterStorageContainer custom resource
     */
    public readonly storageContainer: k8s.apiextensions.CustomResource;

    constructor(name: string, args: HuggingFaceStorageArgs, opts?: pulumi.ComponentResourceOptions) {
        super("kserve:index:HuggingFaceStorageContainerComponent", name, args, opts);

        const secretKey = args.secretKey ?? "HF_TOKEN";
        const storageInitializerImage = args.storageInitializerImage ?? "kserve/storage-initializer:latest";

        this.storageContainer = new k8s.apiextensions.CustomResource(`${name}-csc`, {
            apiVersion: "serving.kserve.io/v1alpha1",
            kind: "ClusterStorageContainer",
            metadata: {
                name: name,
            },
            spec: {
                container: {
                    name: "storage-initializer",
                    image: storageInitializerImage,
                    env: [
                        {
                            name: "HF_TOKEN",
                            valueFrom: {
                                secretKeyRef: {
                                    name: args.secretName,
                                    key: secretKey,
                                    optional: false,
                                },
                            },
                        },
                    ],
                    resources: {
                        requests: {
                            memory: "2Gi",
                            cpu: "1",
                        },
                        limits: {
                            memory: "4Gi",
                            cpu: "1",
                        },
                    },
                },
                supportedUriFormats: [
                    {
                        prefix: "hf://",
                    },
                ],
            },
        }, { parent: this });

        this.registerOutputs({
            storageContainerName: this.storageContainer.metadata.name,
        });
    }
}

/**
 * Resource configuration for the LLM container
 */
export interface LLMResourceConfig {
    /**
     * CPU limit (e.g., "4")
     */
    cpuLimit?: string;
    /**
     * Memory limit (e.g., "32Gi")
     */
    memoryLimit?: string;
    /**
     * Number of GPUs to allocate
     * @default 1
     */
    gpuCount?: number;
    /**
     * CPU request (e.g., "2")
     */
    cpuRequest?: string;
    /**
     * Memory request (e.g., "16Gi")
     */
    memoryRequest?: string;
}

/**
 * Liveness probe configuration
 */
export interface LivenessProbeConfig {
    /**
     * Path for the health check endpoint
     * @default "/health"
     */
    path?: string;
    /**
     * Port for the health check
     * @default 8000
     */
    port?: number;
    /**
     * Scheme for the health check (HTTP or HTTPS)
     * @default "HTTPS"
     */
    scheme?: "HTTP" | "HTTPS";
    /**
     * Initial delay before starting probes
     * @default 120
     */
    initialDelaySeconds?: number;
    /**
     * Period between probes
     * @default 30
     */
    periodSeconds?: number;
    /**
     * Timeout for each probe
     * @default 30
     */
    timeoutSeconds?: number;
    /**
     * Number of failures before marking unhealthy
     * @default 5
     */
    failureThreshold?: number;
}

/**
 * Arguments for creating an LLMInferenceService component
 */
export interface LLMInferenceServiceArgs {
    /**
     * The model URI (e.g., "hf://Qwen/Qwen2.5-7B-Instruct")
     * Supports HuggingFace (hf://), S3 (s3://), and other model sources
     */
    modelUri: pulumi.Input<string>;

    /**
     * The model name/identifier (e.g., "Qwen/Qwen2.5-7B-Instruct")
     */
    modelName: pulumi.Input<string>;

    /**
     * Kubernetes namespace for the deployment
     * @default "default"
     */
    namespace?: pulumi.Input<string>;

    /**
     * Number of replicas for load balancing
     * @default 1
     */
    replicas?: pulumi.Input<number>;

    /**
     * Resource configuration for the LLM container
     */
    resources?: LLMResourceConfig;

    /**
     * Liveness probe configuration
     */
    livenessProbe?: LivenessProbeConfig;

    /**
     * Node selector for scheduling pods
     */
    nodeSelector?: Record<string, string>;

    /**
     * Tolerations for GPU nodes
     * @default Includes nvidia.com/gpu toleration
     */
    tolerations?: k8s.types.input.core.v1.Toleration[];
}

/**
 * LLMInferenceServiceComponent deploys LLM models using KServe's LLMInferenceService CR.
 * This component creates an LLMInferenceService custom resource that automatically
 * provisions the vLLM deployment, service, gateway, and routing infrastructure.
 *
 * Features:
 * - Automatic deployment of vLLM with the specified model
 * - Built-in load balancing with configurable replicas
 * - GPU resource allocation
 * - Health monitoring via liveness probes
 * - Integration with KServe's inference gateway
 */
export class LLMInferenceServiceComponent extends pulumi.ComponentResource {
    /**
     * The LLMInferenceService custom resource
     */
    public readonly llmInferenceService: k8s.apiextensions.CustomResource;

    /**
     * The name of the LLMInferenceService
     */
    public readonly serviceName: pulumi.Output<string>;

    /**
     * The namespace where the service is deployed
     */
    public readonly serviceNamespace: pulumi.Output<string>;

    constructor(name: string, args: LLMInferenceServiceArgs, opts?: pulumi.ComponentResourceOptions) {
        super("kserve:index:LLMInferenceServiceComponent", name, args, opts);

        const namespace = args.namespace ?? "default";
        const replicas = args.replicas ?? 1;

        // Default resource configuration
        const resources = {
            cpuLimit: args.resources?.cpuLimit ?? "4",
            memoryLimit: args.resources?.memoryLimit ?? "32Gi",
            gpuCount: args.resources?.gpuCount ?? 1,
            cpuRequest: args.resources?.cpuRequest ?? "2",
            memoryRequest: args.resources?.memoryRequest ?? "16Gi",
        };

        // Default liveness probe configuration
        const livenessProbe = {
            path: args.livenessProbe?.path ?? "/health",
            port: args.livenessProbe?.port ?? 8000,
            scheme: args.livenessProbe?.scheme ?? "HTTPS",
            initialDelaySeconds: args.livenessProbe?.initialDelaySeconds ?? 120,
            periodSeconds: args.livenessProbe?.periodSeconds ?? 30,
            timeoutSeconds: args.livenessProbe?.timeoutSeconds ?? 30,
            failureThreshold: args.livenessProbe?.failureThreshold ?? 5,
        };

        // Default tolerations for GPU nodes
        const tolerations = args.tolerations ?? [
            {
                key: "nvidia.com/gpu",
                operator: "Exists",
                effect: "NoSchedule",
            },
        ];

        // Build the container spec
        const containerSpec: any = {
            name: "main",
            resources: {
                limits: {
                    cpu: resources.cpuLimit,
                    memory: resources.memoryLimit,
                    "nvidia.com/gpu": `${resources.gpuCount}`,
                },
                requests: {
                    cpu: resources.cpuRequest,
                    memory: resources.memoryRequest,
                    "nvidia.com/gpu": `${resources.gpuCount}`,
                },
            },
            livenessProbe: {
                httpGet: {
                    path: livenessProbe.path,
                    port: livenessProbe.port,
                    scheme: livenessProbe.scheme,
                },
                initialDelaySeconds: livenessProbe.initialDelaySeconds,
                periodSeconds: livenessProbe.periodSeconds,
                timeoutSeconds: livenessProbe.timeoutSeconds,
                failureThreshold: livenessProbe.failureThreshold,
            },
        };

        // Build the template spec
        const templateSpec: any = {
            containers: [containerSpec],
        };

        // Add tolerations if specified
        if (tolerations.length > 0) {
            templateSpec.tolerations = tolerations;
        }

        // Add node selector if specified
        if (args.nodeSelector && Object.keys(args.nodeSelector).length > 0) {
            templateSpec.nodeSelector = args.nodeSelector;
        }

        // Create the LLMInferenceService custom resource
        this.llmInferenceService = new k8s.apiextensions.CustomResource(`${name}-llmisvc`, {
            apiVersion: "serving.kserve.io/v1alpha1",
            kind: "LLMInferenceService",
            metadata: {
                name: name,
                namespace: namespace,
            },
            spec: {
                model: {
                    uri: args.modelUri,
                    name: args.modelName,
                },
                replicas: replicas,
                router: {
                    scheduler: {},
                    route: {},
                    gateway: {},
                },
                template: templateSpec,
            },
        }, { parent: this });

        this.serviceName = this.llmInferenceService.metadata.name;
        this.serviceNamespace = this.llmInferenceService.metadata.namespace;

        this.registerOutputs({
            serviceName: this.serviceName,
            serviceNamespace: this.serviceNamespace,
        });
    }
}
