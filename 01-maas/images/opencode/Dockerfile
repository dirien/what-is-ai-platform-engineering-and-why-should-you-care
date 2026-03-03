FROM golang:latest AS golang
FROM hashicorp/terraform:latest AS terraform
FROM pulumi/pulumi:latest AS pulumi
FROM python:slim-bookworm AS python
FROM node:bookworm-slim AS node

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    libatomic1 \
    tar \
    unzip \
    xz-utils \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python /usr/local/ /usr/local/
COPY --from=node /usr/local/ /usr/local/
COPY --from=golang /usr/local/go /usr/local/go
COPY --from=terraform /bin/terraform /usr/local/bin/terraform
COPY --from=pulumi /usr/bin/pulumi /usr/local/bin/pulumi

ENV SHELL=/bin/bash

RUN ln -sf /usr/local/go/bin/go /usr/local/bin/go \
    && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt \
    && go version \
    && terraform version \
    && gh --version | head -n 1 \
    && pulumi version \
    && python3 --version \
    && pip3 --version \
    && node --version \
    && npm --version

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash

# Move binary to a standard location
RUN cp /root/.opencode/bin/opencode /usr/local/bin/opencode && \
    chmod +x /usr/local/bin/opencode && \
    opencode --version

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
