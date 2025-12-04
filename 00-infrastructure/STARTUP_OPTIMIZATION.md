# LLM Startup Optimization Guide

This document covers strategies for optimizing cold and warm startup times for LLM inference pods.

## Current Startup Breakdown

### Cold Start (New Node)
| Phase | Time | Status |
|-------|------|--------|
| Node provisioning (Karpenter) | ~2-3 min | Limited optimization possible |
| Container image pull | ~0s | Optimized (EBS snapshot) |
| Model weights loading | ~4.6s | Optimized (OCI modelcar) |
| torch.compile | ~34s | **Not optimized** |
| Engine init/warmup | ~48s | Partially optimizable |
| **Total** | **~4-5 min** | |

### Warm Start (Same Node, Pod Restart)
| Phase | Time | Status |
|-------|------|--------|
| Container image pull | ~0s | Cached locally |
| Model weights loading | ~4.6s | Optimized (OCI modelcar) |
| torch.compile | ~34s | **Not optimized** |
| Engine init/warmup | ~48s | Partially optimizable |
| **Total** | **~86s** | |

## Already Implemented Optimizations

### 1. EBS Snapshot with Pre-cached Images
- **Snapshot ID**: `snap-09187bc8545854531`
- **Location**: EC2NodeClass `gpu-bottlerocket` in `index.ts:229-262`
- **Benefit**: Container images are pre-loaded on node boot, eliminating image pull time
- **Models cached**: Meta Llama 3 8B, Qwen 2.5 7B, Qwen 3 8B

### 2. OCI Modelcars (KServe)
- **Config**: `storageType: "oci"` in LLMInferenceServiceComponent
- **Benefit**: Model weights loaded from local OCI image instead of downloading from HuggingFace
- **Result**: Model loading reduced from ~250s to ~4.6s

## Cold Start Optimization Strategies

### Option 1: Disable torch.compile (Quick Win)

**Trade-off**: ~40s faster startup, but ~20-30% slower inference

```typescript
// In index.ts, update the LLMInferenceServiceComponent args
const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
    // ... existing config ...
    args: [
        "--max_model_len=8192",
        "--gpu_memory_utilization=0.9",
        "--enforce-eager",  // Disables CUDA graphs and torch.compile
    ],
}, { provider: k8sProvider, dependsOn: [kserve] });
```

**Savings**: ~40s on cold start
**Downside**: Token generation will be slower (no CUDA graph optimization)

### Option 2: Pre-bake torch.compile Cache into EBS Snapshot (Recommended)

This is the best approach for cold starts - bake the compiled CUDA graphs directly into the EBS snapshot.

**Steps**:

1. **Deploy model and let it fully warm up**
   ```bash
   # Wait for pod to be ready and torch.compile to finish
   pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- \
     kubectl logs -f <pod-name> -n default | grep "torch.compile"
   ```

2. **Identify the cache location on the node**
   The torch.compile cache is stored at:
   - Container path: `/tmp/vllm/torch_compile_cache/`
   - Node path: `/var/lib/containerd/...` (inside container overlay)

3. **Create new EBS snapshot including the cache**
   ```bash
   # Find the instance and volume
   INSTANCE_ID=$(pulumi env run pulumi-idp/auth -- aws ec2 describe-instances \
     --filters "Name=tag:karpenter.sh/nodepool,Values=gpu-standard" \
     --query 'Reservations[*].Instances[*].InstanceId' --output text --region us-east-1)

   VOLUME_ID=$(pulumi env run pulumi-idp/auth -- aws ec2 describe-instances \
     --instance-ids $INSTANCE_ID \
     --query 'Reservations[*].Instances[*].BlockDeviceMappings[?DeviceName==`/dev/xvdb`].Ebs.VolumeId' \
     --output text --region us-east-1)

   # Create snapshot
   pulumi env run pulumi-idp/auth -- aws ec2 create-snapshot \
     --volume-id $VOLUME_ID \
     --description "GPU node with torch.compile cache for Llama 3 8B" \
     --region us-east-1
   ```

4. **Update EC2NodeClass with new snapshot ID**
   ```typescript
   // In index.ts, update snapshotID
   snapshotID: "snap-NEW_SNAPSHOT_ID",
   ```

**Savings**: ~34s on cold start (torch.compile phase eliminated)
**Downside**: Need to rebuild snapshot when updating vLLM version or model

### Option 3: Shared Storage (EFS) for torch.compile Cache

Use Amazon EFS to share the torch.compile cache across all GPU nodes.

**Implementation**:

1. **Create EFS file system**
   ```typescript
   const torchCacheEfs = new aws.efs.FileSystem("torch-cache-efs", {
       performanceMode: "generalPurpose",
       throughputMode: "bursting",
       encrypted: true,
       tags: { Name: "vllm-torch-compile-cache" },
   });

   // Create mount targets in each subnet
   eksVpc.privateSubnetIds.apply(subnetIds => {
       subnetIds.forEach((subnetId, i) => {
           new aws.efs.MountTarget(`torch-cache-mt-${i}`, {
               fileSystemId: torchCacheEfs.id,
               subnetId: subnetId,
               securityGroups: [cluster.nodeSecurityGroup.id],
           });
       });
   });
   ```

2. **Create PV and PVC**
   ```typescript
   const torchCachePv = new k8s.core.v1.PersistentVolume("torch-cache-pv", {
       metadata: { name: "torch-compile-cache" },
       spec: {
           capacity: { storage: "100Gi" },
           accessModes: ["ReadWriteMany"],
           persistentVolumeReclaimPolicy: "Retain",
           storageClassName: "efs",
           csi: {
               driver: "efs.csi.aws.com",
               volumeHandle: torchCacheEfs.id,
           },
       },
   }, { provider: k8sProvider });
   ```

3. **Mount in LLMInferenceService**
   - Add volume mount at `/tmp/vllm/torch_compile_cache`
   - First pod to start will populate the cache
   - All subsequent pods (on any node) will reuse

**Savings**: ~34s on cold start (after first pod warms up the cache)
**Downside**:
- Adds EFS dependency and cost
- First pod still needs to compile
- Potential cache invalidation issues across vLLM versions

## Warm Start Optimization Strategies

### Option 1: PVC for torch.compile Cache (Per-Model)

Add a PVC to persist the torch.compile cache between pod restarts on the same node.

**Implementation** (add to LLMInferenceServiceComponent):

```typescript
// Add to LLMInferenceServiceArgs interface
torchCompileCache?: {
    enabled: boolean;
    storageClassName?: string;  // default: "gp3"
    storageSize?: string;       // default: "10Gi"
};

// Create PVC when enabled
if (args.torchCompileCache?.enabled) {
    const cachePvc = new k8s.core.v1.PersistentVolumeClaim(`${name}-torch-cache-pvc`, {
        metadata: {
            name: `${name}-torch-cache`,
            namespace: namespace,
        },
        spec: {
            accessModes: ["ReadWriteOnce"],
            storageClassName: args.torchCompileCache.storageClassName ?? "gp3",
            resources: {
                requests: {
                    storage: args.torchCompileCache.storageSize ?? "10Gi",
                },
            },
        },
    }, { parent: this });

    // Add to container spec:
    // volumeMounts: [{ name: "torch-cache", mountPath: "/tmp/vllm/torch_compile_cache" }]
    // volumes: [{ name: "torch-cache", persistentVolumeClaim: { claimName: cachePvc.metadata.name } }]
}
```

**Usage**:
```typescript
const llama3Model = new LLMInferenceServiceComponent("llama-3-8b-instruct", {
    // ... existing config ...
    torchCompileCache: {
        enabled: true,
        storageClassName: "gp3",
        storageSize: "10Gi",
    },
}, { provider: k8sProvider, dependsOn: [kserve] });
```

**Savings**: ~34s on warm restarts (same node only)
**Downside**: Only helps when pod restarts on same node with existing PVC

### Option 2: Node-local Cache with hostPath (Not Recommended)

Mount a hostPath volume for the torch cache. Not recommended due to:
- Security concerns (hostPath access)
- Cache pollution between different models
- No persistence if node is replaced

## Recommended Optimization Path

### Phase 1: Quick Wins (Immediate)
1. Verify EBS snapshot is working (already done)
2. Verify OCI modelcar is working (already done)

### Phase 2: Cold Start Optimization
1. **Option 2 (Pre-bake torch.compile into snapshot)** - Best for production
   - Run model, wait for full warmup
   - Create new snapshot with compiled cache
   - Update EC2NodeClass

### Phase 3: Warm Start Optimization
1. Implement PVC-based torch.compile cache in LLMInferenceServiceComponent
2. Enable for production models

## Measuring Startup Time

```bash
# Watch pod startup
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- \
  kubectl get pods -n default -l app.kubernetes.io/name=llama-3-8b-instruct -w

# Check detailed timing from logs
pulumi env run self-service-ai-application-platforms/demo-ai-idp-cluster-cluster -- \
  kubectl logs <pod-name> -n default -c main | grep -E "(Loading|seconds|torch.compile)"

# Key metrics to look for:
# - "Loading weights took X seconds"
# - "Model loading took X GiB and X seconds"
# - "torch.compile takes X s in total"
# - "init engine ... took X seconds"
```

## References

- [vLLM Performance Tuning](https://docs.vllm.ai/en/latest/performance/optimization.html)
- [KServe Modelcars](https://kserve.github.io/website/docs/modelcars/)
- [Karpenter EC2NodeClass](https://karpenter.sh/docs/concepts/nodeclasses/)
- [EBS Snapshots for Container Images](https://aws.amazon.com/blogs/containers/reduce-container-startup-time-on-amazon-eks-with-bottlerocket-data-volume/)
