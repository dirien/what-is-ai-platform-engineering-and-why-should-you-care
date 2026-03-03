#!/bin/bash

# EBS snapshot builder for AL2023 NVIDIA nodes
# Adapted from snapshot.sh (Bottlerocket) for AL2023_x86_64_NVIDIA AMI

set -e

function print_help {
    echo "usage: $0 [options] <comma separated container images>"
    echo "Build EBS snapshot for AL2023 NVIDIA data volume with cached container images"
    echo "Options:"
    echo "-h,--help Print this help."
    echo "-A, --arch Set image architectures to pull (comma-separated). (default: amd64)"
    echo "-r,--region Set AWS region to build the EBS snapshot. (default: use environment variable of AWS_DEFAULT_REGION or IMDS)"
    echo "-i,--instance-type Set EC2 instance type to build this snapshot. (default: p5.4xlarge)"
    echo "-e,--encrypt Encrypt the generated snapshot. (default: false)"
    echo "-k,--kms-id Use a specific KMS Key Id to encrypt this snapshot, should use together with -e"
    echo "-s,--snapshot-size Use a specific volume size (in GiB) for this snapshot. (default: 500)"
    echo "-R,--instance-role Name of existing IAM role for created EC2 instance. (default: Create on launching)"
    echo "-q,--quiet Redirect output to stderr and output generated snapshot ID to stdout only. (default: false)"
    echo "-sg,--security-group-id Set a specific Security Group ID for the instance. (default: use default VPC security group)"
    echo "-sn,--subnet-id Set a specific Subnet ID for the instance. (default: use default VPC subnet)"
    echo "-op,--output-parameter-name Set the SSM parameter name to store the generated snapshot ID. (default: NONE)"
    echo "-p,--public-ip Associate a public IP address with the instance. (default: true)"
}

QUIET=false
ASSOCIATE_PUBLIC_IP=true

function log() {
    datestring=$(date +"%Y-%m-%d %H:%M:%S")
    if [ "$QUIET" = false ]; then
        echo -e "$datestring I - $*"
    else
        echo -e "$datestring I - $*" >&2
    fi
}

function logerror() {
    datestring=$(date +"%Y-%m-%d %H:%M:%S")
    echo -e "$datestring E - $*" >&2
}

function cleanup() {
    log "Cleaning up stack $1..."
    if aws cloudformation describe-stacks --stack-name "$1" &> /dev/null; then
        aws cloudformation delete-stack --stack-name "$1"
        log "Stack deletion initiated."
    else
        log "Stack $1 not found or already deleted."
    fi
}

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -h|--help)
            print_help
            exit 1
            ;;
        -r|--region)
            AWS_DEFAULT_REGION="$2"
            shift
            shift
            ;;
        -i|--instance-type)
            INSTANCE_TYPE="$2"
            shift
            shift
            ;;
        -e|--encrypt)
            ENCRYPT=true
            shift
            ;;
        -k|--kms-id)
            if [ -n "$ENCRYPT" ] && [[ $ENCRYPT == true ]]; then
              KMS_ID="$2"
            else
              logerror "KMS Key should only be specified when snapshot is encrypted. (-e)"
              exit 2
            fi
            shift
            shift
            ;;
        -s|--snapshot-size)
            SNAPSHOT_SIZE="$2"
            shift
            shift
            ;;
        -R|--instance-role)
            INSTANCE_ROLE="$2"
            shift
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -sg|--security-group-id)
            SECURITY_GROUP_ID="$2"
            shift
            shift
            ;;
        -sn|--subnet-id)
            SUBNET_ID="$2"
            shift
            shift
            ;;
        -p|--public-ip)
            ASSOCIATE_PUBLIC_IP="$2"
            shift
            shift
            ;;
        -op|--output-parameter-name)
            OUTPUT_PARAMETER_NAME="$2"
            shift
            shift
            ;;
        -A|--arch)
            ARCHITECTURES="$2"
            shift
            shift
            ;;
        *)
            POSITIONAL+=("$1")
            shift
            ;;
    esac
done

set +u
set -- "${POSITIONAL[@]}"
IMAGES="$1"
set -u

AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')}
INSTANCE_TYPE=${INSTANCE_TYPE:-p5.4xlarge}
INSTANCE_ROLE=${INSTANCE_ROLE:-NONE}
ENCRYPT=${ENCRYPT:-NONE}
KMS_ID=${KMS_ID:-NONE}
SNAPSHOT_SIZE=${SNAPSHOT_SIZE:-500}
SECURITY_GROUP_ID=${SECURITY_GROUP_ID:-NONE}
SUBNET_ID=${SUBNET_ID:-NONE}
ASSOCIATE_PUBLIC_IP=${ASSOCIATE_PUBLIC_IP:-true}
OUTPUT_PARAMETER_NAME=${OUTPUT_PARAMETER_NAME:-NONE}
ARCHITECTURES=${ARCHITECTURES:-amd64}
SCRIPTPATH=$(dirname "$0")
CTR_CMD="ctr -n k8s.io"

if [ -z "${AWS_DEFAULT_REGION}" ]; then
    logerror "Please set AWS region"
    exit 1
fi

if [ -z "${IMAGES}" ]; then
    logerror "Please set images list"
    exit 1
fi

# Validate image names to prevent injection
for img in $(echo "$IMAGES" | tr ',' ' '); do
    if [[ ! "$img" =~ ^[a-zA-Z0-9._/-]+:[a-zA-Z0-9._-]+$ ]] && [[ ! "$img" =~ ^[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._-]+)?@sha256:[a-f0-9]{64}$ ]]; then
        logerror "Invalid image format: $img"
        exit 1
    fi
done

# Validate architectures
for arch in $(echo "$ARCHITECTURES" | tr ',' ' '); do
    if [[ ! "$arch" =~ ^(amd64|arm64|386|arm)$ ]]; then
        logerror "Invalid architecture: $arch"
        exit 1
    fi
done

IFS=',' read -r -a IMAGES_LIST <<< "$IMAGES"
IFS=',' read -r -a ARCH_LIST <<< "$ARCHITECTURES"

if ! command -v aws &> /dev/null; then
    logerror "AWS CLI is not installed or not in PATH"
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    logerror "AWS credentials not configured or invalid"
    exit 1
fi

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION}"

##############################################################################################
export AWS_PAGER=""

# launch EC2
RAND=$(od -An -N2 -i /dev/urandom | tr -d ' ' | cut -c1-4)
CFN_STACK_NAME="AL2023-ebs-snapshot-$RAND"
log "[1/7] Deploying EC2 CFN stack $CFN_STACK_NAME ..."
CFN_PARAMS="InstanceType=$INSTANCE_TYPE InstanceRole=$INSTANCE_ROLE Encrypt=$ENCRYPT KMSId=$KMS_ID SnapshotSize=$SNAPSHOT_SIZE SecurityGroupId=$SECURITY_GROUP_ID SubnetId=$SUBNET_ID AssociatePublicIpAddress=$ASSOCIATE_PUBLIC_IP"

if ! aws cloudformation deploy \
  --stack-name "$CFN_STACK_NAME" \
  --template-file "$SCRIPTPATH/ebs-snapshot-instance-al2023.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides $CFN_PARAMS > /dev/null; then
    logerror "Failed to deploy CloudFormation stack"
    exit 1
fi

INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$CFN_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)

# wait for SSM ready
log "[2/7] Launching SSM ."
while [[ $(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE_ID" --query "InstanceInformationList[0].PingStatus" --output text) != "Online" ]]
do
   sleep 5
done
log "SSM launched in instance $INSTANCE_ID."

# cleanup existing images
log "[3/7] Cleanup existing images .."
CMDID=$(aws ssm send-command --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" --comment "Cleanup existing images" \
    --parameters commands="$CTR_CMD images rm \$($CTR_CMD images ls -q)" \
    --query "Command.CommandId" --output text)
aws ssm wait command-executed --command-id "$CMDID" --instance-id "$INSTANCE_ID" > /dev/null
log "Existing images cleaned"

# pull images
log "[4/7] Pulling images:"
for IMG in "${IMAGES_LIST[@]}"
do
    ECR_REGION=$(echo "$IMG" | sed -n "s/^[0-9]*\.dkr\.ecr\.\([a-z1-9-]*\)\.amazonaws\.com.*$/\1/p")
    [ -n "$ECR_REGION" ] && ECRPWD="--u AWS:$(aws ecr get-login-password --region "$ECR_REGION")" || ECRPWD=""
    for PLATFORM in "${ARCH_LIST[@]}"
    do
        log "Pulling $IMG - $PLATFORM ... "
        COMMAND="$CTR_CMD images pull --label io.cri-containerd.image=managed --platform $PLATFORM $ECRPWD $IMG"
        CMDID=$(aws ssm send-command --instance-ids "$INSTANCE_ID" \
            --document-name "AWS-RunShellScript" --comment "Pull Image ${IMG:0:75} - $PLATFORM" \
            --parameters commands="$COMMAND" \
            --query "Command.CommandId" --output text)
        WAIT_COUNT=0
        MAX_WAIT=60
        until aws ssm wait command-executed --command-id "$CMDID" --instance-id "$INSTANCE_ID" &> /dev/null && log "$IMG - $PLATFORM pulled. "
        do
            sleep 5
            WAIT_COUNT=$((WAIT_COUNT + 1))
            if [ $WAIT_COUNT -gt $MAX_WAIT ]; then
                logerror "Timeout waiting for image $IMG to pull"
                cleanup "$CFN_STACK_NAME"
                exit 1
            fi
            if [ "$(aws ssm get-command-invocation --command-id "$CMDID" --instance-id "$INSTANCE_ID" --output text --query Status)" == "Failed" ]; then
                REASON=$(aws ssm get-command-invocation --command-id "$CMDID" --instance-id "$INSTANCE_ID" --output text --query StandardOutputContent)
                logerror "Image $IMG pulling failed with following output: "
                logerror "$REASON"
                cleanup "$CFN_STACK_NAME"
                exit 1
            fi
        done
    done
done

# stop EC2
log "[5/7] Stopping instance ... "
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --output text > /dev/null
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID" > /dev/null && log "Instance $INSTANCE_ID stopped"

# create EBS snapshot
log "[6/7] Creating snapshot ... "
DATA_VOLUME_ID=$(aws ec2 describe-instances --instance-id "$INSTANCE_ID" --query "Reservations[0].Instances[0].BlockDeviceMappings[?DeviceName=='/dev/xvdb'].Ebs.VolumeId" --output text)
SNAPSHOT_ID=$(aws ec2 create-snapshot --volume-id "$DATA_VOLUME_ID" --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=AL2023 NVIDIA Data Volume},{Key=Owner,Value=dirien}]' --description "AL2023 NVIDIA Data Volume snapshot with ${IMAGES:0:200}" --query "SnapshotId" --output text)
until aws ec2 wait snapshot-completed --snapshot-ids "$SNAPSHOT_ID" &> /dev/null && log "Snapshot $SNAPSHOT_ID generated."
do
    sleep 5
done

# destroy temporary instance
log "[7/7] Cleanup."
cleanup "$CFN_STACK_NAME"

# write snapshot-id to parameter store
if [ "$OUTPUT_PARAMETER_NAME" != "NONE" ]; then
    log "Updating SSM parameter $OUTPUT_PARAMETER_NAME"
    aws ssm put-parameter --name "$OUTPUT_PARAMETER_NAME" --value "$SNAPSHOT_ID" --type String --overwrite
fi

# done!
log "--------------------------------------------------"
log "All done! Created snapshot in $AWS_DEFAULT_REGION: $SNAPSHOT_ID"
if [ $QUIET = true ]; then
    echo "$SNAPSHOT_ID"
fi
