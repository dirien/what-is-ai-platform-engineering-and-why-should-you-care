import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Deployment mode for KServe
 * - RawDeployment: Avoids installing Istio/Knative (simpler setup)
 * - Serverless: Uses Knative for scale-to-zero capabilities
 */
export type KServeDeploymentMode = "RawDeployment" | "Serverless";

/**
 * Arguments for creating a KServe component
 */
export interface KServeComponentArgs {
    /**
     * Version of cert-manager to install
     * @default "v1.16.1"
     */
    certManagerVersion?: pulumi.Input<string>;

    /**
     * Version of KServe to install
     * @default "v0.16.0"
     */
    kserveVersion?: pulumi.Input<string>;

    /**
     * Deployment mode for KServe controller
     * - RawDeployment: Avoids Istio/Knative dependencies
     * - Serverless: Requires Knative (not configured by this component)
     * @default "RawDeployment"
     */
    deploymentMode?: KServeDeploymentMode;

    /**
     * Whether to install the default ClusterServingRuntimes (HuggingFace, vLLM, etc.)
     * @default true
     */
    installServingRuntimes?: boolean;

    /**
     * Timeout in seconds for waiting for cert-manager pods to be ready
     * @default 90
     */
    certManagerReadyTimeout?: number;
}

/**
 * KServeComponent installs KServe v0.16 with all required dependencies:
 * - Cert-Manager (required for webhook certificates)
 * - KServe CRDs
 * - KServe Controller
 * - KServe Serving Runtimes (optional, enabled by default)
 *
 * Uses RawDeployment mode by default to avoid Istio/Knative dependencies.
 */
export class KServeComponent extends pulumi.ComponentResource {
    /**
     * The cert-manager Helm release
     */
    public readonly certManager: k8s.helm.v3.Release;

    /**
     * The KServe CRD Helm release
     */
    public readonly kserveCrd: k8s.helm.v3.Release;

    /**
     * The KServe controller Helm release
     */
    public readonly kserve: k8s.helm.v3.Release;

    /**
     * The LLMInferenceService CRD Helm release (required for LLM features)
     */
    public readonly llmisvCrd?: k8s.helm.v3.Release;

    /**
     * The KServe namespace
     */
    public readonly kserveNamespace: k8s.core.v1.Namespace;

    constructor(name: string, args: KServeComponentArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("kserve:index:KServeComponent", name, args, opts);

        const certManagerVersion = args.certManagerVersion ?? "v1.16.1";
        const kserveVersion = args.kserveVersion ?? "v0.16.0";
        const deploymentMode = args.deploymentMode ?? "RawDeployment";
        const installServingRuntimes = args.installServingRuntimes ?? true;

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
                    },
                },
            },
        }, { parent: this, dependsOn: [this.kserveCrd] });

        // Install LLMInferenceService CRDs (required for LLM features in v0.16+)
        // The kserve helm chart already includes ClusterServingRuntimes for all supported frameworks
        if (installServingRuntimes) {
            this.llmisvCrd = new k8s.helm.v3.Release(`${name}-llmisvc-crd`, {
                name: "llmisvc-crd",
                chart: "oci://ghcr.io/kserve/charts/llmisvc-crd",
                version: kserveVersion,
                namespace: this.kserveNamespace.metadata.name,
            }, { parent: this, dependsOn: [this.kserve] });
        }

        this.registerOutputs({
            certManagerReleaseName: this.certManager.name,
            kserveCrdReleaseName: this.kserveCrd.name,
            kserveReleaseName: this.kserve.name,
            kserveResourcesInstalled: installServingRuntimes,
            kserveNamespaceName: this.kserveNamespace.metadata.name,
        });
    }
}
