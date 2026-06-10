#!/usr/bin/env python3
# Copyright 2025-2026 Exordos Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
deploy-artifact.py — downloads the latest build-web artifact from a GitLab
project and deploys it to /var/www/html/, reloading nginx if the content
has changed.

Usage:
    python3 deploy-artifact.py [options]

Environment variables (alternative to CLI flags):
    GITLAB_URL        Base URL of the GitLab instance (default: https://gitlab.com)
    GITLAB_TOKEN      Personal / deploy token with read_api + read_registry scope
    GITLAB_PROJECT_ID Numeric project ID or namespace/project path (URL-encoded)
    DEPLOY_REF        Branch / tag to pull artifacts from (default: main)
    DEPLOY_DEST       Destination directory (default: /var/www/html)
    DEPLOY_INTERVAL   Polling interval in hours (default: 1)
"""

import argparse
import hashlib
import logging
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
import zipfile

import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    level=logging.INFO,
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _dir_checksum(path: str) -> str:
    """Compute a stable SHA-256 digest of all files inside *path*."""
    sha = hashlib.sha256()
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for filename in sorted(files):
            filepath = os.path.join(root, filename)
            rel = os.path.relpath(filepath, path)
            sha.update(rel.encode())
            with open(filepath, "rb") as fh:
                for chunk in iter(lambda: fh.read(65536), b""):
                    sha.update(chunk)
    return sha.hexdigest()


def _sudo_dir_checksum(path: str) -> str:
    """Compute a stable SHA-256 digest of *path* via sudo find+sha256sum.

    Used for directories owned by www-data that the current user cannot read.
    """
    result = subprocess.run(
        [
            "sudo", "find", path,
            "-type", "f",
            "-exec", "sha256sum", "{", "}", ";",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"sudo find failed (rc={result.returncode}): {result.stderr.strip()}"
        )
    lines = sorted(result.stdout.splitlines())
    outer = hashlib.sha256()
    for line in lines:
        outer.update(line.encode())
    return outer.hexdigest()


def _run_sudo(cmd: list[str]) -> None:
    """Run *cmd* via sudo, raising RuntimeError on failure."""
    full = ["sudo"] + cmd
    log.debug("Running: %s", " ".join(full))
    result = subprocess.run(full, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed (rc={result.returncode}): {' '.join(full)}\n"
            f"stderr: {result.stderr.strip()}"
        )


def _sudo_deploy(src_dir: str, dest_dir: str) -> None:
    """Copy *src_dir* contents to *dest_dir* using sudo rsync."""
    _run_sudo(["mkdir", "-p", dest_dir])
    _run_sudo([
        "rsync", "-a", "--delete",
        src_dir.rstrip("/") + "/",
        dest_dir.rstrip("/") + "/",
    ])
    _run_sudo(["chown", "-R", "www-data:www-data", dest_dir])


def _reload_nginx() -> None:
    log.info("Reloading nginx …")
    result = subprocess.run(
        ["systemctl", "reload", "nginx"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log.warning("nginx reload failed (rc=%d): %s", result.returncode, result.stderr.strip())
    else:
        log.info("nginx reloaded successfully.")


# ---------------------------------------------------------------------------
# GitLab API
# ---------------------------------------------------------------------------

def _latest_job_id(session: requests.Session, base_url: str, project_id: str, ref: str) -> int:
    """Return the job ID of the latest successful build-web job on *ref*."""
    encoded = urllib.parse.quote(project_id, safe="")
    url = f"{base_url}/api/v4/projects/{encoded}/jobs"
    params: dict = {"scope[]": "success", "per_page": 100}
    page = 1
    while True:
        params["page"] = page
        resp = session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        jobs = resp.json()
        if not jobs:
            break
        for job in jobs:
            if job.get("name") == "build-web" and job.get("ref") == ref:
                log.info("Found job id=%s  pipeline=%s  created=%s",
                         job["id"], job.get("pipeline", {}).get("id"), job.get("created_at"))
                return int(job["id"])
        page += 1
    raise RuntimeError(f"No successful 'build-web' job found for ref='{ref}'")


def _download_artifact(
    session: requests.Session,
    base_url: str,
    project_id: str,
    job_id: int,
    dest_zip: str,
) -> None:
    """Download the artifact zip for *job_id* to *dest_zip*."""
    encoded = urllib.parse.quote(project_id, safe="")
    url = f"{base_url}/api/v4/projects/{encoded}/jobs/{job_id}/artifacts"
    log.info("Downloading artifact from %s …", url)
    with session.get(url, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        with open(dest_zip, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=65536):
                fh.write(chunk)
    log.info("Downloaded %d bytes → %s", os.path.getsize(dest_zip), dest_zip)


# ---------------------------------------------------------------------------
# Deploy logic
# ---------------------------------------------------------------------------

def _deploy_once(
    session: requests.Session,
    base_url: str,
    project_id: str,
    ref: str,
    dest_dir: str,
) -> bool:
    """
    Check for a new artifact, compare with current deployment, and deploy if
    different.  Returns True if a deployment was performed.
    """
    with tempfile.TemporaryDirectory(prefix="gitlab-artifact-") as tmp:
        zip_path = os.path.join(tmp, "artifact.zip")
        extract_dir = os.path.join(tmp, "extracted")
        os.makedirs(extract_dir)

        job_id = _latest_job_id(session, base_url, project_id, ref)
        _download_artifact(session, base_url, project_id, job_id, zip_path)

        log.info("Extracting artifact …")
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)

        # The artifact contains packages/web/dist/
        dist_dir = os.path.join(extract_dir, "packages", "web", "dist")
        if not os.path.isdir(dist_dir):
            raise RuntimeError(f"Expected dist directory not found inside artifact: {dist_dir}")

        new_checksum = _dir_checksum(dist_dir)
        log.info("New artifact checksum: %s", new_checksum)

        if os.path.isdir(dest_dir) and os.listdir(dest_dir):
            old_checksum = _sudo_dir_checksum(dest_dir)
            log.info("Current deploy checksum: %s", old_checksum)
            if new_checksum == old_checksum:
                log.info("No changes detected — skipping deployment.")
                return False

        log.info("Deploying to %s …", dest_dir)
        _sudo_deploy(dist_dir, dest_dir)
        log.info("Deployment complete.")
        _reload_nginx()
        return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Periodically fetch a GitLab CI artifact and deploy to nginx.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--gitlab-url",
        default=_env("GITLAB_URL", "https://gitlab.com"),
        help="Base URL of the GitLab instance  [env: GITLAB_URL]",
    )
    parser.add_argument(
        "--token",
        default=_env("GITLAB_TOKEN"),
        help="GitLab personal/deploy token with read_api scope  [env: GITLAB_TOKEN]",
    )
    parser.add_argument(
        "--project-id",
        default=_env("GITLAB_PROJECT_ID"),
        help="GitLab project ID or 'namespace/project' path  [env: GITLAB_PROJECT_ID]",
    )
    parser.add_argument(
        "--ref",
        default=_env("DEPLOY_REF", "master"),
        help="Branch or tag to pull artifacts from  [env: DEPLOY_REF]",
    )
    parser.add_argument(
        "--dest",
        default=_env("DEPLOY_DEST", "/var/www/html"),
        help="Destination directory on this machine  [env: DEPLOY_DEST]",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=float(_env("DEPLOY_INTERVAL", "1")),
        help="Polling interval in hours  [env: DEPLOY_INTERVAL]",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single check and exit (ignores --interval)",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    if not args.token:
        log.error("GitLab token is required. Use --token or set GITLAB_TOKEN.")
        sys.exit(1)
    if not args.project_id:
        log.error("Project ID is required. Use --project-id or set GITLAB_PROJECT_ID.")
        sys.exit(1)

    session = requests.Session()
    session.headers.update({"PRIVATE-TOKEN": args.token})

    interval_seconds = args.interval * 3600

    log.info(
        "Starting deploy-artifact | url=%s project=%s ref=%s dest=%s interval=%.1fh",
        args.gitlab_url,
        args.project_id,
        args.ref,
        args.dest,
        args.interval,
    )

    while True:
        try:
            _deploy_once(
                session=session,
                base_url=args.gitlab_url.rstrip("/"),
                project_id=args.project_id,
                ref=args.ref,
                dest_dir=args.dest,
            )
        except Exception as exc:
            log.error("Deploy cycle failed: %s", exc)

        if args.once:
            break

        log.info("Next check in %.1f hour(s) …", args.interval)
        time.sleep(interval_seconds)


if __name__ == "__main__":
    main()
