# Workspace UI Exordos element

The `workspace_ui` element owns the public Workspace load balancer and the web
artifact. It creates a standard Exordos load-balancer VM, proxies `/api/` to the
backend node exported by the `workspace` element, and serves the SPA from the
versioned `workspace-ui.tar.zst` artifact. The UI and backend therefore have
independent versions and can be upgraded separately.

The backend element must be installed first because the UI manifest imports its
`backend_node` resource. Exordos Core `0.2.3` or newer is required.

Build the artifact and element locally with:

```bash
npm ci --include=dev
scripts/build-exordos-web-artifact.sh
exordos build . \
  --exordos-cfg-file exordos/exordos.yaml \
  --output-dir output \
  --force
```

`scripts/build-exordos-web-artifact.sh` builds the messenger-only web app,
checks its root-path PWA contract, adds `build-ref.txt` and the public
`logo-512x512.png` alias, and produces the versioned zstd tar archive.

Published manifests download the artifact from:

```text
<repository>/workspace_ui/<version>/artifacts/workspace-ui.tar.zst
```

For an isolated development repository, override `repository` while building
the manifest. If its public origin differs from the production default, also
set the exact forwarded host and scheme used by clients:

```bash
exordos build . \
  --exordos-cfg-file exordos/exordos.yaml \
  --output-dir output \
  --manifest-var repository=http://dev-repository.example/exordos-elements \
  --manifest-var public_domain=workspace.example \
  --manifest-var forwarded_host=workspace.example:8443 \
  --manifest-var forwarded_proto=https \
  --force
```

The public TLS or port-forwarding layer remains site-specific. It must forward
the Workspace origin to port 80 of the load balancer reported by the deployed
`workspace_ui` element. `public_domain` selects the virtual host served by that
load balancer. The element sets the backend `Host` and `X-Forwarded-Proto`
headers from `forwarded_host` and `forwarded_proto` so realm URLs remain
canonical behind an external TLS or port-forwarding layer.
