import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Configuration options for the CodeBuild Model Builder component.
 */
export interface CodeBuildModelBuilderArgs {
    /**
     * ARN of the target ECR repository
     */
    ecrRepositoryArn: pulumi.Input<string>;

    /**
     * Name of the ECR repository
     */
    ecrRepositoryName: pulumi.Input<string>;

    /**
     * HuggingFace model ID (e.g., "meta-llama/Meta-Llama-3-8B-Instruct")
     */
    modelId: pulumi.Input<string>;

    /**
     * Docker image tag
     * @default "latest"
     */
    imageTag?: pulumi.Input<string>;

    /**
     * HuggingFace token for gated models (optional)
     */
    hfToken?: pulumi.Input<string>;

    /**
     * CodeBuild compute type
     * @default "BUILD_GENERAL1_SMALL"
     */
    computeType?: pulumi.Input<string>;

    /**
     * Additional tags to apply to resources
     */
    tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;
}

/**
 * Component resource that creates a CodeBuild project for building
 * OCI images containing HuggingFace models for KServe Modelcars.
 */
export class CodeBuildModelBuilderComponent extends pulumi.ComponentResource {
    /**
     * Name of the CodeBuild project
     */
    public readonly codeBuildProjectName: pulumi.Output<string>;

    /**
     * ARN of the CodeBuild project
     */
    public readonly codeBuildProjectArn: pulumi.Output<string>;

    /**
     * Name of the S3 source bucket
     */
    public readonly sourceBucketName: pulumi.Output<string>;

    constructor(name: string, args: CodeBuildModelBuilderArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:aws:CodeBuildModelBuilder", name, {}, opts);

        const defaultTags = {
            Environment: pulumi.getStack(),
            ManagedBy: "Pulumi",
        };

        const tags = pulumi.output(args.tags).apply(t => ({
            ...defaultTags,
            ...(t || {}),
        }));

        const imageTag = args.imageTag || "latest";
        const computeType = args.computeType || "BUILD_GENERAL1_SMALL";

        // Get current AWS account and region
        const current = aws.getCallerIdentity({});
        const region = aws.getRegion({});

        // Create IAM role for CodeBuild
        const codeBuildRole = new aws.iam.Role(`${name}-role`, {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        Service: "codebuild.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                }],
            }),
            tags: tags,
        }, { parent: this });

        // Create IAM policy for CodeBuild with ECR and CloudWatch permissions
        const codeBuildPolicy = new aws.iam.RolePolicy(`${name}-policy`, {
            role: codeBuildRole.id,
            policy: pulumi.all([args.ecrRepositoryArn, current, region]).apply(([repoArn, acc, reg]) => JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Action: [
                            "ecr:BatchCheckLayerAvailability",
                            "ecr:CompleteLayerUpload",
                            "ecr:GetAuthorizationToken",
                            "ecr:InitiateLayerUpload",
                            "ecr:PutImage",
                            "ecr:UploadLayerPart",
                        ],
                        Resource: "*",
                    },
                    {
                        Effect: "Allow",
                        Action: [
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:PutLogEvents",
                        ],
                        Resource: `arn:aws:logs:${reg.name}:${acc.accountId}:log-group:/aws/codebuild/*`,
                    },
                    {
                        Effect: "Allow",
                        Action: [
                            "s3:GetObject",
                            "s3:GetObjectVersion",
                            "s3:ListBucket",
                        ],
                        Resource: "*",
                    },
                ],
            })),
        }, { parent: this });

        // Create S3 bucket for source files
        const sourceBucket = new aws.s3.Bucket(`${name}-source`, {
            forceDestroy: true,
            tags: tags,
        }, { parent: this });

        // Create a ZIP archive with all source files
        const sourceArchive = new aws.s3.BucketObject(`${name}-archive`, {
            bucket: sourceBucket.id,
            key: "source.zip",
            source: new pulumi.asset.AssetArchive({
                "buildspec.yml": new pulumi.asset.FileAsset("./docker/buildspec.yml"),
                "Dockerfile": new pulumi.asset.FileAsset("./docker/Dockerfile"),
                "download_model.py": new pulumi.asset.FileAsset("./docker/download_model.py"),
            }),
        }, { parent: this });

        // Create CodeBuild project
        const codeBuildProject = new aws.codebuild.Project(`${name}-project`, {
            description: pulumi.interpolate`CodeBuild project to build ${args.modelId} model image`,
            serviceRole: codeBuildRole.arn,
            artifacts: {
                type: "NO_ARTIFACTS",
            },
            environment: {
                computeType: computeType,
                image: "aws/codebuild/standard:5.0",
                type: "LINUX_CONTAINER",
                privilegedMode: true,
                environmentVariables: [
                    {
                        name: "AWS_DEFAULT_REGION",
                        value: region.then(r => r.name),
                    },
                    {
                        name: "AWS_ACCOUNT_ID",
                        value: current.then(c => c.accountId),
                    },
                    {
                        name: "IMAGE_REPO_NAME",
                        value: args.ecrRepositoryName,
                    },
                    {
                        name: "IMAGE_TAG",
                        value: imageTag,
                    },
                    {
                        name: "MODEL_ID",
                        value: args.modelId,
                    },
                    {
                        name: "HF_TOKEN",
                        value: args.hfToken || "",
                    },
                ],
            },
            source: {
                type: "S3",
                location: pulumi.interpolate`${sourceBucket.bucket}/source.zip`,
            },
            tags: tags,
        }, { parent: this, dependsOn: [codeBuildPolicy, sourceArchive] });

        // Set outputs
        this.codeBuildProjectName = codeBuildProject.name;
        this.codeBuildProjectArn = codeBuildProject.arn;
        this.sourceBucketName = sourceBucket.id;

        this.registerOutputs({
            codeBuildProjectName: this.codeBuildProjectName,
            codeBuildProjectArn: this.codeBuildProjectArn,
            sourceBucketName: this.sourceBucketName,
        });
    }
}
