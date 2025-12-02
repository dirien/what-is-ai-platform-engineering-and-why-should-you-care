import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";

/**
 * Profile configuration for JupyterHub single-user servers
 */
export interface NotebookProfile {
    /**
     * Display name shown in the profile selection UI
     */
    displayName: string;
    /**
     * Description of the profile
     */
    description?: string;
    /**
     * CPU limit for the notebook server
     */
    cpuLimit?: string;
    /**
     * Memory limit for the notebook server
     */
    memoryLimit?: string;
    /**
     * CPU request for the notebook server
     */
    cpuRequest?: string;
    /**
     * Memory request for the notebook server
     */
    memoryRequest?: string;
    /**
     * Number of GPUs to allocate (0 for CPU-only)
     */
    gpuCount?: number;
    /**
     * Whether this is the default profile
     */
    default?: boolean;
}

/**
 * Arguments for creating a JupyterHub component
 */
export interface JupyterHubComponentArgs {
    /**
     * Namespace to deploy JupyterHub into
     * @default "jupyterhub"
     */
    namespace?: string;
    /**
     * Helm chart version
     * @default "4.3.1"
     */
    chartVersion?: string;
    /**
     * Custom notebook image to use
     * If not specified, uses jupyter/scipy-notebook
     */
    notebookImage?: {
        name: string;
        tag: string;
    };
    /**
     * LiteLLM service URL for notebook integration
     */
    litellmServiceUrl?: pulumi.Input<string>;
    /**
     * Notebook profiles for users to select
     */
    profiles?: NotebookProfile[];
    /**
     * Storage size for user persistent volumes
     * @default "10Gi"
     */
    storageSize?: string;
    /**
     * Storage class name for persistent volumes
     */
    storageClassName?: string;
    /**
     * Idle timeout before culling notebooks (in seconds)
     * @default 3600 (1 hour)
     */
    idleTimeout?: number;
    /**
     * Admin users list
     */
    adminUsers?: string[];
    /**
     * Whether to enable the JupyterHub admin UI
     * @default true
     */
    enableAdminUI?: boolean;
    /**
     * Whether to expose JupyterHub via LoadBalancer
     * @default false (ClusterIP)
     */
    enableLoadBalancer?: boolean;
}

export class JupyterHubComponent extends pulumi.ComponentResource {
    /**
     * The JupyterHub Helm release
     */
    public readonly release: k8s.helm.v3.Release;
    /**
     * The namespace where JupyterHub is deployed
     */
    public readonly namespace: k8s.core.v1.Namespace;
    /**
     * The proxy secret token
     */
    public readonly proxySecretToken: pulumi.Output<string>;
    /**
     * The API token for external services to access JupyterHub API
     */
    public readonly apiToken: pulumi.Output<string>;
    /**
     * The hub service name
     */
    public readonly hubServiceName: pulumi.Output<string>;
    /**
     * The proxy service name (for external access)
     */
    public readonly proxyServiceName: pulumi.Output<string>;
    /**
     * The public URL of JupyterHub (LoadBalancer hostname when enabled)
     */
    public readonly publicUrl: pulumi.Output<string>;

    constructor(name: string, args: JupyterHubComponentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("maas:jupyterhub:JupyterHubComponent", name, args, opts);

        const namespaceName = args.namespace || "jupyterhub";
        const chartVersion = args.chartVersion || "4.3.2-0.dev.git.7211.hba50290a";
        const storageSize = args.storageSize || "10Gi";
        const idleTimeout = args.idleTimeout || 3600;
        const enableLoadBalancer = args.enableLoadBalancer ?? false;

        // Create namespace for JupyterHub
        this.namespace = new k8s.core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: namespaceName,
                labels: {
                    "app.kubernetes.io/name": "jupyterhub",
                    "app.kubernetes.io/managed-by": "pulumi",
                },
            },
        }, { parent: this });

        // Generate a secure random token for the proxy
        const proxyToken = new random.RandomPassword(`${name}-proxy-token`, {
            length: 64,
            special: false,
        }, { parent: this });

        this.proxySecretToken = proxyToken.result;

        // Generate a secure API token for external services (MaaS app)
        const apiServiceToken = new random.RandomPassword(`${name}-api-token`, {
            length: 64,
            special: false,
        }, { parent: this });

        this.apiToken = apiServiceToken.result;

        // Build profile list for JupyterHub
        const defaultProfiles: NotebookProfile[] = args.profiles || [
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
        ];

        // Helper function to convert Kubernetes CPU format to float
        // e.g., "500m" -> 0.5, "2" -> 2.0
        const parseCpu = (cpu: string): number => {
            if (cpu.endsWith('m')) {
                return parseInt(cpu.slice(0, -1), 10) / 1000;
            }
            return parseFloat(cpu);
        };

        // Helper function to convert Kubernetes memory format to JupyterHub format
        // JupyterHub expects suffix K, M, G, T (not Ki, Mi, Gi, Ti)
        // e.g., "1Gi" -> "1G", "512Mi" -> "512M", "4Gi" -> "4G"
        const parseMemory = (memory: string): string => {
            // Convert binary suffixes (Ki, Mi, Gi, Ti) to decimal suffixes (K, M, G, T)
            if (memory.endsWith('Ki')) {
                return memory.slice(0, -2) + 'K';
            }
            if (memory.endsWith('Mi')) {
                return memory.slice(0, -2) + 'M';
            }
            if (memory.endsWith('Gi')) {
                return memory.slice(0, -2) + 'G';
            }
            if (memory.endsWith('Ti')) {
                return memory.slice(0, -2) + 'T';
            }
            // If already in JupyterHub format or just a number, return as-is
            return memory;
        };

        // Convert profiles to JupyterHub format
        const profileList = defaultProfiles.map(profile => {
            const kubespawnerOverride: any = {
                // CPU values must be floats (e.g., 0.5, 2.0)
                cpu_limit: parseCpu(profile.cpuLimit || "2"),
                cpu_guarantee: parseCpu(profile.cpuRequest || "0.5"),
                // Memory values must use K, M, G, T suffixes (not Ki, Mi, Gi, Ti)
                mem_limit: parseMemory(profile.memoryLimit || "4G"),
                mem_guarantee: parseMemory(profile.memoryRequest || "1G"),
            };

            // Add GPU configuration if needed
            if (profile.gpuCount && profile.gpuCount > 0) {
                kubespawnerOverride.extra_resource_limits = {
                    "nvidia.com/gpu": profile.gpuCount.toString(),
                };
                kubespawnerOverride.extra_resource_guarantees = {
                    "nvidia.com/gpu": profile.gpuCount.toString(),
                };
                // Add toleration for GPU nodes
                kubespawnerOverride.tolerations = [
                    {
                        key: "nvidia.com/gpu",
                        operator: "Exists",
                        effect: "NoSchedule",
                    },
                ];
            }

            return {
                display_name: profile.displayName,
                description: profile.description || "",
                default: profile.default || false,
                kubespawner_override: kubespawnerOverride,
            };
        });

        // Build singleuser configuration
        const singleuserConfig: any = {
            profileList: profileList,
            storage: {
                capacity: storageSize,
                dynamic: {
                    storageClass: args.storageClassName || "observability-ebs-sc",
                },
            },
            extraEnv: {
                // Configure OpenAI SDK to use LiteLLM
                OPENAI_API_BASE: args.litellmServiceUrl || "http://litellm.default.svc.cluster.local:4000",
                // Placeholder - will be overridden by API key injection
                OPENAI_API_KEY: "placeholder-inject-from-maas",
            },
            // Default to scipy-notebook if no custom image specified
            // Using latest tag which has JupyterHub 5.4.2 for compatibility with Hub 5.4.1
            image: args.notebookImage ? {
                name: args.notebookImage.name,
                tag: args.notebookImage.tag,
            } : {
                name: "quay.io/jupyter/scipy-notebook",
                tag: "latest",
            },
            // Start with JupyterLab by default
            defaultUrl: "/lab",
            // Allow users to access the terminal
            cmd: null,
        };

        // Build hub configuration with API service for external access
        const hubConfig: any = {
            config: {
                JupyterHub: {
                    admin_access: args.enableAdminUI !== false,
                },
                Authenticator: {
                    admin_users: args.adminUsers || ["admin"],
                    // Allow any user with dummy authenticator for demo
                    // In production, configure proper auth (OAuth, LDAP, etc.)
                },
            },
            // Define an API service for external applications (MaaS) to manage notebooks
            services: {
                "maas-api": {
                    api_token: apiServiceToken.result,
                    admin: true,
                },
            },
        };

        // Deploy JupyterHub using Helm
        // Using official JupyterHub Helm chart from https://hub.jupyter.org/helm-chart/
        this.release = new k8s.helm.v3.Release(`${name}-release`, {
            chart: "jupyterhub",
            version: chartVersion,
            namespace: namespaceName,
            repositoryOpts: {
                repo: "https://hub.jupyter.org/helm-chart/",
            },
            // Increase timeout for JupyterHub initialization (10 minutes)
            timeout: 600,
            // Skip waiting for resources to be ready to avoid timeout issues
            skipAwait: true,
            values: {
                proxy: {
                    secretToken: proxyToken.result,
                    service: {
                        type: enableLoadBalancer ? "LoadBalancer" : "ClusterIP",
                        // AWS Load Balancer Controller annotations for internet-facing NLB
                        annotations: enableLoadBalancer ? {
                            "service.beta.kubernetes.io/aws-load-balancer-scheme": "internet-facing",
                            "service.beta.kubernetes.io/aws-load-balancer-type": "external",
                            "service.beta.kubernetes.io/aws-load-balancer-nlb-target-type": "ip",
                        } : {},
                    },
                    // Proxy container resources
                    chp: {
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
                    },
                },
                hub: {
                    ...hubConfig,
                    // Hub container resources
                    resources: {
                        requests: {
                            cpu: "200m",
                            memory: "512Mi",
                        },
                        limits: {
                            cpu: "1000m",
                            memory: "1Gi",
                        },
                    },
                },
                singleuser: singleuserConfig,
                // Enable idle culler using built-in configuration
                cull: {
                    enabled: true,
                    timeout: idleTimeout,
                    every: 300,
                    concurrency: 10,
                },
                scheduling: {
                    userScheduler: {
                        enabled: false,
                    },
                    userPlaceholder: {
                        enabled: false,
                    },
                },
                // Disable prePuller to speed up deployment
                prePuller: {
                    hook: {
                        enabled: false,
                    },
                    continuous: {
                        enabled: false,
                    },
                },
                // Use simple dummy authenticator for demo
                // Replace with proper auth in production
                debug: {
                    enabled: false,
                },
            },
        }, {
            parent: this,
            dependsOn: [this.namespace],
        });

        this.hubServiceName = pulumi.interpolate`hub`;
        this.proxyServiceName = pulumi.interpolate`proxy-public`;

        // Get the proxy-public service to extract LoadBalancer hostname
        // The service is created by the Helm chart, so we need to look it up after deployment
        if (enableLoadBalancer) {
            // Look up the service created by Helm to get the LoadBalancer hostname
            const proxyService = k8s.core.v1.Service.get(
                `${name}-proxy-service-lookup`,
                pulumi.interpolate`${namespaceName}/proxy-public`,
                { parent: this, dependsOn: [this.release] }
            );

            // Get the LoadBalancer hostname or IP
            this.publicUrl = proxyService.status.apply(status => {
                const ingress = status?.loadBalancer?.ingress?.[0];
                if (ingress?.hostname) {
                    return `http://${ingress.hostname}`;
                } else if (ingress?.ip) {
                    return `http://${ingress.ip}`;
                }
                return `http://proxy-public.${namespaceName}.svc.cluster.local`;
            });
        } else {
            this.publicUrl = pulumi.interpolate`http://proxy-public.${namespaceName}.svc.cluster.local`;
        }

        this.registerOutputs({
            namespace: this.namespace.metadata.name,
            proxySecretToken: this.proxySecretToken,
            apiToken: this.apiToken,
            hubServiceName: this.hubServiceName,
            proxyServiceName: this.proxyServiceName,
            publicUrl: this.publicUrl,
        });
    }
}
