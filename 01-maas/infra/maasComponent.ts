import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Arguments for creating a MaaS (Model-as-a-Service) component
 */
export interface MaaSComponentArgs {
    /**
     * Namespace to deploy MaaS into
     * @default "maas"
     */
    namespace?: pulumi.Input<string>;
    /**
     * Docker image reference for the MaaS app
     */
    imageRef: pulumi.Input<string>;
    /**
     * LiteLLM Helm chart version
     * @default "0.1.825"
     */
    litellmChartVersion?: pulumi.Input<string>;
    /**
     * LiteLLM UI username
     * @default "admin"
     */
    litellmUsername?: pulumi.Input<string>;
    /**
     * LiteLLM UI password
     * @default "admin"
     */
    litellmPassword?: pulumi.Input<string>;
    /**
     * JupyterHub API URL for notebook management (internal)
     */
    jupyterhubApiUrl?: pulumi.Input<string>;
    /**
     * JupyterHub public URL for browser redirects
     */
    jupyterhubPublicUrl?: pulumi.Input<string>;
    /**
     * JupyterHub API token
     */
    jupyterhubApiToken?: pulumi.Input<string>;
    /**
     * Whether to expose MaaS app via LoadBalancer
     * @default true
     */
    enableLoadBalancer?: boolean;
    /**
     * Resource requests/limits for LiteLLM
     */
    litellmResources?: {
        requests?: {
            cpu?: pulumi.Input<string>;
            memory?: pulumi.Input<string>;
        };
        limits?: {
            cpu?: pulumi.Input<string>;
            memory?: pulumi.Input<string>;
        };
    };
    /**
     * Resource requests/limits for MaaS app
     */
    appResources?: {
        requests?: {
            cpu?: pulumi.Input<string>;
            memory?: pulumi.Input<string>;
        };
        limits?: {
            cpu?: pulumi.Input<string>;
            memory?: pulumi.Input<string>;
        };
    };
}

/**
 * MaaSComponent bundles LiteLLM API gateway and MaaS frontend app
 * into a single deployable component in a dedicated namespace.
 */
export class MaaSComponent extends pulumi.ComponentResource {
    /**
     * The namespace where MaaS is deployed
     */
    public readonly namespace: k8s.core.v1.Namespace;
    /**
     * The LiteLLM Helm release
     */
    public readonly litellm: k8s.helm.v3.Release;
    /**
     * The MaaS app deployment
     */
    public readonly appDeployment: k8s.apps.v1.Deployment;
    /**
     * The MaaS app service
     */
    public readonly appService: k8s.core.v1.Service;
    /**
     * LiteLLM service URL (internal)
     */
    public readonly litellmServiceUrl: pulumi.Output<string>;
    /**
     * MaaS app service URL (internal)
     */
    public readonly appServiceUrl: pulumi.Output<string>;
    /**
     * MaaS app public URL (LoadBalancer)
     */
    public readonly publicUrl: pulumi.Output<string>;
    /**
     * LiteLLM release name
     */
    public readonly litellmReleaseName: pulumi.Output<string>;

    constructor(name: string, args: MaaSComponentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("maas:platform:MaaSComponent", name, args, opts);

        const namespaceName = args.namespace || "maas";
        const litellmChartVersion = args.litellmChartVersion || "0.1.825";
        const enableLoadBalancer = args.enableLoadBalancer ?? true;

        // Create dedicated namespace for MaaS
        this.namespace = new k8s.core.v1.Namespace(`${name}-namespace`, {
            metadata: {
                name: namespaceName,
                labels: {
                    "app.kubernetes.io/name": "maas",
                    "app.kubernetes.io/managed-by": "pulumi",
                    "app.kubernetes.io/component": "platform",
                },
            },
        }, { parent: this });

        // Deploy LiteLLM as the API gateway for model inference
        this.litellm = new k8s.helm.v3.Release(`${name}-litellm`, {
            chart: "oci://ghcr.io/berriai/litellm-helm",
            version: litellmChartVersion,
            namespace: namespaceName,
            values: {
                envVars: {
                    UI_USERNAME: args.litellmUsername || "admin",
                    UI_PASSWORD: args.litellmPassword || "admin",
                    STORE_MODEL_IN_DB: "True",
                },
                resources: args.litellmResources || {
                    requests: {
                        cpu: "500m",
                        memory: "1Gi",
                    },
                    limits: {
                        cpu: "2000m",
                        memory: "4Gi",
                    },
                },
                postgresql: {
                    primary: {
                        resources: {
                            requests: {
                                cpu: "250m",
                                memory: "512Mi",
                            },
                            limits: {
                                cpu: "1000m",
                                memory: "2Gi",
                            },
                        },
                    },
                },
            },
        }, { parent: this, dependsOn: [this.namespace] });

        this.litellmReleaseName = this.litellm.name;
        this.litellmServiceUrl = pulumi.interpolate`http://${this.litellm.name}.${namespaceName}.svc.cluster.local:4000`;

        // Create JupyterHub API token secret if provided
        let jupyterhubApiSecret: k8s.core.v1.Secret | undefined;
        if (args.jupyterhubApiToken) {
            jupyterhubApiSecret = new k8s.core.v1.Secret(`${name}-jupyterhub-api-secret`, {
                metadata: {
                    name: "jupyterhub-api-token",
                    namespace: namespaceName,
                },
                stringData: {
                    token: args.jupyterhubApiToken,
                },
            }, { parent: this, dependsOn: [this.namespace] });
        }

        // App labels
        const appLabels = { app: "maas" };

        // Build environment variables for the MaaS app
        const envVars: k8s.types.input.core.v1.EnvVar[] = [
            {
                name: "PORT",
                value: "3001",
            },
            {
                name: "LITELLM_API_BASE",
                value: pulumi.interpolate`http://${this.litellm.name}.${namespaceName}.svc.cluster.local:4000`,
            },
            {
                name: "LITELLM_MASTER_KEY",
                valueFrom: {
                    secretKeyRef: {
                        name: pulumi.interpolate`${this.litellm.name}-masterkey`,
                        key: "masterkey",
                    },
                },
            },
        ];

        // Add JupyterHub env vars if configured
        if (args.jupyterhubApiUrl) {
            envVars.push({
                name: "JUPYTERHUB_API_URL",
                value: args.jupyterhubApiUrl,
            });
        }
        if (args.jupyterhubPublicUrl) {
            envVars.push({
                name: "JUPYTERHUB_PUBLIC_URL",
                value: args.jupyterhubPublicUrl,
            });
        }
        if (jupyterhubApiSecret) {
            envVars.push({
                name: "JUPYTERHUB_API_TOKEN",
                valueFrom: {
                    secretKeyRef: {
                        name: jupyterhubApiSecret.metadata.name,
                        key: "token",
                    },
                },
            });
        }

        // Deploy the MaaS app
        this.appDeployment = new k8s.apps.v1.Deployment(`${name}-deployment`, {
            metadata: {
                name: "maas",
                namespace: namespaceName,
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
                            name: "maas",
                            image: args.imageRef,
                            ports: [{
                                containerPort: 3001,
                                name: "http",
                            }],
                            env: envVars,
                            resources: args.appResources || {
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
        }, {
            parent: this,
            dependsOn: jupyterhubApiSecret
                ? [this.litellm, this.namespace, jupyterhubApiSecret]
                : [this.litellm, this.namespace],
        });

        // Create service for the MaaS app
        // Use AWS Load Balancer Controller annotations for internet-facing NLB
        this.appService = new k8s.core.v1.Service(`${name}-service`, {
            metadata: {
                name: "maas",
                namespace: namespaceName,
                labels: appLabels,
                annotations: enableLoadBalancer ? {
                    // Use AWS Load Balancer Controller (required for EKS Auto Mode)
                    "service.beta.kubernetes.io/aws-load-balancer-scheme": "internet-facing",
                    "service.beta.kubernetes.io/aws-load-balancer-type": "external",
                    "service.beta.kubernetes.io/aws-load-balancer-nlb-target-type": "ip",
                } : undefined,
            },
            spec: {
                type: enableLoadBalancer ? "LoadBalancer" : "ClusterIP",
                selector: appLabels,
                ports: [{
                    port: 80,
                    targetPort: 3001,
                    protocol: "TCP",
                    name: "http",
                }],
            },
        }, { parent: this, dependsOn: [this.namespace] });

        // Set output URLs
        this.appServiceUrl = pulumi.interpolate`http://maas.${namespaceName}.svc.cluster.local`;

        if (enableLoadBalancer) {
            this.publicUrl = this.appService.status.apply(status => {
                const ingress = status?.loadBalancer?.ingress?.[0];
                if (ingress?.hostname) {
                    return `http://${ingress.hostname}`;
                } else if (ingress?.ip) {
                    return `http://${ingress.ip}`;
                }
                return `http://maas.${namespaceName}.svc.cluster.local`;
            });
        } else {
            this.publicUrl = pulumi.interpolate`http://maas.${namespaceName}.svc.cluster.local`;
        }

        this.registerOutputs({
            namespace: this.namespace.metadata.name,
            litellmReleaseName: this.litellmReleaseName,
            litellmServiceUrl: this.litellmServiceUrl,
            appServiceUrl: this.appServiceUrl,
            publicUrl: this.publicUrl,
        });
    }
}
