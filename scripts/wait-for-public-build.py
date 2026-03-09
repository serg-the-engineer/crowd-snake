#!/usr/bin/env python3
import argparse
import base64
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--expected-commit-sha", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--username", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--interval-seconds", type=int, default=5)
    return parser.parse_args()


def request_json(url: str, username: str, password: str) -> tuple[int, dict]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    if username or password:
        credentials = f"{username}:{password}".encode()
        token = base64.b64encode(credentials).decode()
        request.add_header("Authorization", f"Basic {token}")

    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode())
        return response.status, payload


def write_report(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def main() -> int:
    args = parse_args()
    deadline = time.monotonic() + args.timeout_seconds
    expected_commit_sha = args.expected_commit_sha.lower()
    output_path = Path(args.output)

    attempts = 0
    last_result: dict = {
        "confirmed": False,
        "url": args.url,
        "expectedCommitSha": expected_commit_sha,
        "attempts": 0,
        "lastStatus": None,
        "lastPayload": None,
        "lastError": None,
        "finishedAt": None,
    }

    while time.monotonic() < deadline:
        attempts += 1
        try:
            status, payload = request_json(args.url, args.username, args.password)
            observed_commit_sha = str(payload.get("commitSha", "")).strip().lower()
            last_result.update(
                {
                    "attempts": attempts,
                    "lastStatus": status,
                    "lastPayload": payload,
                    "lastError": None,
                    "observedCommitSha": observed_commit_sha or None,
                }
            )
            if observed_commit_sha == expected_commit_sha:
                last_result["confirmed"] = True
                break
        except urllib.error.HTTPError as error:
            body = error.read().decode(errors="replace")
            last_result.update(
                {
                    "attempts": attempts,
                    "lastStatus": error.code,
                    "lastPayload": None,
                    "lastError": body or str(error),
                }
            )
        except Exception as error:  # pragma: no cover - best effort reporting
            last_result.update(
                {
                    "attempts": attempts,
                    "lastStatus": None,
                    "lastPayload": None,
                    "lastError": str(error),
                }
            )
        time.sleep(args.interval_seconds)

    last_result["finishedAt"] = now_iso()
    write_report(output_path, last_result)
    print(json.dumps(last_result))
    return 0 if last_result["confirmed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
