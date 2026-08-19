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
the manifest:

```bash
exordos build . \
  --exordos-cfg-file exordos/exordos.yaml \
  --output-dir output \
  --manifest-var repository=http://dev-repository.example/exordos-elements \
  --force
```

The published element is host-agnostic. The public load balancer must terminate
TLS, preserve the client `Host`, and forward HTTP to port 80 of the load
balancer exported by `workspace_ui`. A user can then point any DNS name at the
public load balancer without rebuilding or editing the element manifest.

The Workspace load balancer accepts every non-empty hostname and forwards
nginx's normalized `$host` value to the backend. It also identifies the
external scheme as `https`, so IAM redirects remain on the hostname chosen by
the user. The public load balancer is therefore the trust boundary: rewriting
`Host` changes the hostname visible to Workspace and breaks this one-click DNS
contract.

The element also replaces the load-balancer image's packaged default site with
an HTTP-only port 80 fallback that rejects requests which do not contain a
matching hostname. This keeps TLS certificates and the public 443 listener at
the site-specific edge instead of exposing an unconfigured fallback TLS
listener on the internal Workspace load balancer.
