import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

export interface GpuOperatorComponentArgs {
    /**
     * Namespace for the GPU Operator
     * @default "gpu-operator"
     */
    namespace?: string;

    /**
     * GPU Operator Helm chart version
     * @default "v25.3.0"
     */
    gpuOperatorVersion?: string;
}

export class GpuOperatorComponent extends pulumi.ComponentResource {
    private readonly gpuOperatorRelease: k8s.helm.v3.Release;

    constructor(name: string, args: GpuOperatorComponentArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("nvidia:index:GpuOperatorComponent", name, args, opts);

        const namespace = args.namespace ?? "gpu-operator";
        const gpuOperatorVersion = args.gpuOperatorVersion ?? "v25.3.0";

        const gpuOperatorNamespace = new k8s.core.v1.Namespace(`${name}-ns`, {
            metadata: {
                name: namespace,
            },
        }, { parent: this });

        // Custom MIG config ConfigMap for H100 GPUs
        // GPU Operator v25.3.0 doesn't ship default MIG profiles — must provide them
        const migConfigMap = new k8s.core.v1.ConfigMap(`${name}-mig-config`, {
            metadata: {
                name: "custom-mig-parted-config",
                namespace: gpuOperatorNamespace.metadata.name,
            },
            data: {
                "config.yaml": `version: v1
mig-configs:
  all-disabled:
    - devices: all
      mig-enabled: false
  all-3g.40gb:
    - devices: all
      mig-enabled: true
      mig-devices:
        3g.40gb: 2
`,
            },
        }, { parent: this, dependsOn: [gpuOperatorNamespace] });

        this.gpuOperatorRelease = new k8s.helm.v3.Release(`${name}-release`, {
            name: "gpu-operator",
            chart: "gpu-operator",
            version: gpuOperatorVersion,
            namespace: gpuOperatorNamespace.metadata.name,
            repositoryOpts: {
                repo: "https://helm.ngc.nvidia.com/nvidia",
            },
            values: {
                driver: { enabled: false },
                toolkit: { enabled: false },
                devicePlugin: {
                    enabled: true,
                    nodeSelector: { "gpu-type": "h100" },
                    tolerations: [{ key: "nvidia.com/gpu", operator: "Equal", value: "h100", effect: "NoSchedule" }],
                },
                nfd: { enabled: true },
                mig: { strategy: "mixed" },
                migManager: {
                    enabled: true,
                    env: [{ name: "WITH_REBOOT", value: "true" }],
                    config: {
                        name: migConfigMap.metadata.name,
                        default: "all-disabled",
                    },
                    nodeSelector: { "gpu-type": "h100" },
                    tolerations: [{ key: "nvidia.com/gpu", operator: "Equal", value: "h100", effect: "NoSchedule" }],
                },
                dcgmExporter: { enabled: false },
                operator: { defaultRuntime: "containerd" },
            },
            waitForJobs: true,
        }, { parent: this, dependsOn: [gpuOperatorNamespace, migConfigMap] });

        this.registerOutputs({
            releaseName: this.gpuOperatorRelease.name,
            namespaceName: gpuOperatorNamespace.metadata.name,
        });
    }
}
