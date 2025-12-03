import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Configuration for the metrics server
 */
export interface MetricsServerConfig {
    /**
     * Enable metrics server deployment
     * @default true
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Helm chart version
     * @default "3.13.0"
     */
    version?: pulumi.Input<string>;
}

/**
 * Configuration for the kube-prometheus-stack
 */
export interface PrometheusStackConfig {
    /**
     * Helm chart version
     * @default "79.9.0"
     */
    version?: pulumi.Input<string>;
    /**
     * Enable alertmanager
     * @default false
     */
    alertmanagerEnabled?: pulumi.Input<boolean>;
    /**
     * Prometheus storage size
     * @default "50Gi"
     */
    storageSize?: pulumi.Input<string>;
    /**
     * Storage class name for persistent volumes
     */
    storageClassName?: pulumi.Input<string>;
}

/**
 * Configuration for Grafana
 */
export interface GrafanaConfig {
    /**
     * Enable Grafana
     * @default true
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Admin password
     * @default "admin"
     */
    adminPassword?: pulumi.Input<string>;
    /**
     * Storage size for Grafana
     * @default "10Gi"
     */
    storageSize?: pulumi.Input<string>;
    /**
     * Additional dashboard IDs from grafana.com to provision
     * Format: { name: { gnetId: number, revision: number, datasource: string } }
     */
    additionalDashboards?: pulumi.Input<Record<string, {
        gnetId: number;
        revision: number;
        datasource: string;
    }>>;
}

/**
 * Configuration for NVIDIA DCGM Exporter (GPU metrics)
 */
export interface DcgmExporterConfig {
    /**
     * Enable DCGM exporter
     * @default true
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Helm chart version
     * @default "4.6.0"
     */
    version?: pulumi.Input<string>;
    /**
     * Node selector for GPU nodes
     */
    nodeSelector?: pulumi.Input<Record<string, pulumi.Input<string>>>;
    /**
     * Tolerations for GPU nodes
     */
    tolerations?: pulumi.Input<k8s.types.input.core.v1.Toleration[]>;
    /**
     * Memory request
     * @default "512Mi"
     */
    memoryRequest?: pulumi.Input<string>;
    /**
     * Memory limit
     * @default "1Gi"
     */
    memoryLimit?: pulumi.Input<string>;
}

/**
 * Arguments for the ObservabilityComponent
 */
export interface ObservabilityComponentArgs {
    /**
     * Namespace for observability stack
     * @default "monitoring"
     */
    namespace?: pulumi.Input<string>;
    /**
     * Storage class name for persistent volumes
     * @default "gp3" (assumes gp3 StorageClass is created in main infrastructure)
     */
    storageClassName?: pulumi.Input<string>;
    /**
     * Metrics server configuration
     */
    metricsServer?: MetricsServerConfig;
    /**
     * kube-prometheus-stack configuration
     */
    prometheusStack?: PrometheusStackConfig;
    /**
     * Grafana configuration
     */
    grafana?: GrafanaConfig;
    /**
     * DCGM exporter configuration for GPU metrics
     */
    dcgmExporter?: DcgmExporterConfig;
}

/**
 * ObservabilityComponent deploys a complete observability stack including:
 * - Metrics Server for Kubernetes metrics (HPA support)
 * - kube-prometheus-stack (Prometheus, Grafana, node-exporter, kube-state-metrics)
 * - NVIDIA DCGM Exporter for GPU metrics
 *
 * The component creates all necessary resources with sensible defaults
 * and pre-provisions the NVIDIA DCGM dashboard for GPU monitoring.
 */
export class ObservabilityComponent extends pulumi.ComponentResource {
    /**
     * The metrics server Helm release
     */
    public readonly metricsServer?: k8s.helm.v3.Release;
    /**
     * The kube-prometheus-stack Helm release
     */
    public readonly kubePrometheusStack: k8s.helm.v3.Release;
    /**
     * The DCGM exporter Helm release
     */
    public readonly dcgmExporter?: k8s.helm.v3.Release;
    /**
     * The namespace where observability components are deployed
     */
    public readonly namespace: pulumi.Output<string>;
    /**
     * The Grafana service name for port-forwarding
     */
    public readonly grafanaServiceName: pulumi.Output<string>;

    constructor(name: string, args: ObservabilityComponentArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("custom:observability:ObservabilityComponent", name, {}, opts);

        const namespace = args.namespace ?? "monitoring";
        this.namespace = pulumi.output(namespace);

        // Default configurations
        const metricsServerConfig = {
            enabled: args.metricsServer?.enabled ?? true,
            version: args.metricsServer?.version ?? "3.13.0",
        };

        const prometheusStackConfig = {
            version: args.prometheusStack?.version ?? "79.9.0",
            alertmanagerEnabled: args.prometheusStack?.alertmanagerEnabled ?? false,
            storageSize: args.prometheusStack?.storageSize ?? "50Gi",
        };

        const grafanaConfig = {
            enabled: args.grafana?.enabled ?? true,
            adminPassword: args.grafana?.adminPassword ?? "admin",
            storageSize: args.grafana?.storageSize ?? "10Gi",
        };

        const dcgmExporterConfig = {
            enabled: args.dcgmExporter?.enabled ?? true,
            version: args.dcgmExporter?.version ?? "4.6.0",
            memoryRequest: args.dcgmExporter?.memoryRequest ?? "512Mi",
            memoryLimit: args.dcgmExporter?.memoryLimit ?? "1Gi",
        };


        // Use provided storage class name or default to "gp3"
        // The gp3 StorageClass should be created in the main infrastructure (index.ts)
        const storageClassName = args.storageClassName ?? "gp3";

        // Deploy Metrics Server
        if (metricsServerConfig.enabled) {
            this.metricsServer = new k8s.helm.v3.Release(`${name}-metrics-server`, {
                chart: "metrics-server",
                version: metricsServerConfig.version,
                repositoryOpts: {
                    repo: "https://kubernetes-sigs.github.io/metrics-server/",
                },
                namespace: "kube-system",
            }, { parent: this });
        }

        // Build Grafana dashboard providers and dashboards
        const dashboardProviders: any = {
            "dashboardproviders.yaml": {
                apiVersion: 1,
                providers: [
                    {
                        name: "nvidia-dcgm",
                        orgId: 1,
                        folder: "NVIDIA",
                        type: "file",
                        disableDeletion: false,
                        editable: true,
                        options: {
                            path: "/var/lib/grafana/dashboards/nvidia-dcgm",
                        },
                    },
                ],
            },
        };

        const dashboards: any = {
            "nvidia-dcgm": {
                "nvidia-dcgm-exporter": {
                    gnetId: 12239,
                    revision: 2,
                    datasource: "Prometheus",
                },
            },
        };

        // Add additional dashboards if provided
        if (args.grafana?.additionalDashboards) {
            dashboardProviders["dashboardproviders.yaml"].providers.push({
                name: "custom",
                orgId: 1,
                folder: "Custom",
                type: "file",
                disableDeletion: false,
                editable: true,
                options: {
                    path: "/var/lib/grafana/dashboards/custom",
                },
            });
            dashboards["custom"] = args.grafana.additionalDashboards;
        }

        // Deploy kube-prometheus-stack
        this.kubePrometheusStack = new k8s.helm.v3.Release(`${name}-kube-prometheus-stack`, {
            chart: "kube-prometheus-stack",
            version: prometheusStackConfig.version,
            repositoryOpts: {
                repo: "https://prometheus-community.github.io/helm-charts",
            },
            namespace: namespace,
            createNamespace: true,
            values: {
                alertmanager: {
                    enabled: prometheusStackConfig.alertmanagerEnabled,
                },
                prometheus: {
                    prometheusSpec: {
                        storageSpec: {
                            volumeClaimTemplate: {
                                spec: {
                                    storageClassName: storageClassName,
                                    accessModes: ["ReadWriteOnce"],
                                    resources: {
                                        requests: {
                                            storage: prometheusStackConfig.storageSize,
                                        },
                                    },
                                },
                            },
                        },
                        // ServiceMonitor selector to pick up DCGM exporter and other monitors
                        serviceMonitorSelectorNilUsesHelmValues: false,
                        podMonitorSelectorNilUsesHelmValues: false,
                    },
                },
                grafana: {
                    enabled: grafanaConfig.enabled,
                    adminPassword: grafanaConfig.adminPassword,
                    persistence: {
                        enabled: true,
                        storageClassName: storageClassName,
                        size: grafanaConfig.storageSize,
                    },
                    dashboardProviders: dashboardProviders,
                    dashboards: dashboards,
                    sidecar: {
                        dashboards: {
                            enabled: true,
                        },
                    },
                },
                kubeStateMetrics: {
                    enabled: true,
                },
                nodeExporter: {
                    enabled: true,
                },
                prometheusOperator: {
                    enabled: true,
                },
            },
        }, { parent: this });

        // Extract Grafana service name from the release
        this.grafanaServiceName = this.kubePrometheusStack.name.apply(
            releaseName => `${releaseName}-grafana`
        );

        // Deploy DCGM Exporter for GPU metrics
        if (dcgmExporterConfig.enabled) {
            const dcgmValues: any = {
                serviceMonitor: {
                    enabled: true,
                    interval: "15s",
                    honorLabels: false,
                    additionalLabels: {
                        release: this.kubePrometheusStack.name,
                    },
                },
                resources: {
                    requests: {
                        cpu: "100m",
                        memory: dcgmExporterConfig.memoryRequest,
                    },
                    limits: {
                        cpu: "500m",
                        memory: dcgmExporterConfig.memoryLimit,
                    },
                },
            };

            // Add tolerations if provided
            if (args.dcgmExporter?.tolerations) {
                dcgmValues.tolerations = args.dcgmExporter.tolerations;
            } else {
                // Default GPU tolerations
                dcgmValues.tolerations = [
                    {
                        key: "nvidia.com/gpu",
                        operator: "Exists",
                        effect: "NoSchedule",
                    },
                ];
            }

            // Add node selector if provided
            if (args.dcgmExporter?.nodeSelector) {
                dcgmValues.nodeSelector = args.dcgmExporter.nodeSelector;
            }

            this.dcgmExporter = new k8s.helm.v3.Release(`${name}-dcgm-exporter`, {
                chart: "dcgm-exporter",
                version: dcgmExporterConfig.version,
                repositoryOpts: {
                    repo: "https://nvidia.github.io/dcgm-exporter/helm-charts",
                },
                namespace: namespace,
                values: dcgmValues,
            }, { parent: this, dependsOn: [this.kubePrometheusStack] });
        }

        this.registerOutputs({
            namespace: this.namespace,
            grafanaServiceName: this.grafanaServiceName,
        });
    }
}
