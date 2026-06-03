# Security Policy

## Supported Versions

| Version  | Supported |
| -------- | --------- |
| latest   | ✅ Yes    |
| < latest | ❌ No     |

Only the latest release receives security updates.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, report security issues through **GitHub**:

1. Open the repository on GitHub: [github.com/exordos/workspace_ui](https://github.com/exordos/workspace_ui)
2. Go to **Security** → **Report a vulnerability** (private security advisory)

If private advisories are unavailable, contact maintainers via GitHub Issues only after coordinating privately (do not post exploit details publicly).

Include in your report:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

## Response Timeline

| Step               | Timeline               |
| ------------------ | ---------------------- |
| Acknowledgment     | Within 48 hours        |
| Initial assessment | Within 5 business days |
| Fix (critical)     | Within 7 days          |
| Fix (high)         | Within 14 days         |
| Fix (medium/low)   | Next release cycle     |

## Disclosure

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We will:

1. Acknowledge receipt of your report
2. Investigate and validate the issue
3. Develop and test a fix
4. Release the fix and publish a security advisory
5. Credit you (unless you prefer anonymity)

## Scope

In scope:

- XSS, CSRF, injection vulnerabilities in web app
- Authentication/authorization bypasses
- Credential exposure in logs, network, or storage
- Electron security issues (sandbox escape, privilege escalation)
- Dependency vulnerabilities with known exploits

Out of scope:

- Denial of service (rate limiting is server-side)
- Social engineering
- Physical access attacks
- Issues in third-party Zulip server software
