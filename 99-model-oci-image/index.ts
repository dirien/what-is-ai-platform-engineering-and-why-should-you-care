import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import {EcrRepositoryComponent} from "../01-maas/infra/ecrComponent";

// Configuration
const config = new pulumi.Config();
const modelId = config.require("modelId");
const imageTag = config.get("imageTag") || "v1.0";
// HuggingFace token for gated models (optional, can be empty for public models)
const hfToken = config.getSecret("huggingface-token") || "";

// Derive repository name from model ID (e.g., "meta-llama/Meta-Llama-3-8B-Instruct" -> "meta-llama-meta-llama-3-8b-instruct")
const repoName = modelId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

const environment = pulumi.getStack();
const tags = {
    Environment: environment,
    Project: "kserve-models",
    ManagedBy: "Pulumi",
};


// Create ECR repository using component resource
const ecr = new EcrRepositoryComponent(`${repoName}-ecr`, {
    repositoryName: `kserve-models/${repoName}`,
    scanOnPush: true,
    imageTagMutability: "IMMUTABLE",
    imageRetentionCount: 10,
    forceDelete: true, // Set to false for production
    tags: tags,
});

// Create IAM role for CodeBuild
const codeBuildRole = new aws.iam.Role("codebuild-role", {
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
});

const current = aws.getCallerIdentity({});
const region = aws.getRegion({});

// Create IAM policy for CodeBuild with ECR and CloudWatch permissions
const codeBuildPolicy = new aws.iam.RolePolicy("codebuild-policy", {
    role: codeBuildRole.id,
    policy: pulumi.all([ecr.repositoryArn, current, region]).apply(([repoArn, acc, reg]) => JSON.stringify({
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
});

// Create S3 bucket for source files
const sourceBucket = new aws.s3.Bucket("source-bucket", {
    forceDestroy: true,
});

// Create a ZIP archive with all source files
const sourceArchive = new aws.s3.BucketObject("source-archive", {
    bucket: sourceBucket.id,
    key: "source.zip",
    source: new pulumi.asset.AssetArchive({
        "buildspec.yml": new pulumi.asset.FileAsset("./docker/buildspec.yml"),
        "Dockerfile": new pulumi.asset.FileAsset("./docker/Dockerfile"),
        "download_model.py": new pulumi.asset.FileAsset("./docker/download_model.py"),
    }),
});

// Create CodeBuild project
const codeBuildProject = new aws.codebuild.Project("docker-build-project", {
    name: "codebuild-docker-sample",
    description: "CodeBuild project to build and push Docker images to ECR",
    serviceRole: codeBuildRole.arn,
    artifacts: {
        type: "NO_ARTIFACTS",
    },
    environment: {
        computeType: "BUILD_GENERAL1_SMALL",
        image: "aws/codebuild/standard:5.0",
        type: "LINUX_CONTAINER",
        privilegedMode: true, // Required for Docker builds
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
                value: ecr.repository.name,
            },
            {
                name: "IMAGE_TAG",
                value: imageTag,
            },
            {
                name: "MODEL_ID",
                value: modelId,
            },
            {
                name: "HF_TOKEN",
                value: hfToken,
            },
        ],
    },
    source: {
        type: "S3",
        location: pulumi.interpolate`${sourceBucket.bucket}/source.zip`,
    },
}, { dependsOn: [codeBuildPolicy, sourceArchive] });

// Export ECR repository details
export const ecrRepositoryUrl = ecr.repositoryUrl;
export const ecrRepositoryName = ecr.repository.name;
export const sourceBucketName = sourceBucket.id;
export const codeBuildProjectName = codeBuildProject.name;
