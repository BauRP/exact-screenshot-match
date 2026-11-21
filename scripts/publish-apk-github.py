#!/usr/bin/env python3
"""Publish an externally built APK to one stable GitHub Release.

Uses a Codemagic-only GITHUB_TOKEN secret, never a token committed to git.
The release asset gets replaced, so the download URL never changes.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "BauRP/exact-screenshot-match"
TAG = "super-notes-preview"
ASSET = "SuperNotes-debug.apk"
APK = Path("artifacts") / ASSET
API = f"https://api.github.com/repos/{REPO}"


def request_json(method: str, url: str, token: str, payload: dict | None = None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()
    return json.loads(body) if body else {}


def run() -> None:
    # Never publish test builds from unmerged branches.
    branch = os.environ.get("CM_BRANCH", "")
    if branch != "main":
        print(f"Skip GitHub Release: this is the {branch or 'unknown'} branch.")
        return

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("GitHub release not configured: add secret GITHUB_TOKEN in Codemagic.")
        print("The APK can still be downloaded from this Codemagic build's Artifacts tab.")
        return

    if not APK.is_file() or APK.stat().st_size == 0:
        raise FileNotFoundError(f"Build output is missing: {APK}")

    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    short_sha = sha[:12]
    build_id = os.environ.get("CM_BUILD_ID", "manual")
    release_body = (
        "Installable debug APK built by Codemagic outside GitHub Actions.\n\n"
        f"Source commit: {sha}\nCodemagic build: {build_id}\n\n"
        "Important: debug signing keys may differ between builds. "
        "Uninstall a previous debug install if Android rejects an update. "
        "Your app's local notes may be removed by uninstalling, so back up data first.\n"
    )

    try:
        release = request_json("GET", f"{API}/releases/tags/{TAG}", token)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        release = request_json("POST", f"{API}/releases", token, {
            "tag_name": TAG,
            "target_commitish": sha,
            "name": "Super Notes - Latest test APK",
            "body": release_body,
            "draft": False,
            "prerelease": False,
        })
    else:
        release = request_json(
            "PATCH", f"{API}/releases/{release['id']}", token,
            {
                "name": "Super Notes - Latest test APK",
                "body": release_body,
                "draft": False,
                "prerelease": False,
            },
        )

    for old in release.get("assets", []):
        if old.get("name") == ASSET:
            request_json("DELETE", f"{API}/releases/assets/{old['id']}", token)

    upload_url = (
        f"https://uploads.github.com/repos/{REPO}/releases/{release['id']}/assets"
        f"?{urllib.parse.urlencode({'name': ASSET})}"
    )
    contents = APK.read_bytes()
    upload_request = urllib.request.Request(
        upload_url,
        data=contents,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Length": str(len(contents)),
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="POST",
    )
    with urllib.request.urlopen(upload_request, timeout=300) as response:
        asset = json.loads(response.read())
    print(f"Published APK for commit {short_sha}: {asset['browser_download_url']}")
    print(
        f"Stable download: https://github.com/{REPO}/releases/download/{TAG}/{ASSET}"
    )


if __name__ == "__main__":
    try:
        run()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:900]
        print(f"GitHub release publishing failed (HTTP {exc.code}): {detail}", file=sys.stderr)
        raise SystemExit(1) from exc
