import * as pulumi from "@pulumi/pulumi";
import {EcrRepositoryComponent} from "./components/ecrRepositoryComponent";
import {CodeBuildModelBuilderComponent} from "./components/codeBuildModelBuilderComponent";

const config = new pulumi.Config();
const hfToken = config.getSecret("huggingface-token") || "";

const environment = pulumi.getStack();
const tags = {
    Environment: environment,
    Project: "kserve-models",
    ManagedBy: "Pulumi",
};

// Meta Llama 3 8B Instruct
const llamaEcr = new EcrRepositoryComponent("meta-llama-3-8b-ecr", {
    repositoryName: "kserve-models/meta-llama-meta-llama-3-8b-instruct",
    scanOnPush: true,
    imageTagMutability: "MUTABLE",
    imageRetentionCount: 10,
    forceDelete: true,
    tags: tags,
});

const llamaBuilder = new CodeBuildModelBuilderComponent("meta-llama-3-8b-builder", {
    ecrRepositoryArn: llamaEcr.repositoryArn,
    ecrRepositoryName: llamaEcr.repository.name,
    modelId: "meta-llama/Meta-Llama-3-8B-Instruct",
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
    ecrRepositoryName: qwenEcr.repository.name,
    modelId: "Qwen/Qwen3-8B",
    imageTag: "latest",
    hfToken: hfToken,
    tags: tags,
});

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
    ecrRepositoryName: qwen25Ecr.repository.name,
    modelId: "Qwen/Qwen2.5-7B-Instruct",
    imageTag: "latest",
    hfToken: hfToken,
    tags: tags,
});

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
    ecrRepositoryName: gptOssEcr.repository.name,
    modelId: "openai/gpt-oss-20b",
    imageTag: "latest",
    hfToken: hfToken,
    computeType: "BUILD_GENERAL1_LARGE",
    tags: tags,
});

// Exports
export const llamaEcrUrl = llamaEcr.repositoryUrl;
export const llamaCodeBuildProject = llamaBuilder.codeBuildProjectName;

export const qwenEcrUrl = qwenEcr.repositoryUrl;
export const qwenCodeBuildProject = qwenBuilder.codeBuildProjectName;

export const qwen25EcrUrl = qwen25Ecr.repositoryUrl;
export const qwen25CodeBuildProject = qwen25Builder.codeBuildProjectName;

export const gptOssEcrUrl = gptOssEcr.repositoryUrl;
export const gptOssCodeBuildProject = gptOssBuilder.codeBuildProjectName;
