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
    /**
     * Memory request for storage initializer
     * @default "8Gi"
     */
    memoryRequest?: pulumi.Input<string>;
    /**
     * Memory limit for storage initializer
     * @default "16Gi"
     */
    memoryLimit?: pulumi.Input<string>;
    /**
     * CPU request for storage initializer
     * @default "1"
     */
    cpuRequest?: pulumi.Input<string>;
    /**
     * CPU limit for storage initializer
     * @default "4"
     */
    cpuLimit?: pulumi.Input<string>;
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
        const memoryRequest = args.memoryRequest ?? "8Gi";
        const memoryLimit = args.memoryLimit ?? "16Gi";
        const cpuRequest = args.cpuRequest ?? "1";
        const cpuLimit = args.cpuLimit ?? "4";

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
                            memory: memoryRequest,
                            cpu: cpuRequest,
                        },
                        limits: {
                            memory: memoryLimit,
                            cpu: cpuLimit,
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
 * Arguments for creating an LLMInferenceServiceConfig
 */
export interface LLMInferenceServiceConfigArgs {
    /**
     * Kubernetes namespace for the config (should be kserve for global configs)
     * @default "kserve"
     */
    namespace?: pulumi.Input<string>;

    /**
     * Resource configuration for the LLM container
     */
    resources?: LLMResourceConfig;

    /**
     * Tolerations for GPU nodes
     * @default Includes nvidia.com/gpu toleration
     */
    tolerations?: k8s.types.input.core.v1.Toleration[];

    /**
     * Additional environment variables for the container
     */
    env?: k8s.types.input.core.v1.EnvVar[];

    /**
     * Custom vLLM container image
     */
    image?: pulumi.Input<string>;

    /**
     * Additional args for vLLM (e.g., ["--max_model_len", "2048"])
     */
    args?: pulumi.Input<string>[];
}

/**
 * LLMInferenceServiceConfigComponent creates a reusable LLMInferenceServiceConfig
 * that can be referenced by multiple LLMInferenceServices via baseRefs.
 *
 * Reference: https://kserve.github.io/website/docs/model-serving/generative-inference/llmisvc/llmisvc-configuration
 */
export class LLMInferenceServiceConfigComponent extends pulumi.ComponentResource {
    /**
     * The LLMInferenceServiceConfig custom resource
     */
    public readonly config: k8s.apiextensions.CustomResource;

    /**
     * The name of the config
     */
    public readonly configName: pulumi.Output<string>;

    constructor(name: string, args: LLMInferenceServiceConfigArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("kserve:index:LLMInferenceServiceConfigComponent", name, args, opts);

        const namespace = args.namespace ?? "kserve";

        // Default resource configuration
        const resources = {
            cpuLimit: args.resources?.cpuLimit ?? "4",
            memoryLimit: args.resources?.memoryLimit ?? "32Gi",
            gpuCount: args.resources?.gpuCount ?? 1,
            cpuRequest: args.resources?.cpuRequest ?? "2",
            memoryRequest: args.resources?.memoryRequest ?? "16Gi",
        };

        // Default tolerations for GPU nodes
        const tolerations = args.tolerations ?? [
            {
                key: "nvidia.com/gpu",
                operator: "Exists",
                effect: "NoSchedule",
            },
        ];

        // Build container spec
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
        };

        // Add custom image if specified
        if (args.image) {
            containerSpec.image = args.image;
        }

        // Add custom args if specified
        if (args.args && args.args.length > 0) {
            containerSpec.args = args.args;
        }

        // Add environment variables if specified
        if (args.env && args.env.length > 0) {
            containerSpec.env = args.env;
        }

        // Build template spec
        const templateSpec: any = {
            containers: [containerSpec],
        };

        // Add tolerations if specified
        if (tolerations.length > 0) {
            templateSpec.tolerations = tolerations;
        }

        // Create the LLMInferenceServiceConfig custom resource (v1alpha1)
        this.config = new k8s.apiextensions.CustomResource(`${name}-llmisvc-config`, {
            apiVersion: "serving.kserve.io/v1alpha1",
            kind: "LLMInferenceServiceConfig",
            metadata: {
                name: name,
                namespace: namespace,
            },
            spec: {
                template: templateSpec,
            },
        }, { parent: this });

        this.configName = this.config.metadata.name;

        this.registerOutputs({
            configName: this.configName,
        });
    }
}

/**
 * Storage type for model loading
 * - "hf" - Download from HuggingFace (requires HF_TOKEN for gated models)
 * - "oci" - Use OCI image with pre-packaged model (faster startup, cached on nodes via Modelcars)
 */
export type ModelStorageType = "hf" | "oci";

/**
 * Arguments for creating an LLMInferenceService component
 */
export interface LLMInferenceServiceArgs {
    /**
     * The model URI
     * For HuggingFace: "hf://Qwen/Qwen2.5-7B-Instruct" or just the model ID
     * For OCI: "oci://registry.example.com/model:tag"
     * Supports HuggingFace (hf://), OCI (oci://), S3 (s3://), and other model sources
     */
    modelUri: pulumi.Input<string>;

    /**
     * The model name for the inference endpoint (e.g., "Qwen/Qwen2.5-7B-Instruct")
     */
    modelName: pulumi.Input<string>;

    /**
     * Storage type for model loading
     * - "hf" - Download from HuggingFace (default, requires HF_TOKEN for gated models)
     * - "oci" - Use OCI image with pre-packaged model (faster startup via KServe Modelcars)
     *
     * When using "oci", the modelUri should be an OCI image URI like:
     * "oci://registry.example.com/kserve-models/llama3:v1.0"
     *
     * Benefits of OCI storage:
     * - Faster pod startup (model is cached on nodes)
     * - No HuggingFace token needed at runtime
     * - Works with private registries (ECR, GCR, etc.)
     * @default "hf"
     */
    storageType?: ModelStorageType;

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
     * References to LLMInferenceServiceConfig resources to compose
     * Configs are merged in order, with later configs overriding earlier ones
     */
    baseRefs?: pulumi.Input<string>[];

    /**
     * Resource configuration for the LLM container (inline override)
     * Consider using baseRefs with LLMInferenceServiceConfig for reusability
     */
    resources?: LLMResourceConfig;

    /**
     * Tolerations for GPU nodes (inline override)
     * @default Includes nvidia.com/gpu toleration
     */
    tolerations?: k8s.types.input.core.v1.Toleration[];

    /**
     * Additional environment variables for the container (inline override)
     */
    env?: k8s.types.input.core.v1.EnvVar[];

    /**
     * Custom vLLM container image (inline override)
     */
    image?: pulumi.Input<string>;

    /**
     * Additional args for vLLM (inline override, e.g., ["--max_model_len", "2048"])
     */
    args?: pulumi.Input<string>[];

    /**
     * Liveness probe configuration (inline override)
     */
    livenessProbe?: {
        initialDelaySeconds?: number;
        periodSeconds?: number;
        timeoutSeconds?: number;
        failureThreshold?: number;
    };

    /**
     * ServiceAccount name for the pod
     * Use this to provide access to secrets (e.g., HuggingFace token for gated models)
     */
    serviceAccountName?: pulumi.Input<string>;
}

/**
 * LLMInferenceServiceComponent deploys LLM models using KServe's LLMInferenceService (v1alpha1).
 * This component creates an LLMInferenceService with the new GenAI-first API that provides:
 * - Simplified deployment for LLM models
 * - Built-in router with Gateway, HTTPRoute, and Scheduler
 * - Configuration composition via baseRefs
 * - Integration with KServe's inference gateway
 *
 * Reference: https://kserve.github.io/website/docs/getting-started/genai-first-llmisvc
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

        // Build the spec
        const spec: any = {
            model: {
                uri: args.modelUri,
                name: args.modelName,
            },
            replicas: args.replicas ?? 1,
            router: {
                scheduler: {},  // Default scheduler with default load balancing
                route: {},
                gateway: {},
            },
        };

        // Add baseRefs if provided (for configuration composition)
        if (args.baseRefs && args.baseRefs.length > 0) {
            spec.baseRefs = args.baseRefs.map(ref => ({ name: ref }));
        }

        // Build inline template overrides if any are provided
        const hasInlineOverrides = args.resources || args.tolerations || args.env ||
                                   args.image || args.args || args.livenessProbe || args.serviceAccountName;

        if (hasInlineOverrides) {
            // Default resource configuration
            const resources = {
                cpuLimit: args.resources?.cpuLimit ?? "4",
                memoryLimit: args.resources?.memoryLimit ?? "32Gi",
                gpuCount: args.resources?.gpuCount ?? 1,
                cpuRequest: args.resources?.cpuRequest ?? "2",
                memoryRequest: args.resources?.memoryRequest ?? "16Gi",
            };

            // Default tolerations for GPU nodes
            const tolerations = args.tolerations ?? [
                {
                    key: "nvidia.com/gpu",
                    operator: "Exists",
                    effect: "NoSchedule",
                },
            ];

            // Default liveness probe configuration
            const livenessProbe = {
                initialDelaySeconds: args.livenessProbe?.initialDelaySeconds ?? 120,
                periodSeconds: args.livenessProbe?.periodSeconds ?? 30,
                timeoutSeconds: args.livenessProbe?.timeoutSeconds ?? 30,
                failureThreshold: args.livenessProbe?.failureThreshold ?? 5,
            };

            // Build container spec
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
                        path: "/health",
                        port: 8000,
                        scheme: "HTTP",
                    },
                    initialDelaySeconds: livenessProbe.initialDelaySeconds,
                    periodSeconds: livenessProbe.periodSeconds,
                    timeoutSeconds: livenessProbe.timeoutSeconds,
                    failureThreshold: livenessProbe.failureThreshold,
                },
            };

            // Add custom image if specified
            if (args.image) {
                containerSpec.image = args.image;
            }

            // Add custom args if specified
            if (args.args && args.args.length > 0) {
                containerSpec.args = args.args;
            }

            // Add environment variables if specified
            if (args.env && args.env.length > 0) {
                containerSpec.env = args.env;
            }

            // Build template spec
            const templateSpec: any = {
                containers: [containerSpec],
            };

            // Add tolerations if specified
            if (tolerations.length > 0) {
                templateSpec.tolerations = tolerations;
            }

            // Add serviceAccountName if specified
            // This allows the pod to access secrets referenced by the ServiceAccount
            if (args.serviceAccountName) {
                templateSpec.serviceAccountName = args.serviceAccountName;
            }

            spec.template = templateSpec;
        }

        // Create the LLMInferenceService custom resource (v1alpha1)
        this.llmInferenceService = new k8s.apiextensions.CustomResource(`${name}-llmisvc`, {
            apiVersion: "serving.kserve.io/v1alpha1",
            kind: "LLMInferenceService",
            metadata: {
                name: name,
                namespace: namespace,
            },
            spec: spec,
        }, { parent: this });

        this.serviceName = this.llmInferenceService.metadata.name;
        this.serviceNamespace = this.llmInferenceService.metadata.namespace;

        this.registerOutputs({
            serviceName: this.serviceName,
            serviceNamespace: this.serviceNamespace,
        });
    }
}
