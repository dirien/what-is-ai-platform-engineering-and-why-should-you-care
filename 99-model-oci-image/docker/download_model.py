#!/usr/bin/env python3
"""
Download a HuggingFace model to a local directory.
This script is used in the first stage of the multi-stage Docker build.
"""

import os
import sys
from huggingface_hub import snapshot_download


def main():
    # Get model ID from environment variable
    model_id = os.environ.get("MODEL_ID")
    if not model_id:
        print("ERROR: MODEL_ID environment variable is required", file=sys.stderr)
        sys.exit(1)

    # Get HuggingFace token from environment variable (optional, required for gated models)
    # Treat empty string as None
    hf_token = os.environ.get("HF_TOKEN")
    if hf_token is not None and hf_token.strip() == "":
        hf_token = None

    # Output directory
    output_dir = os.environ.get("OUTPUT_DIR", "/models")

    print(f"Downloading model: {model_id}")
    print(f"Output directory: {output_dir}")
    print(f"Using HF token: {'Yes' if hf_token else 'No (public models only)'}")

    try:
        # Download the model
        snapshot_download(
            repo_id=model_id,
            local_dir=output_dir,
            token=hf_token,
            # Ignore patterns to reduce size (optional)
            ignore_patterns=[
                "*.md",
                "*.txt",
                ".gitattributes",
                "original/*",
                "*.msgpack",
                "*.h5",
                # Keep only safetensors if available, ignore pytorch bin files
                # Uncomment the next line to prefer safetensors over pytorch
                # "*.bin",
            ],
        )
        print(f"Successfully downloaded model to {output_dir}")
    except Exception as e:
        print(f"ERROR: Failed to download model: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
