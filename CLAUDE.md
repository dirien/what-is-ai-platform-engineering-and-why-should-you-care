# AI Platform Engineering Demo

This repository demonstrates AI platform engineering patterns with Pulumi and EKS.

## Project Structure

- [00-infrastructure](./00-infrastructure/CLAUDE.md) - EKS Auto Mode cluster with Karpenter GPU NodePools
- `01-maas/` - Model-as-a-Service application

## Quick Start

```bash
cd 00-infrastructure
pulumi stack select dev
pulumi preview
```

## Skills

When working with Pulumi TypeScript projects in this repo, use the `pulumi-skills:pulumi-typescript` skill for best practices on ESC integration, component patterns, and TypeScript idioms.
