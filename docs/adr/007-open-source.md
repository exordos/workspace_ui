# ADR-007: Open Source development principles

**Date**: 2026-03
**Status**: accepted

## Context

Project is developed as open source. Need governance, contribution guidelines, security policy, and community standards.

## Decision

Apache License 2.0. Standard GitHub/GitLab community files:

- `LICENSE` — Apache 2.0
- `SECURITY.md` — vulnerability reporting process
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `CONTRIBUTING.md` — already existed, extended
- Issue templates: Bug Report, Feature Request
- PR template with checklist

Principles:

1. All code reviewed via PR (no direct push to main/develop)
2. ADR for architectural decisions (visible to all contributors)
3. Conventional Commits (machine-parseable history)
4. Semantic Versioning with CHANGELOG
5. CI enforces quality gates (no exceptions)
6. Sensitive data never in repo (pre-commit hook, .gitignore)
7. Dependencies pinned and audited
8. White-label ready (no proprietary branding in core)

## Consequences

- Positive: clear governance, low barrier for new contributors, professional standards
- Negative: overhead for small team initially
- Risk: security disclosures (mitigated by SECURITY.md + private reporting)
