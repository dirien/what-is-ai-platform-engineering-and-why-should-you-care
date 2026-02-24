import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Deployment mode for KServe
 * - RawDeployment: Avoids installing Istio/Knative (simpler setup)
 * - Serverless: Uses Knative for scale-to-zero capabilities
 */
export type KServeDeploymentMode = "RawDeployment" | "Serverless";

/**
 * Storage initializer resource configuration
 */
export interface StorageInitializerConfig {
    /**
     * Memory request for the storage initializer container
     * @default "100Mi"
     */
    memoryRequest?: string;
    /**
     * Memory limit for the storage initializer container
     * @default "1Gi"
     */
    memoryLimit?: string;
    /**
     * CPU request for the storage initializer container
     * @default "100m"
     */
    cpuRequest?: string;
    /**
     * CPU limit for the storage initializer container
     * @default "1"
     */
    cpuLimit?: string;
}

/**
 * LLMInferenceService controller resource configuration
 */
export interface LLMISvcControllerConfig {
    /**
     * CPU request for the controller
     * @default "100m"
     */
    cpuRequest?: string;
    /**
     * CPU limit for the controller
     * @default "500m"
     */
    cpuLimit?: string;
    /**
     * Memory request for the controller
     * @default "300Mi"
     */
    memoryRequest?: string;
    /**
     * Memory limit for the controller
     * @default "1Gi"
     */
    memoryLimit?: string;
}

/**
 * Arguments for creating a KServe component
 */
export interface KServeComponentArgs {
    /**
     * Version of cert-manager to install
     * @default "v1.19.3"
     */
    certManagerVersion?: pulumi.Input<string>;

    /**
     * Version of KServe to install
     * @default "v0.16.0"
     */
    kserveVersion?: pulumi.Input<string>;

    /**
     * Version of Gateway API CRDs to install
     * @default "v1.4.1"
     */
    gatewayApiVersion?: string;

    /**
     * Deployment mode for KServe controller
     * - RawDeployment: Avoids Istio/Knative dependencies
     * - Serverless: Requires Knative (not configured by this component)
     * @default "RawDeployment"
     */
    deploymentMode?: KServeDeploymentMode;

    /**
     * Timeout in seconds for waiting for cert-manager pods to be ready
     * @default 90
     */
    certManagerReadyTimeout?: number;

    /**
     * Storage initializer resource configuration for the default ClusterStorageContainer
     * The default ClusterStorageContainer handles hf://, s3://, gs://, etc.
     * Increase memory limits for large model downloads (e.g., 16Gi for 7B+ models)
     */
    storageInitializer?: StorageInitializerConfig;

    /**
     * LLMInferenceService controller resource configuration
     * Increase limits when managing many LLMInferenceService resources
     */
    llmisvController?: LLMISvcControllerConfig;
}

/**
 * KServeComponent installs KServe v0.16 with all required dependencies:
 * - Cert-Manager (required for webhook certificates)
 * - KServe CRDs
 * - KServe Controller
 * - LLMInferenceService CRDs and resources
 *
 * Uses RawDeployment mode by default to avoid Istio/Knative dependencies.
 */
export class KServeComponent extends pulumi.ComponentResource {
    /**
     * The cert-manager Helm release
     */
    private readonly certManager: k8s.helm.v3.Release;

    /**
     * The KServe CRD Helm release
     */
    private readonly kserveCrd: k8s.helm.v3.Release;

    /**
     * Gateway API CRDs (required by LLMInferenceService networking resources)
     */
    private readonly gatewayApiCrds: k8s.yaml.ConfigFile;

    /**
     * The KServe controller Helm release
     */
    private readonly kserve: k8s.helm.v3.Release;

    /**
     * The LLMInferenceService CRD Helm release (required for LLM features)
     */
    private readonly llmisvCrd: k8s.helm.v3.Release;

    /**
     * The LLMInferenceService resources Helm release (controller and runtimes for LLM features)
     */
    private readonly llmisvResources: k8s.helm.v3.Release;

    /**
     * The KServe namespace name
     */
    public readonly namespaceName: pulumi.Output<string>;

    /**
     * The KServe namespace resource (used internally for dependency tracking)
     */
    private readonly kserveNamespace: k8s.core.v1.Namespace;

    constructor(name: string, args: KServeComponentArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("kserve:index:KServeComponent", name, args, opts);

        const certManagerVersion = args.certManagerVersion ?? "v1.19.3";
        const kserveVersion = args.kserveVersion ?? "v0.16.0";
        const gatewayApiVersion = args.gatewayApiVersion ?? "v1.4.1";
        const deploymentMode = args.deploymentMode ?? "RawDeployment";

        // Create cert-manager namespace
        const certManagerNamespace = new k8s.core.v1.Namespace(`${name}-cert-manager-ns`, {
            metadata: {
                name: "cert-manager",
            },
        }, { parent: this });

        // Install Cert-Manager using Jetstack Helm chart
        this.certManager = new k8s.helm.v3.Release(`${name}-cert-manager`, {
            name: "cert-manager",
            chart: "cert-manager",
            version: certManagerVersion,
            namespace: certManagerNamespace.metadata.name,
            repositoryOpts: {
                repo: "https://charts.jetstack.io",
            },
            values: {
                crds: {
                    enabled: true,
                },
                // Resource limits for cert-manager controller
                resources: {
                    requests: {
                        cpu: "50m",
                        memory: "64Mi",
                    },
                    limits: {
                        cpu: "200m",
                        memory: "256Mi",
                    },
                },
                // Resource limits for cainjector
                cainjector: {
                    resources: {
                        requests: {
                            cpu: "50m",
                            memory: "64Mi",
                        },
                        limits: {
                            cpu: "200m",
                            memory: "256Mi",
                        },
                    },
                },
                // Resource limits for webhook
                webhook: {
                    resources: {
                        requests: {
                            cpu: "50m",
                            memory: "64Mi",
                        },
                        limits: {
                            cpu: "200m",
                            memory: "256Mi",
                        },
                    },
                },
            },
            // Wait for deployment to complete
            waitForJobs: true,
        }, { parent: this, dependsOn: [certManagerNamespace] });

        // Create KServe namespace
        this.kserveNamespace = new k8s.core.v1.Namespace(`${name}-kserve-ns`, {
            metadata: {
                name: "kserve",
            },
        }, { parent: this });
        this.namespaceName = this.kserveNamespace.metadata.name;

        // Install Gateway API CRDs required by KServe's managed Gateway/HTTPRoute resources
        this.gatewayApiCrds = new k8s.yaml.ConfigFile(`${name}-gateway-api-crds`, {
            file: `https://github.com/kubernetes-sigs/gateway-api/releases/download/${gatewayApiVersion}/standard-install.yaml`,
        }, { parent: this, dependsOn: [this.kserveNamespace] });

        // Install KServe CRDs (must be installed before the controller)
        this.kserveCrd = new k8s.helm.v3.Release(`${name}-kserve-crd`, {
            name: "kserve-crd",
            chart: "oci://ghcr.io/kserve/charts/kserve-crd",
            version: kserveVersion,
            namespace: this.kserveNamespace.metadata.name,
        }, { parent: this, dependsOn: [this.certManager, this.kserveNamespace] });


        // Install KServe Controller
        this.kserve = new k8s.helm.v3.Release(`${name}-kserve`, {
            name: "kserve",
            chart: "oci://ghcr.io/kserve/charts/kserve",
            version: kserveVersion,
            namespace: this.kserveNamespace.metadata.name,
            values: {
                kserve: {
                    controller: {
                        deploymentMode: deploymentMode,
                    }
                },
            },
        }, { parent: this, dependsOn: [this.kserveCrd, this.gatewayApiCrds] });

        // Install LLMInferenceService CRDs (required for LLM features in v0.16+)
        this.llmisvCrd = new k8s.helm.v3.Release(`${name}-llmisvc-crd`, {
            name: "llmisvc-crd",
            chart: "oci://ghcr.io/kserve/charts/llmisvc-crd",
            version: kserveVersion,
            namespace: this.kserveNamespace.metadata.name,
        }, { parent: this, dependsOn: [this.kserve] });

        // Patch the inferenceservice-config ConfigMap ownership annotations BEFORE installing llmisvc-resources.
        // Both kserve and llmisvc-resources charts create the same ConfigMap, causing a Helm ownership conflict.
        // This patch transfers ownership from the "kserve" release to the "llmisvc-resources" release.
        const configMapOwnershipPatch = new k8s.core.v1.ConfigMapPatch(
            `${name}-configmap-ownership-patch`,
            {
                metadata: {
                    name: "inferenceservice-config",
                    namespace: this.kserveNamespace.metadata.name,
                    annotations: {
                        "pulumi.com/patchForce": "true",
                        "meta.helm.sh/release-name": "llmisvc-resources",
                        "meta.helm.sh/release-namespace": "kserve",
                    },
                    labels: {
                        "app.kubernetes.io/managed-by": "Helm",
                    },
                },
            },
            {
                parent: this,
                dependsOn: [this.kserve],
            }
        );

        // Install LLMInferenceService resources (controller and runtimes)
        this.llmisvResources = new k8s.helm.v3.Release(`${name}-llmisvc-resources`, {
            name: "llmisvc-resources",
            chart: "oci://ghcr.io/kserve/charts/llmisvc-resources",
            version: kserveVersion,
            namespace: this.kserveNamespace.metadata.name,
            skipCrds: true,
            values: {
                kserve: {
                    llmisvc: {
                        controller: {
                            resources: {
                                requests: {
                                    cpu: args.llmisvController?.cpuRequest ?? "100m",
                                    memory: args.llmisvController?.memoryRequest ?? "300Mi",
                                },
                                limits: {
                                    cpu: args.llmisvController?.cpuLimit ?? "500m",
                                    memory: args.llmisvController?.memoryLimit ?? "1Gi",
                                },
                            },
                        },
                    },
                },
            },
        }, { parent: this, dependsOn: [this.llmisvCrd, configMapOwnershipPatch] });

        // Patch the inferenceservice-config ConfigMap with storage initializer settings
        // This overrides the defaults set by the llmisvc-resources Helm chart
        const storageInitializerConfig = new k8s.core.v1.ConfigMapPatch(
            `${name}-storage-initializer-config`,
            {
                metadata: {
                    name: "inferenceservice-config",
                    namespace: this.kserveNamespace.metadata.name,
                    annotations: {
                        "pulumi.com/patchForce": "true",
                    },
                },
                data: {
                    storageInitializer: JSON.stringify({
                        image: "kserve/storage-initializer:latest",
                        memoryRequest: args.storageInitializer?.memoryRequest ?? "100Mi",
                        memoryLimit: args.storageInitializer?.memoryLimit ?? "1Gi",
                        cpuRequest: args.storageInitializer?.cpuRequest ?? "100m",
                        cpuLimit: args.storageInitializer?.cpuLimit ?? "1",
                        // Preserve other required fields
                        caBundleConfigMapName: "",
                        caBundleVolumeMountPath: "/etc/ssl/custom-certs",
                        enableModelcar: true,
                        cpuModelcar: "10m",
                        memoryModelcar: "15Mi",
                        // Use UID 0 (root) for modelcar to ensure compatibility with vLLM containers
                        // UID 1010 causes issues with Python's getpass.getuser() in shared process namespace
                        uidModelcar: 0,
                    }),
                    // LiteLLM routes to models via k8s service names, but the LLMInferenceService
                    // controller requires a valid gateway reference to pass networking reconciliation.
                    // A dummy Gateway resource is created to satisfy this validation.
                    ingress: JSON.stringify({
                        disableIngressCreation: true,
                        enableGatewayApi: true,
                        kserveIngressGateway: "kserve/kserve-ingress-gateway",
                        ingressGateway: "kserve/kserve-ingress-gateway",
                        ingressDomain: "example.com",
                        urlScheme: "http",
                    }),
                },
            },
            {
                parent: this,
                dependsOn: [this.llmisvResources],
            }
        );

        // Create a dummy Gateway resource to satisfy the LLMInferenceService controller's validation.
        // The controller always checks that the referenced Gateway exists during networking reconciliation.
        // No real traffic flows through this - LiteLLM routes to models via k8s service names directly.
        new k8s.apiextensions.CustomResource(`${name}-kserve-ingress-gateway`, {
            apiVersion: "gateway.networking.k8s.io/v1",
            kind: "Gateway",
            metadata: {
                name: "kserve-ingress-gateway",
                namespace: "kserve",
            },
            spec: {
                gatewayClassName: "kserve-gateway",
                listeners: [
                    {
                        name: "http",
                        port: 80,
                        protocol: "HTTP",
                    },
                ],
            },
        }, { parent: this, dependsOn: [this.gatewayApiCrds, this.kserveNamespace] });

        // Note: Storage initializer resources are configured via kserve.storage.resources in the Helm values
        // The default ClusterStorageContainer (created by kserve chart) handles hf://, s3://, gs://, etc.
        // HuggingFace authentication requires a separate secret with HF_TOKEN environment variable
        // See: https://kserve.github.io/website/docs/model-serving/storage/storage-containers

        this.registerOutputs({
            certManagerReleaseName: this.certManager.name,
            gatewayApiVersion: gatewayApiVersion,
            kserveCrdReleaseName: this.kserveCrd.name,
            kserveReleaseName: this.kserve.name,
            llmisvCrdReleaseName: this.llmisvCrd.name,
            llmisvResourcesReleaseName: this.llmisvResources.name,
            namespaceName: this.namespaceName,
        });
    }
}
