.PHONY: lint lint-00 lint-01-infra lint-99 lint-fix lint-fix-00 lint-fix-01-infra lint-fix-99 install-lint-deps

# Install lint dependencies across all sub-projects
install-lint-deps:
	cd 00-infrastructure && npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --no-fund --no-audit
	cd 01-maas/infra && npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --no-fund --no-audit
	cd 99-model-oci-image && npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin --no-fund --no-audit

# Lint all sub-projects (TypeScript only — app frontend/backend are JS and not in scope)
lint: lint-00 lint-01-infra lint-99

lint-00:
	cd 00-infrastructure && npx tsc --noEmit

lint-01-infra:
	cd 01-maas/infra && npx tsc --noEmit

lint-99:
	cd 99-model-oci-image && npx tsc --noEmit
