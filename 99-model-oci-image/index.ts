import * as pulumi from "@pulumi/pulumi";
import {EcrRepositoryComponent} from "./src/components/ecrRepositoryComponent";
import {CodeBuildModelBuilderComponent} from "./src/components/codeBuildModelBuilderComponent";

const config = new pulumi.Config();
const hfToken = config.getSecret("huggingface-token") || "";
const owner = config.get("owner") || "dirien";

const environment = pulumi.getStack();
const tags = {
    Environment: environment,
    Project: "kserve-models",
    ManagedBy: "Pulumi",
    Owner: owner,
};

// Qwen2.5-7B-Instruct
const qwen25Ecr = new EcrRepositoryComponent("qwen25-7b-ecr", {
    repositoryName: "kserve-models/qwen-qwen2-5-7b-instruct",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const qwen25Builder = new CodeBuildModelBuilderComponent("qwen25-7b-builder", {
    ecrRepositoryArn: qwen25Ecr.repositoryArn,
    ecrRepositoryName: qwen25Ecr.repositoryName,
    modelId: "Qwen/Qwen2.5-7B-Instruct",
    imageTag: "latest",
    hfToken: hfToken,
    tags: tags,
});

// Qwen3-8B
const qwenEcr = new EcrRepositoryComponent("qwen3-8b-ecr", {
    repositoryName: "kserve-models/qwen-qwen3-8b",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const qwenBuilder = new CodeBuildModelBuilderComponent("qwen3-8b-builder", {
    ecrRepositoryArn: qwenEcr.repositoryArn,
    ecrRepositoryName: qwenEcr.repositoryName,
    modelId: "Qwen/Qwen3-8B",
    imageTag: "latest",
    hfToken: hfToken,
    tags: tags,
});

/* TODO(demo-day): Uncomment MIG model images when H100 capacity is available
// OpenAI GPT-OSS-20B
const gptOssEcr = new EcrRepositoryComponent("gpt-oss-20b-ecr", {
    repositoryName: "kserve-models/openai-gpt-oss-20b",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const gptOssBuilder = new CodeBuildModelBuilderComponent("gpt-oss-20b-builder", {
    ecrRepositoryArn: gptOssEcr.repositoryArn,
    ecrRepositoryName: gptOssEcr.repositoryName,
    modelId: "openai/gpt-oss-20b",
    imageTag: "latest",
    hfToken: hfToken,
    computeType: "BUILD_GENERAL1_2XLARGE",
    tags: tags,
});

// Qwen3-30B-A3B (Mixture of Experts)
const qwen3MoeEcr = new EcrRepositoryComponent("qwen3-30b-a3b-ecr", {
    repositoryName: "kserve-models/qwen-qwen3-30b-a3b",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const qwen3MoeBuilder = new CodeBuildModelBuilderComponent("qwen3-30b-a3b-builder", {
    ecrRepositoryArn: qwen3MoeEcr.repositoryArn,
    ecrRepositoryName: qwen3MoeEcr.repositoryName,
    modelId: "Qwen/Qwen3-30B-A3B",
    imageTag: "latest",
    hfToken: hfToken,
    computeType: "BUILD_GENERAL1_2XLARGE",
    tags: tags,
});
END TODO(demo-day) */

// Exports
export const qwen25EcrUrl = qwen25Ecr.repositoryUrl;
export const qwen25CodeBuildProject = qwen25Builder.codeBuildProjectName;

export const qwenEcrUrl = qwenEcr.repositoryUrl;
export const qwenCodeBuildProject = qwenBuilder.codeBuildProjectName;
