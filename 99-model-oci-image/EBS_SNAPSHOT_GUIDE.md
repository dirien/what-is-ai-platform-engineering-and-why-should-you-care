# EBS Snapshot for Pre-Cached Container Images

This guide documents how to create EBS snapshots with pre-cached container images for Bottlerocket nodes using Karpenter. Pre-caching images significantly reduces container startup times by eliminating the need to download large model images at runtime.

## Overview

The [bottlerocket-images-cache](https://github.com/aws-samples/bottlerocket-images-cache) project provides a script that:
1. Launches a Bottlerocket EC2 instance
2. Pulls specified container images to the data volume
3. Creates an EBS snapshot of the data volume
4. Cleans up temporary resources

This snapshot can then be used with Karpenter's EC2NodeClass to pre-populate the data volume on GPU nodes.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Pulumi ESC environment with AWS credentials (e.g., `pulumi-idp/auth`)
- Container images already pushed to accessible registries (ECR, GHCR, etc.)

## Step 1: Download the Script

```bash
cd 99-model-oci-image

# Download snapshot.sh
curl -sL https://raw.githubusercontent.com/aws-samples/bottlerocket-images-cache/main/snapshot.sh -o snapshot.sh
chmod +x snapshot.sh

# Download CloudFormation template
curl -sL https://raw.githubusercontent.com/aws-samples/bottlerocket-images-cache/main/ebs-snapshot-instance.yaml -o ebs-snapshot-instance.yaml
```

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
  "llamaEcrUrl": "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/meta-llama-meta-llama-3-8b-instruct",
  "qwen25EcrUrl": "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen2-5-7b-instruct",
  "qwenEcrUrl": "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-8b"
}
```

## Step 3: Run the Snapshot Script

Run the script with Pulumi ESC to inject AWS credentials:

```bash
pulumi env run pulumi-idp/auth -- ./snapshot.sh \
  -r us-east-1 \
  -s 250 \
  -i g5.2xlarge \
  <image1>:latest,<image2>:latest,<image3>:latest
```

### Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `-r, --region` | AWS region | `us-east-1` |
| `-s, --snapshot-size` | Volume size in GiB | `250` |
| `-i, --instance-type` | EC2 instance type | `g5.2xlarge` |
| `-e, --encrypt` | Encrypt the snapshot | (flag) |
| `-A, --arch` | Architecture (amd64, arm64) | `amd64` |

### Example with Multiple Images

```bash
pulumi env run pulumi-idp/auth -- ./snapshot.sh -r us-east-1 -s 250 \
  "052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/meta-llama-meta-llama-3-8b-instruct:latest,052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen2-5-7b-instruct:latest,052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/qwen-qwen3-8b:latest,052848974346.dkr.ecr.us-east-1.amazonaws.com/kserve-models/openai-gpt-oss-20b:latest,ghcr.io/llm-d/llm-d-dev:v0.2.2"
```

### Progress Output

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

## Current Snapshot

| Snapshot ID | Size | Region | Images |
|-------------|------|--------|--------|
| `snap-0dca38ea429a621b1` | 250 GiB | us-east-1 | Meta Llama 3 8B, Qwen 2.5 7B, Qwen 3 8B, GPT-OSS 20B, llm-d-dev:v0.2.2 |

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

Make sure `ebs-snapshot-instance.yaml` is in the same directory as `snapshot.sh`.

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
