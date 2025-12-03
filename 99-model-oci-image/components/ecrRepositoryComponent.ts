import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Configuration options for the ECR repository component.
 */
export interface EcrRepositoryArgs {
    /**
     * Name of the ECR repository
     */
    repositoryName: pulumi.Input<string>;

    /**
     * Whether to enable image scanning on push
     * @default true
     */
    scanOnPush?: pulumi.Input<boolean>;

    /**
     * Image tag mutability setting (MUTABLE or IMMUTABLE)
     * @default "MUTABLE"
     */
    imageTagMutability?: pulumi.Input<string>;

    /**
     * Number of images to retain in lifecycle policy
     * @default 10
     */
    imageRetentionCount?: pulumi.Input<number>;

    /**
     * Allow deletion even with images present (use cautiously in production)
     * @default false
     */
    forceDelete?: pulumi.Input<boolean>;

    /**
     * Additional tags to apply to resources
     */
    tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

/**
 * Component resource that creates an ECR repository with best practices:
 * - Vulnerability scanning enabled by default
 * - Server-side encryption (AES256)
 * - Lifecycle policy to clean up old images
 */
export class EcrRepositoryComponent extends pulumi.ComponentResource {
    /**
     * The ECR repository resource
     */
    public readonly repository: aws.ecr.Repository;

    /**
     * The ECR lifecycle policy
     */
    public readonly lifecyclePolicy: aws.ecr.LifecyclePolicy;

    /**
     * The repository URL for pushing/pulling images
     */
    public readonly repositoryUrl: pulumi.Output<string>;

    /**
     * The repository ARN
     */
    public readonly repositoryArn: pulumi.Output<string>;

    /**
     * The registry ID
     */
    public readonly registryId: pulumi.Output<string>;

    constructor(name: string, args: EcrRepositoryArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:aws:EcrRepository", name, {}, opts);

        const defaultTags = {
            Environment: pulumi.getStack(),
            ManagedBy: "Pulumi",
        };

        // Merge default tags with provided tags
        const tags = pulumi.output(args.tags).apply(t => ({
            ...defaultTags,
            ...(t || {}),
        }));

        // Create ECR repository with security best practices
        this.repository = new aws.ecr.Repository(`${name}-repo`, {
            name: args.repositoryName,
            imageTagMutability: args.imageTagMutability || "MUTABLE",
            imageScanningConfiguration: {
                scanOnPush: args.scanOnPush ?? true,
            },
            encryptionConfigurations: [{
                encryptionType: "AES256",
            }],
            forceDelete: args.forceDelete ?? false,
            tags: tags,
        }, { parent: this });

        // Create lifecycle policy to clean up old images
        const retentionCount = args.imageRetentionCount ?? 10;
        this.lifecyclePolicy = new aws.ecr.LifecyclePolicy(`${name}-lifecycle`, {
            repository: this.repository.name,
            policy: pulumi.output(retentionCount).apply(count => JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: `Keep last ${count} images`,
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: count,
                    },
                    action: {
                        type: "expire",
                    },
                }],
            })),
        }, { parent: this });

        // Export outputs
        this.repositoryUrl = this.repository.repositoryUrl;
        this.repositoryArn = this.repository.arn;
        this.registryId = this.repository.registryId;

        this.registerOutputs({
            repositoryUrl: this.repositoryUrl,
            repositoryArn: this.repositoryArn,
            registryId: this.registryId,
        });
    }
}
