# Multi-stage Dockerfile for building OCI model images for KServe Modelcars
#
# Stage 1: Download the model from HuggingFace
# Stage 2: Create minimal image with just the model files
#
# Usage:
#   docker build \
#     --build-arg MODEL_ID=meta-llama/Meta-Llama-3-8B-Instruct \
#     --build-arg HF_TOKEN=hf_xxx \
#     -t my-model:v1.0 .

# =============================================================================
# Stage 1: Download model from HuggingFace
# Using public.ecr.aws to avoid Docker Hub rate limits
# =============================================================================
FROM public.ecr.aws/docker/library/python:3.11-slim AS downloader

# Install required packages
RUN pip install --no-cache-dir huggingface_hub[hf_transfer]

# Enable hf_transfer for faster downloads (uses Rust-based transfer)
ENV HF_HUB_ENABLE_HF_TRANSFER=1

# Create models directory
RUN mkdir -p /models && chmod 775 /models

# Copy download script
COPY download_model.py /download_model.py
RUN chmod +x /download_model.py

# Build arguments for model ID and HuggingFace token
ARG MODEL_ID
ARG HF_TOKEN=""

# Set environment variables for the download script
ENV MODEL_ID=${MODEL_ID}
ENV HF_TOKEN=${HF_TOKEN}
ENV OUTPUT_DIR=/models

# Download the model
RUN python /download_model.py

# =============================================================================
# Stage 2: Create minimal KServe Modelcar image
# Using public.ecr.aws to avoid Docker Hub rate limits
# =============================================================================
FROM public.ecr.aws/docker/library/busybox:1.36

# KServe Modelcars expects models in /models directory
# The modelcar container will create a symlink from /mnt/models to /proc/$$/root/models
RUN mkdir -p /models && chmod 775 /models

# Copy model files from downloader stage
COPY --from=downloader /models/ /models/

# Labels for documentation
LABEL org.opencontainers.image.title="KServe Model Image"
LABEL org.opencontainers.image.description="OCI image containing model weights for KServe Modelcars"
ARG MODEL_ID
LABEL org.opencontainers.image.model="${MODEL_ID}"

# The modelcar sidecar will run: ln -sf /proc/$$/root/models /mnt/
# No CMD needed - this is a data-only container
