# Jupyter AI configuration for LiteLLM integration
# This file configures the Jupyter AI extension to use the LiteLLM proxy

import os

# Configuration for jupyter-ai
c = get_config()  # noqa: F821

# Set default model provider to OpenAI-compatible (LiteLLM)
# The base URL is set via OPENAI_API_BASE environment variable
c.AiExtension.default_language_model = os.environ.get(
    "JUPYTER_AI_DEFAULT_MODEL",
    "openai-chat:gpt-3.5-turbo"
)

# Enable the chat interface
c.AiExtension.enable_chat = True

# Allow code generation
c.AiExtension.enable_code_generation = True
