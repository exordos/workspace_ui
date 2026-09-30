# Workspace UI

Open-source corporate messenger using the Workspace API and IAM authentication. One React codebase serves the web/PWA and Electron desktop app; a WebView shell supports embedded hosts.

The independent `workspace_ui` Exordos element serves the web artifact and proxies `/api/` to the separately deployed backend. See the [deployment guide](docs/exordos-element.md).

## Getting started

Use the Node version in [.nvmrc](.nvmrc). Configure the Workspace backend origin and optional local settings using [the environment example](packages/web/.env.example).

```bash
npm install
cp packages/web/.env.example packages/web/.env
npm run dev:web
```

The default development URL is `http://localhost:5173`. A configured Workspace backend/IAM is required for real login and messaging; a vanilla Zulip server is not the new messenger contract.

## Development

| Command                    | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `npm run dev:web`          | Web development server                        |
| `npm run dev:electron`     | Web server and desktop shell                  |
| `npm run typecheck`        | Web and Electron TypeScript checks            |
| `npm run test`             | Web and Electron unit tests                   |
| `npm run check`            | Broad web quality gate and dependency audit   |
| `npm run docs:check`       | Documentation links and concrete import paths |
| `npm run e2e`              | Playwright tests                              |
| `npm run package:electron` | Local desktop package                         |

Exact versions and command coverage are maintained in manifests and [Project Facts](docs/PROJECT_FACTS.md).

## Architecture and documentation

The FSD dependency direction is `app -> pages -> widgets -> features -> entities -> shared`. Workspace sessions provide runtime ownership; entity loaders hydrate owned caches and refresh through REST; realtime catch-up and WebSocket events update domain state. UI subscribes to narrow selectors.

- [AGENTS.md](AGENTS.md): concise instructions for agents.
- [Documentation index](docs/README.md): architecture, domain maps and operational guides.
- [Contributing](CONTRIBUTING.md): workflow and verification.
- [Security policy](SECURITY.md): vulnerability reporting.
- [Code of conduct](CODE_OF_CONDUCT.md) and [changelog](CHANGELOG.md).

Project license: [Apache 2.0](LICENSE).
