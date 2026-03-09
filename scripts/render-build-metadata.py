#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


BODY_VERSION_RE = re.compile(r'(data-app-version=")[^"]*(")')
BODY_COMMIT_RE = re.compile(r'(data-app-commit-sha=")[^"]*(")')
VISIBLE_VERSION_RE = re.compile(
    r'(<span class="value" id="current-version">)[^<]*(</span>)'
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index-html", required=True)
    parser.add_argument("--version-json", required=True)
    parser.add_argument("--commit-sha", required=True)
    parser.add_argument("--updated-at", required=True)
    return parser.parse_args()


def replace_required(pattern: re.Pattern[str], text: str, value: str) -> str:
    updated_text, count = pattern.subn(
        lambda match: f"{match.group(1)}{value}{match.group(2)}", text, count=1
    )
    if count != 1:
        raise ValueError(f"Expected exactly one match for pattern {pattern.pattern!r}")
    return updated_text


def main() -> int:
    args = parse_args()

    version_path = Path(args.version_json)
    version_payload = json.loads(version_path.read_text())
    version_payload["updatedAt"] = args.updated_at
    version_payload["commitSha"] = args.commit_sha
    version_path.write_text(json.dumps(version_payload, indent=2) + "\n")

    html_path = Path(args.index_html)
    html = html_path.read_text()
    html = replace_required(BODY_VERSION_RE, html, version_payload["version"])
    html = replace_required(BODY_COMMIT_RE, html, args.commit_sha)
    html = replace_required(VISIBLE_VERSION_RE, html, version_payload["version"])
    html_path.write_text(html)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
