import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as random from "@pulumi/random";

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
     * @default "1.81.12-stable"
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
     * LiteLLM master key for admin API access
     */
    litellmMasterKey?: pulumi.Input<string>;
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
     * VPC ID for RDS subnet group
     */
    vpcId: pulumi.Input<string>;
    /**
     * Private subnet IDs for RDS
     */
    privateSubnetIds: pulumi.Input<string[]>;
    /**
     * EKS cluster security group ID (for RDS ingress rule)
     */
    clusterSecurityGroupId: pulumi.Input<string>;
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

    /**
     * Tags to apply to taggable AWS resources and load balancer artifacts
     */
    tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

/**
 * MaaSComponent bundles LiteLLM API gateway and MaaS frontend app
 * into a single deployable component in a dedicated namespace.
 */
export class MaaSComponent extends pulumi.ComponentResource {
    /**
     * The namespace where MaaS is deployed (internal implementation detail)
     */
    private readonly namespace: k8s.core.v1.Namespace;
    /**
     * The LiteLLM Helm release (internal implementation detail)
     */
    private readonly litellm: k8s.helm.v3.Release;
    /**
     * The LiteLLM LoadBalancer service (internal implementation detail)
     */
    private readonly litellmService: k8s.core.v1.Service;
    /**
     * The MaaS app deployment (internal implementation detail)
     */
    private readonly appDeployment: k8s.apps.v1.Deployment;
    /**
     * The MaaS app service (internal implementation detail)
     */
    private readonly appService: k8s.core.v1.Service;
    /**
     * The namespace name where MaaS is deployed
     */
    public readonly namespaceName: pulumi.Output<string>;
    /**
     * LiteLLM service URL (internal)
     */
    public readonly litellmServiceUrl: pulumi.Output<string>;
    /**
     * LiteLLM public URL (LoadBalancer)
     */
    public readonly litellmPublicUrl: pulumi.Output<string>;
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
    /**
     * RDS PostgreSQL endpoint
     */
    public readonly rdsEndpoint: pulumi.Output<string>;

    constructor(name: string, args: MaaSComponentArgs, opts?: pulumi.ComponentResourceOptions) {
        super("maas:platform:MaaSComponent", name, args, opts);

        const namespaceName = args.namespace || "maas";
        const litellmChartVersion = args.litellmChartVersion || "1.81.12-stable";
        const enableLoadBalancer = args.enableLoadBalancer ?? true;
        const withNameTag = (nameTag: pulumi.Input<string>) => pulumi.all([args.tags, nameTag]).apply(([resourceTags, name]) => ({
            ...(resourceTags || {}),
            Name: name,
        }));
        const loadBalancerAdditionalTags = pulumi.output(args.tags).apply(resourceTags =>
            Object.entries(resourceTags || {})
                .map(([key, value]) => `${key}=${value}`)
                .join(",")
        );

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

        // RDS PostgreSQL for LiteLLM persistence
        const dbPassword = new random.RandomPassword(`${name}-db-password`, {
            length: 24,
            special: false,
        }, { parent: this });

        const saltKey = new random.RandomPassword(`${name}-salt-key`, {
            length: 32,
            special: false,
        }, { parent: this });

        const dbSubnetGroup = new aws.rds.SubnetGroup(`${name}-db-subnet-group`, {
            name: pulumi.interpolate`${namespaceName}-litellm-db`,
            subnetIds: args.privateSubnetIds,
            tags: withNameTag(pulumi.interpolate`${namespaceName}-litellm-db`),
        }, { parent: this });

        const dbSecurityGroup = new aws.ec2.SecurityGroup(`${name}-db-sg`, {
            name: pulumi.interpolate`${namespaceName}-litellm-db`,
            description: "Allow PostgreSQL access from EKS cluster",
            vpcId: args.vpcId,
            ingress: [{
                protocol: "tcp",
                fromPort: 5432,
                toPort: 5432,
                securityGroups: [args.clusterSecurityGroupId],
                description: "PostgreSQL from EKS",
            }],
            egress: [{
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
            }],
            tags: withNameTag(pulumi.interpolate`${namespaceName}-litellm-db`),
        }, { parent: this });

        const dbInstance = new aws.rds.Instance(`${name}-db`, {
            identifier: pulumi.interpolate`${namespaceName}-litellm`,
            engine: "postgres",
            engineVersion: "16.12",
            instanceClass: "db.t4g.micro",
            allocatedStorage: 20,
            storageEncrypted: true,
            dbName: "litellm",
            username: "litellm",
            password: dbPassword.result,
            dbSubnetGroupName: dbSubnetGroup.name,
            vpcSecurityGroupIds: [dbSecurityGroup.id],
            backupRetentionPeriod: 7,
            skipFinalSnapshot: false,
            finalSnapshotIdentifier: pulumi.interpolate`${namespaceName}-litellm-final`,
            copyTagsToSnapshot: true,
            tags: withNameTag(pulumi.interpolate`${namespaceName}-litellm`),
        }, { parent: this });

        const databaseUrl = pulumi.interpolate`postgresql://litellm:${dbPassword.result}@${dbInstance.endpoint}/litellm`;

        this.rdsEndpoint = dbInstance.endpoint;

        // Create DB credentials secret for the Helm chart's db.secret reference
        const dbCredentialsSecret = new k8s.core.v1.Secret(`${name}-db-credentials`, {
            metadata: {
                name: `${namespaceName}-litellm-db-credentials`,
                namespace: namespaceName,
            },
            stringData: {
                username: "litellm",
                password: dbPassword.result,
            },
        }, { parent: this, dependsOn: [this.namespace] });

        // Deploy LiteLLM as the API gateway for model inference
        this.litellm = new k8s.helm.v3.Release(`${name}-litellm`, {
            chart: "oci://ghcr.io/berriai/litellm-helm",
            version: litellmChartVersion,
            namespace: namespaceName,
            values: {
                // Use external RDS PostgreSQL - disable bundled PostgreSQL entirely
                db: {
                    deployStandalone: false,
                    useExisting: true,
                    endpoint: dbInstance.address,
                    secret: {
                        name: `${namespaceName}-litellm-db-credentials`,
                        usernameKey: "username",
                        passwordKey: "password",
                    },
                },
                // Disable migrations job - LiteLLM will auto-migrate with DISABLE_SCHEMA_UPDATE=false
                migrationJob: { enabled: false },
                // Set explicit master key so PROXY_MASTER_KEY matches what MaaS app reads from the secret
                masterkey: args.litellmMasterKey || "sk-litellm-master-key",
                envVars: {
                    UI_USERNAME: args.litellmUsername || "admin",
                    UI_PASSWORD: args.litellmPassword || "admin",
                    STORE_MODEL_IN_DB: "True",
                    DISABLE_SCHEMA_UPDATE: "false",
                    DATABASE_URL: databaseUrl,
                    LITELLM_MASTER_KEY: args.litellmMasterKey || "sk-litellm-master-key",
                    LITELLM_SALT_KEY: saltKey.result,
                    WEBHOOK_URL: pulumi.interpolate`http://maas.${namespaceName}.svc.cluster.local/api/webhooks/budget`,
                },
                masterConfig: {
                    general_settings: {
                        alerting: ["webhook"],
                    },
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
            },
        }, { parent: this, dependsOn: [this.namespace, dbInstance, dbCredentialsSecret] });

        this.namespaceName = this.namespace.metadata.apply(m => m.name!);
        this.litellmReleaseName = this.litellm.name;
        this.litellmServiceUrl = pulumi.interpolate`http://${this.litellm.name}.${namespaceName}.svc.cluster.local:4000`;

        // Create LoadBalancer service for LiteLLM to expose it externally
        // This allows users to call the LiteLLM API directly from outside the cluster
        this.litellmService = new k8s.core.v1.Service(`${name}-litellm-lb`, {
            metadata: {
                name: "litellm-lb",
                namespace: namespaceName,
                labels: {
                    "app.kubernetes.io/name": "litellm",
                    "app.kubernetes.io/instance": this.litellm.name,
                },
                annotations: enableLoadBalancer ? {
                    // Use AWS Load Balancer Controller (required for EKS Auto Mode)
                    "service.beta.kubernetes.io/aws-load-balancer-scheme": "internet-facing",
                    "service.beta.kubernetes.io/aws-load-balancer-type": "external",
                    "service.beta.kubernetes.io/aws-load-balancer-nlb-target-type": "ip",
                    "pulumi.com/skipAwait": "true",
                    ...(args.tags ? {
                        "service.beta.kubernetes.io/aws-load-balancer-additional-resource-tags": loadBalancerAdditionalTags,
                    } : {}),
                } : undefined,
            },
            spec: {
                type: enableLoadBalancer ? "LoadBalancer" : "ClusterIP",
                selector: {
                    "app.kubernetes.io/name": "litellm",
                    "app.kubernetes.io/instance": this.litellm.name,
                },
                ports: [{
                    port: 4000,
                    targetPort: 4000,
                    protocol: "TCP",
                    name: "http",
                }],
            },
        }, { parent: this, dependsOn: [this.litellm, this.namespace] });

        // Set LiteLLM public URL from LoadBalancer
        if (enableLoadBalancer) {
            this.litellmPublicUrl = this.litellmService.status.apply(status => {
                const ingress = status?.loadBalancer?.ingress?.[0];
                if (ingress?.hostname) {
                    return `http://${ingress.hostname}:4000`;
                } else if (ingress?.ip) {
                    return `http://${ingress.ip}:4000`;
                }
                return `http://litellm-lb.${namespaceName}.svc.cluster.local:4000`;
            });
        } else {
            this.litellmPublicUrl = pulumi.interpolate`http://litellm-lb.${namespaceName}.svc.cluster.local:4000`;
        }

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
                name: "LITELLM_PUBLIC_URL",
                value: this.litellmPublicUrl,
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
                    ...(args.tags ? {
                        "service.beta.kubernetes.io/aws-load-balancer-additional-resource-tags": loadBalancerAdditionalTags,
                    } : {}),
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
            namespaceName: this.namespaceName,
            litellmReleaseName: this.litellmReleaseName,
            litellmServiceUrl: this.litellmServiceUrl,
            litellmPublicUrl: this.litellmPublicUrl,
            appServiceUrl: this.appServiceUrl,
            publicUrl: this.publicUrl,
            rdsEndpoint: this.rdsEndpoint,
        });
    }
}
