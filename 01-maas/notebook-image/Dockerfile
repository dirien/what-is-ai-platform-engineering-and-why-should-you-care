# Custom Jupyter notebook image with LiteLLM/OpenAI integration
# Pre-configured for AI Platform Engineering MaaS
FROM quay.io/jupyter/scipy-notebook:2024-11-25

LABEL maintainer="AI Platform Engineering"
LABEL description="JupyterLab with AI/LLM integration for MaaS platform"

USER root

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER ${NB_UID}

# Install Python packages for LLM integration
RUN pip install --no-cache-dir \
    # OpenAI SDK for LiteLLM integration
    openai>=1.0.0 \
    # LiteLLM client library
    litellm>=1.0.0 \
    # Jupyter AI extension for chat sidebar
    jupyter-ai>=2.0.0 \
    # LangChain for advanced LLM workflows
    langchain>=0.1.0 \
    langchain-openai>=0.0.5 \
    # Additional ML/AI libraries
    transformers \
    datasets \
    accelerate \
    # Data science essentials
    pandas \
    numpy \
    matplotlib \
    seaborn \
    plotly \
    scikit-learn \
    # API and HTTP utilities
    httpx \
    requests \
    # Notebook utilities
    ipywidgets \
    nbformat

# Configure Jupyter AI to use OpenAI-compatible endpoint
RUN mkdir -p /home/${NB_USER}/.jupyter
COPY --chown=${NB_UID}:${NB_GID} jupyter_ai_config.py /home/${NB_USER}/.jupyter/

# Copy example notebooks
COPY --chown=${NB_UID}:${NB_GID} examples/ /home/${NB_USER}/examples/

# Set environment variables for LiteLLM integration
# These can be overridden at runtime
ENV OPENAI_API_BASE="http://litellm.default.svc.cluster.local:4000"
ENV JUPYTER_AI_DEFAULT_MODEL="openai-chat:gpt-3.5-turbo"

WORKDIR /home/${NB_USER}

# Expose JupyterLab port
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8888/api || exit 1
