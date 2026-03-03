# EBS Snapshot for Pre-Cached Container Images

This guide documents how to create EBS snapshots with pre-cached container images for Karpenter nodes. Pre-caching images significantly reduces container startup times by eliminating the need to download large model images at runtime.

Two AMI families are supported:

| AMI Family | Script | CFN Template | Use Case |
|-----------|--------|-------------|----------|
| **Bottlerocket** | `snapshot.sh` | `ebs-snapshot-instance.yaml` | Standard GPU nodes (g5, g6) |
| **AL2023 NVIDIA** | `snapshot-al2023.sh` | `ebs-snapshot-instance-al2023.yaml` | H100/MIG nodes (p5, p4d) |

## Overview

### Bottlerocket (Original)

The [bottlerocket-images-cache](https://github.com/aws-samples/bottlerocket-images-cache) project provides a script that:
1. Launches a Bottlerocket EC2 instance
2. Pulls specified container images to the data volume
3. Creates an EBS snapshot of the data volume
4. Cleans up temporary resources

### AL2023 NVIDIA

The `snapshot-al2023.sh` script provides equivalent functionality for AL2023 NVIDIA AMI nodes:
1. Launches an AL2023_x86_64_NVIDIA EC2 instance (via SSM parameter for EKS 1.32)
2. Formats a data volume, redirects containerd storage to it
3. Pulls specified container images to the data volume
4. Creates an EBS snapshot of the data volume
5. Cleans up temporary resources

This snapshot can then be used with Karpenter's EC2NodeClass to pre-populate the data volume on GPU nodes.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Pulumi ESC environment with AWS credentials (e.g., `pulumi-idp/auth`)
- Container images already pushed to accessible registries (ECR, GHCR, etc.)

## Step 1: Download the Script (Bottlerocket)

```bash
cd 99-model-oci-image

# Download snapshot.sh
curl -sL https://raw.githubusercontent.com/aws-samples/bottlerocket-images-cache/main/snapshot.sh -o snapshot.sh
chmod +x snapshot.sh

# Download CloudFormation template
curl -sL https://raw.githubusercontent.com/aws-samples/bottlerocket-images-cache/main/ebs-snapshot-instance.yaml -o ebs-snapshot-instance.yaml
```

The AL2023 scripts (`snapshot-al2023.sh` and `ebs-snapshot-instance-al2023.yaml`) are already included in this repository.

## Step 2: Get Model Image URIs

First, get the ECR URIs of your model images from the Pulumi stack outputs:

```bash
cd 99-model-oci-image
pulumi stack select dev
pulumi stack output --json
```

Example output:
```json
{
  "gptOssEcrUrl": "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/openai-gpt-oss-20b",
  "gptOssCodeBuildProject": "gpt-oss-20b-builder-...",
  "qwen3MoeEcrUrl": "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-30b-a3b",
  "qwen3MoeCodeBuildProject": "qwen3-30b-a3b-builder-..."
}
```

## Step 3: Run the Snapshot Script

### Bottlerocket (g5, g6 instances)

Run the script with Pulumi ESC to inject AWS credentials:

```bash
pulumi env run pulumi-idp/auth -- ./snapshot.sh \
  -r us-east-1 \
  -s 250 \
  -i g5.2xlarge \
  <image1>:latest,<image2>:latest,<image3>:latest
```

### Parameters (shared by both scripts)

| Parameter | Description | Example |
|-----------|-------------|---------|
| `-r, --region` | AWS region | `us-east-1` |
| `-s, --snapshot-size` | Volume size in GiB | `250` / `500` |
| `-i, --instance-type` | EC2 instance type | `g5.2xlarge` / `p5.4xlarge` |
| `-e, --encrypt` | Encrypt the snapshot | (flag) |
| `-A, --arch` | Architecture (amd64, arm64) | `amd64` |

### Example: Bottlerocket with Multiple Images

```bash
pulumi env run pulumi-idp/auth -- ./snapshot.sh -r us-east-1 -s 250 \
  "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/openai-gpt-oss-20b:latest,052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-30b-a3b:latest,ghcr.io/llm-d/llm-d-dev:v0.2.2"
```

### Bottlerocket Progress Output

The script will show progress through 8 steps:
```
[1/8] Deploying EC2 CFN stack ...
[2/8] Launching SSM ...
[3/8] Stopping kubelet.service ...
[4/8] Cleanup existing images ...
[5/8] Pulling images ...
[6/8] Stopping instance ...
[7/8] Creating snapshot ...
[8/8] Cleanup ...
All done! Created snapshot in us-east-1: snap-0dca38ea429a621b1
```

### AL2023 NVIDIA (p5, p4d instances with H100/A100 GPUs)

For nodes that require the AL2023 NVIDIA AMI (e.g., H100 MIG nodes, p5 instances):

```bash
pulumi env run pulumi-idp/auth -- ./snapshot-al2023.sh \
  -r us-east-1 \
  -s 500 \
  -i p5.4xlarge \
  <image1>:latest,<image2>:latest
```

### Example: AL2023 with Model Images

```bash
pulumi env run pulumi-idp/auth -- ./snapshot-al2023.sh -r us-east-1 -s 500 -i p5.4xlarge \
  "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/openai-gpt-oss-20b:latest,052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-30b-a3b:latest,ghcr.io/llm-d/llm-d-dev:v0.2.2"
```

### AL2023 Progress Output

The AL2023 script shows progress through 7 steps (no separate kubelet stop needed):
```
[1/7] Deploying EC2 CFN stack ...
[2/7] Launching SSM ...
[3/7] Cleanup existing images ...
[4/7] Pulling images ...
[5/7] Stopping instance ...
[6/7] Creating snapshot ...
[7/7] Cleanup ...
All done! Created snapshot in us-east-1: snap-0abc123def456789
```

### Key Differences: Bottlerocket vs AL2023

| Feature | Bottlerocket | AL2023 NVIDIA |
|---------|-------------|---------------|
| AMI source | SSM: `/aws/service/bottlerocket/...` | SSM: `/aws/service/eks/optimized-ami/1.32/amazon-linux-2023/x86_64/nvidia/recommended/image_id` |
| Default instance | `m5.large` | `p5.4xlarge` |
| Default volume | 50 GiB | 500 GiB |
| containerd CLI | `apiclient exec admin sheltie ctr ...` | `ctr -n k8s.io` |
| SSM agent | Via admin container | Native |
| Steps | 8 (includes kubelet stop) | 7 (kubelet handled by userdata) |

## Step 4: Update Karpenter EC2NodeClass

Update the `snapshotID` in `00-infrastructure/index.ts`:

```typescript
const gpuNodeClass = karpenter.createEC2NodeClass("gpu-nodeclass", {
    name: "gpu-bottlerocket",
    amiFamily: "Bottlerocket",
    blockDeviceMappings: [
        {
            deviceName: "/dev/xvda",
            rootVolume: true,
            ebs: {
                volumeSize: "4Gi",
                volumeType: "gp3",
                encrypted: true,
                deleteOnTermination: true,
            },
        },
        {
            deviceName: "/dev/xvdb",
            ebs: {
                volumeSize: "250Gi",  // Must match snapshot size
                volumeType: "gp3",
                iops: 16000,          // Max gp3 IOPS for faster container/model loading
                throughput: 1000,     // Max gp3 throughput (MB/s) for faster sequential reads
                encrypted: true,
                deleteOnTermination: true,
                snapshotID: "snap-0dca38ea429a621b1",  // Your new snapshot ID
            },
        },
    ],
    // ...
});
```

## Step 5: Deploy Changes

```bash
cd 00-infrastructure
pulumi up --yes
```

## Current Snapshots

### Bottlerocket

| Snapshot ID | Size | Region | AMI Family | Images |
|-------------|------|--------|------------|--------|
| `snap-0dca38ea429a621b1` | 250 GiB | us-east-1 | Bottlerocket | GPT-OSS 20B, Qwen3-30B-A3B, llm-d-dev:v0.2.2 |

### AL2023 NVIDIA

| Snapshot ID | Size | Region | AMI Family | Images |
|-------------|------|--------|------------|--------|
| *(not yet created)* | 500 GiB | us-east-1 | AL2023 NVIDIA | GPT-OSS 20B, Qwen3-30B-A3B |

## Sizing Guidelines

| Total Model Size | Recommended Volume |
|-----------------|-------------------|
| < 50 GB | 100 GiB |
| 50-100 GB | 150 GiB |
| 100-200 GB | 250 GiB |
| > 200 GB | 500 GiB |

**Note:** Container images can be significantly larger than raw model files due to base image layers and packaging overhead.

## Troubleshooting

### Script fails with "Invalid template path"

Make sure the CloudFormation template is in the same directory as the script:
- For Bottlerocket: `ebs-snapshot-instance.yaml` alongside `snapshot.sh`
- For AL2023: `ebs-snapshot-instance-al2023.yaml` alongside `snapshot-al2023.sh`

### Image pull fails

- Verify the image URI is correct and accessible
- For ECR images, ensure the instance role has `ecr:GetAuthorizationToken` and `ecr:BatchGetImage` permissions
- For private registries, you may need to configure authentication

### Snapshot creation is slow

- Larger volumes take longer to snapshot
- Consider using smaller volumes if possible
- The script waits for the snapshot to enter "completed" state

## References

- [AWS Bottlerocket Images Cache](https://github.com/aws-samples/bottlerocket-images-cache)
- [Karpenter EC2NodeClass](https://karpenter.sh/docs/concepts/nodeclasses/)
- [KServe Modelcars](https://kserve.github.io/website/docs/modelserving/storage/storagecontainers/)
