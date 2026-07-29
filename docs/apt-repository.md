# apt repository

`https://repo.exordos.com/deb` is the shared Exordos apt repository: one suite, one
component, every Exordos package that ships for Debian and Ubuntu. Workspace publishes
`exordos-workspace` into it from CI on every release tag.

Users add the repository once and get every Exordos package and every later release
through `apt upgrade`.

## For users

```bash
sudo mkdir -p /etc/apt/keyrings
sudo curl -fsSL https://repo.exordos.com/deb/exordos.asc -o /etc/apt/keyrings/exordos.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/exordos.asc] https://repo.exordos.com/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/exordos.list

sudo apt update
sudo apt install exordos-workspace
```

`signed-by` scopes the key to this repository: it can never authenticate packages from any
other source on the system.

Packages do not register the repository themselves. A `.deb` downloaded from a GitHub
release installs and runs, but updates arrive only for machines that added the repository
with the commands above.

Architectures: `amd64`, `arm64`. Suite `stable`, component `main`. One suite covers all
supported Debian and Ubuntu versions — packages depend only on long-lived system
libraries, and the `t64` renames in Ubuntu 24.04 are covered by their `Provides`.

## Layout

```
https://repo.exordos.com/deb/
├── exordos.asc                        # public signing key
├── dists/stable/
│   ├── InRelease                      # signed index
│   └── main/binary-{amd64,arm64}/Packages{,.gz}
└── pool/main/                         # the .deb files, all projects
```

## Repository host setup

Done once on `repo.exordos.com`. The private signing key is generated here and never
leaves the host — no CI has access to it.

### 1. aptly and the signing key

```bash
sudo apt install aptly gnupg
sudo adduser --system --group --home /var/lib/aptly aptly

sudo -u aptly gpg --batch --passphrase '' --pinentry-mode loopback \
  --quick-generate-key "Exordos apt repository <infra@exordos.com>" rsa4096 sign never
sudo -u aptly gpg --list-keys --with-colons | awk -F: '/^fpr:/{print $10; exit}'   # → FINGERPRINT
```

Export the key — not the fingerprint printed above; a fingerprint in this file leaves apt
with `E: The repository is not signed`. Export to a temporary file and check it before
putting it in place: piping `gpg` straight into the published path truncates that file to
nothing when the key is not in the keyring being asked.

```bash
sudo -u aptly gpg --armor --export FINGERPRINT > /tmp/exordos.asc

head -1 /tmp/exordos.asc
# -----BEGIN PGP PUBLIC KEY BLOCK-----   (a few KB, not 40 characters)

sudo install -m 0644 /tmp/exordos.asc /var/lib/repository/deb/exordos.asc
```

If the export comes out empty, the key belongs to another user's keyring — find it with
`sudo gpg --list-keys FINGERPRINT` and export as that user.

### 2. aptly configuration

`/var/lib/aptly/.aptly.conf`:

```json
{
  "rootDir": "/var/lib/aptly",
  "FileSystemPublishEndpoints": {
    "deb": {
      "rootDir": "/var/lib/repository/deb",
      "linkMethod": "copy"
    }
  }
}
```

One repository holds every project, so a user needs a single `sources.list` line and a new
project needs no change on any client:

```bash
sudo -u aptly aptly repo create -distribution=stable -component=main exordos
sudo -u aptly aptly publish repo -architectures=amd64,arm64 -gpg-key=FINGERPRINT \
  -origin=Exordos -label=Exordos \
  exordos filesystem:deb:
```

Set `-origin` and `-label` before the first publication: they show up in `apt policy` and
in pinning rules, and aptly otherwise writes `. stable` into both. Changing them later
means `aptly publish drop stable filesystem:deb:` and publishing again.

### 3. Publication command

`/usr/local/bin/exordos-apt-publish` — the only thing a CI deploy key may run. It reads a
tar stream of `.deb` files on stdin and publishes them, but only under the package names
that key is allowed to publish.

```bash
#!/bin/bash
# Publishes .deb packages into the shared Exordos repository.
#
# Runs only as a forced command from authorized_keys, which also fixes the package
# names this key is allowed to publish:
#
#   command="/usr/local/bin/exordos-apt-publish exordos-workspace" ssh-ed25519 AAAA... workspace-ci
#
# The arguments come from authorized_keys, so a client cannot change them: whatever
# command it asks to run lands in SSH_ORIGINAL_COMMAND and is ignored.
set -euo pipefail

REPO="exordos"
KEY="FINGERPRINT"
KEEP=5   # released versions retained per package

if [[ $# -eq 0 ]]; then
  echo "this key has no package allowance; put one in its forced command" >&2
  exit 1
fi
allowed=("$@")

incoming=$(mktemp -d)
trap 'rm -rf "$incoming"' EXIT

tar -x --no-same-owner --no-same-permissions -C "$incoming"

# A flat batch of .deb files and nothing else: no directories to hide payloads in.
while IFS= read -r entry; do
  if [[ ! -f "$entry" || "$entry" != *.deb ]]; then
    echo "refusing upload: unexpected entry ${entry#"$incoming"/}" >&2
    exit 1
  fi
done < <(find "$incoming" -mindepth 1)

mapfile -t packages < <(find "$incoming" -maxdepth 1 -name '*.deb' | sort)
if [[ ${#packages[@]} -eq 0 ]]; then
  echo "no .deb files received" >&2
  exit 1
fi

# The allowance is matched against the Package control field, never the file name:
# the file name is whatever the client chose to send, the control field is what
# aptly publishes the package under.
for deb in "${packages[@]}"; do
  name=$(dpkg-deb -f "$deb" Package)
  for pattern in "${allowed[@]}"; do
    if [[ "$name" == "$pattern" || "$name" == "$pattern"-* ]]; then
      continue 2
    fi
  done
  echo "refusing $name: this key may publish ${allowed[*]}" >&2
  exit 1
done

for deb in "${packages[@]}"; do
  printf 'accepted: %s %s %s\n' \
    "$(dpkg-deb -f "$deb" Package)" \
    "$(dpkg-deb -f "$deb" Version)" \
    "$(dpkg-deb -f "$deb" Architecture)"
done

aptly repo add -force-replace "$REPO" "${packages[@]}"

# Retention runs per package name, and only over the names this key just published:
# a shared repository holds several projects, and sorting versions across all of
# them would drop one project's builds because another released more often.
mapfile -t names < <(for deb in "${packages[@]}"; do dpkg-deb -f "$deb" Package; done | sort -u)
for name in "${names[@]}"; do
  mapfile -t stale < <(
    aptly repo search "$REPO" "Name ($name)" -format='{{.Version}}' \
      | sort -u -V -r \
      | tail -n +$((KEEP + 1))
  )
  for version in "${stale[@]}"; do
    echo "removing $name $version"
    aptly repo remove "$REPO" "Name ($name), \$Version ($version)"
  done
done

aptly publish update -gpg-key="$KEY" stable filesystem:deb:
aptly db cleanup
```

`aptly repo search -format` needs aptly 1.4 or newer; check with `aptly version` and drop
the retention block if the host runs something older.

The allowance is what keeps one project out of another's packages in a shared, signed
repository. It is enforced before anything reaches aptly, and it is matched against the
`Package` control field rather than the file name, which the client controls. A batch with
one disallowed package is rejected whole, so a partial publication cannot happen.

### 4. Deploy keys

One key pair per publishing project, and the forced command carries that project's package
allowance — `/var/lib/aptly/.ssh/authorized_keys`:

```
command="/usr/local/bin/exordos-apt-publish exordos-workspace",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,restrict ssh-ed25519 AAAA... workspace-ci
command="/usr/local/bin/exordos-apt-publish exordos-agent",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,restrict ssh-ed25519 AAAA... agent-ci
```

Everything after the script path is the allowance: an exact package name, or a prefix that
also matches `name-*`, and several may be listed. The client cannot influence it — sshd
runs the forced command with these arguments and puts whatever the client asked for into
`SSH_ORIGINAL_COMMAND`, which the script ignores. A key with no allowance publishes
nothing.

So a leaked key can push builds only under its own package names. It cannot replace
another project's package in the repository, and it cannot introduce a new name to be
picked up by machines trusting the repository signature.

What the key still allows, and what to weigh when handing one out: publishing an arbitrary
*version* of its own packages, including one that outranks the current release. Revoking a
key is deleting its line here.

### 5. nginx

```nginx
location /deb/ {
    alias /var/lib/repository/deb/;
    autoindex off;
}
```

## Checking the repository

`apt-get update` against a scratch state directory exercises the real client without
touching the machine it runs on:

```bash
work=$(mktemp -d)
mkdir -p "$work/lists/partial" "$work/cache/archives/partial"
: > "$work/status"
curl -fsSL https://repo.exordos.com/deb/exordos.asc > "$work/key.asc"
echo "deb [arch=amd64 signed-by=$work/key.asc] https://repo.exordos.com/deb stable main" > "$work/sources.list"

apt-get update \
  -o Dir::Etc::sourcelist="$work/sources.list" \
  -o Dir::Etc::sourceparts=/dev/null \
  -o Dir::Etc::preferences=/dev/null \
  -o Dir::Etc::preferencesparts=/dev/null \
  -o Dir::State::lists="$work/lists" \
  -o Dir::Cache="$work/cache" \
  -o Dir::State::status="$work/status"
```

A clean run ends without a `GPG error`. `NO_PUBKEY` means the published `.asc` is not the
exported key.

## CI contract

The `publish-apt` job in `.github/workflows/ci.yml` runs on every release tag, after
`build-electron`, and pipes the built `.deb` files into the host over SSH.

| Secret | Value |
| --- | --- |
| `APT_REPO_SSH_TARGET` | `aptly@repo.exordos.com` |
| `APT_REPO_SSH_KEY` | private half of this project's deploy key |
| `APT_REPO_SSH_KNOWN_HOSTS` | output of `ssh-keyscan repo.exordos.com` |

Until `APT_REPO_SSH_TARGET` is set the job warns and skips, so tagging keeps working
before the host exists.

`release` depends on this job, so a failed upload stops the GitHub Release from being
published: a release whose packages never reached the repository would leave `apt upgrade`
users behind the release notes. The reverse can still happen — packages published while
`release` fails — and is fixed by re-running that job.

Prerelease tags are skipped on purpose. In a deb version everything after the last hyphen
is the Debian revision, so `0.4.0-rc1` sorts *above* `0.4.0` and apt would treat a release
candidate as the newest stable build. A beta channel needs its own suite plus a version
mapping to `0.4.0~rc1`, where the tilde sorts below the release.

## Adding another project

Nothing changes on the host or on user machines. A new project needs to:

1. build a `.deb` whose `Package` name is unique in the repository;
2. get its own deploy key added to `authorized_keys` with the same forced command;
3. pipe its packages in on release — the whole contract is one command:

```bash
tar -C debs -c . | ssh -T -i deploy_key aptly@repo.exordos.com
```

`.github/workflows/ci.yml` in this repository is a working example of that job, including
the prerelease guard and the credential handling.
