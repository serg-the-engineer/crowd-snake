#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


AUTO_REVERT_PREFIX = "[auto-revert]"
GITHUB_ACCEPT = "application/vnd.github+json"
LINEAR_ENDPOINT = "https://api.linear.app/graphql"
LINEAR_MARKER_RE = re.compile(r"<!--\s*linear-issue:\s*([A-Z]+-\d+)\s*-->")


@dataclass
class PullRequest:
    number: int
    title: str
    url: str
    body: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--scenario", required=True)
    parser.add_argument("--wait-report", required=True)
    parser.add_argument("--browser-report", default="")
    parser.add_argument("--summary-output", required=True)
    parser.add_argument("--allow-auto-revert", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_json(path: str) -> dict | None:
    if not path:
        return None
    payload_path = Path(path)
    if not payload_path.exists():
        return None
    return json.loads(payload_path.read_text())


def github_request(path: str) -> object:
    token = os.environ["GITHUB_TOKEN"]
    api_url = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    request = urllib.request.Request(
        f"{api_url}{path}",
        headers={
            "Accept": GITHUB_ACCEPT,
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def linear_request(query: str, variables: dict) -> dict:
    api_key = os.environ.get("LINEAR_API_KEY")
    if not api_key:
        raise RuntimeError("LINEAR_API_KEY is not configured")

    payload = json.dumps({"query": query, "variables": variables}).encode()
    request = urllib.request.Request(
        LINEAR_ENDPOINT,
        data=payload,
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.loads(response.read().decode())

    if body.get("errors"):
        raise RuntimeError(json.dumps(body["errors"]))

    return body["data"]


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        check=check,
        text=True,
        capture_output=True,
    )


def short_sha(value: str) -> str:
    return value[:12]


def get_pull_request(repo: str, sha: str) -> PullRequest | None:
    owner, name = repo.split("/", 1)
    pulls = github_request(f"/repos/{owner}/{name}/commits/{sha}/pulls")
    if not pulls:
        return None

    merged_prs = [pull for pull in pulls if pull.get("merged_at")]
    chosen = sorted(
        merged_prs or pulls,
        key=lambda pull: pull.get("merged_at") or pull.get("updated_at") or "",
        reverse=True,
    )[0]
    return PullRequest(
        number=chosen["number"],
        title=chosen["title"],
        url=chosen["html_url"],
        body=chosen.get("body") or "",
    )


def extract_linear_identifier(pr: PullRequest | None) -> str | None:
    if pr is None:
        return None

    match = LINEAR_MARKER_RE.search(pr.body)
    return match.group(1) if match else None


def find_linear_issue(identifier: str) -> dict | None:
    primary_query = """
    query IssueByKey($key: String!) {
      issue(id: $key) {
        id
        identifier
        title
        url
        state {
          id
          name
        }
        team {
          id
          key
          name
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    }
    """
    data = linear_request(primary_query, {"key": identifier})
    issue = data.get("issue")
    if issue:
        return issue

    fallback_query = """
    query IssueByIdentifier($identifier: String!) {
      issues(filter: { identifier: { eq: $identifier } }, first: 1) {
        nodes {
          id
          identifier
          title
          url
          state {
            id
            name
          }
          team {
            id
            key
            name
            states {
              nodes {
                id
                name
                type
              }
            }
          }
        }
      }
    }
    """
    data = linear_request(fallback_query, {"identifier": identifier})
    issues = data["issues"]["nodes"]
    return issues[0] if issues else None


def move_issue_to_rework(issue: dict) -> str | None:
    rework_state = next(
        (
            state
            for state in issue["team"]["states"]["nodes"]
            if state["name"] == "Rework"
        ),
        None,
    )
    if rework_state is None:
        return None

    mutation = """
    mutation MoveIssueToState($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue {
          id
          state {
            id
            name
          }
        }
      }
    }
    """
    linear_request(mutation, {"id": issue["id"], "stateId": rework_state["id"]})
    return rework_state["name"]


def create_comment(issue_id: str, body: str) -> None:
    mutation = """
    mutation CreateComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
    """
    linear_request(mutation, {"issueId": issue_id, "body": body})


def create_fallback_issue(title: str, description: str) -> dict:
    team_id = os.environ.get("LINEAR_FALLBACK_TEAM_ID", "821a2ccc-70d1-446a-a34d-6627447aa70c")
    project_id = os.environ.get(
        "LINEAR_FALLBACK_PROJECT_ID", "7f5b97a3-46c5-410d-9d44-6f45d09b8b79"
    )
    mutation = """
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
    """
    data = linear_request(
        mutation,
        {
            "input": {
                "teamId": team_id,
                "projectId": project_id,
                "title": title,
                "description": description,
            }
        },
    )
    return data["issueCreate"]["issue"]


def format_browser_incidents(report: dict | None) -> str:
    if not report:
        return "- Browser report was not available."

    incidents = report.get("incidents") or []
    if not incidents:
        return "- No browser incidents were captured."

    lines = []
    for incident in incidents[:10]:
        details = []
        if incident.get("status") is not None:
            details.append(f"status={incident['status']}")
        if incident.get("method"):
            details.append(incident["method"])
        if incident.get("url"):
            details.append(incident["url"])
        if incident.get("text"):
            details.append(incident["text"])
        if incident.get("detail"):
            details.append(incident["detail"])
        if incident.get("errorText"):
            details.append(incident["errorText"])
        lines.append(f"- `{incident.get('type', 'incident')}`: {' | '.join(details)}")
    return "\n".join(lines)


def format_wait_report(report: dict | None) -> str:
    if not report:
        return "- Public build report was not available."

    if report.get("confirmed"):
        return f"- Public `/version.json` confirmed commit `{report.get('observedCommitSha')}`."

    observed = report.get("observedCommitSha") or "none"
    status = report.get("lastStatus") or "n/a"
    error = report.get("lastError") or "n/a"
    return (
        f"- Public `/version.json` did not converge to the expected commit. "
        f"observed={observed}, last_status={status}, last_error={error}"
    )


def current_commit_subject() -> str:
    return git("log", "-1", "--pretty=%s").stdout.strip()


def safe_revert(repo: str, failing_sha: str, run_url: str, pr: PullRequest | None) -> dict:
    if not os.environ.get("LINEAR_API_KEY"):
        # Linear access is optional for rollback safety.
        pass

    if current_commit_subject().startswith(AUTO_REVERT_PREFIX):
        return {"status": "skipped", "reason": "auto-revert-commit"}

    git("fetch", "origin", "main")
    origin_main = git("rev-parse", "origin/main").stdout.strip()
    if origin_main != failing_sha:
        return {
            "status": "skipped",
            "reason": "main-advanced",
            "originMainSha": origin_main,
        }

    git("checkout", "-B", "post-deploy-rollback", "origin/main")
    git("config", "user.name", "github-actions[bot]")
    git(
        "config",
        "user.email",
        "41898282+github-actions[bot]@users.noreply.github.com",
    )

    try:
        git("revert", "--no-commit", failing_sha)
    except subprocess.CalledProcessError as error:
        git("revert", "--abort", check=False)
        return {
            "status": "failed",
            "reason": "revert-command-failed",
            "stderr": error.stderr.strip(),
        }

    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        return {"status": "skipped", "reason": "empty-revert"}

    commit_message = textwrap.dedent(
        f"""\
        {AUTO_REVERT_PREFIX} revert {short_sha(failing_sha)} after post-deploy incident

        Source run: {run_url}
        Source PR: {pr.url if pr else "n/a"}
        """
    ).strip()
    git("commit", "-m", commit_message)
    revert_commit_sha = git("rev-parse", "HEAD").stdout.strip()

    try:
        git("push", "origin", "HEAD:main")
    except subprocess.CalledProcessError as error:
        return {
            "status": "failed",
            "reason": "push-failed",
            "stderr": error.stderr.strip(),
            "revertCommitSha": revert_commit_sha,
        }

    return {
        "status": "performed",
        "revertCommitSha": revert_commit_sha,
    }


def render_markdown(
    scenario: str,
    sha: str,
    run_url: str,
    pr: PullRequest | None,
    wait_report: dict | None,
    browser_report: dict | None,
    rollback: dict,
    marker_issue_identifier: str | None,
) -> str:
    scenario_title = {
        "browser_incident": "Post-deploy browser incident",
        "deploy_witness_timeout": "Public deploy confirmation failed",
    }.get(scenario, "Deploy incident")

    rollback_line = {
        "performed": f"- Rollback pushed to `main` as `{rollback.get('revertCommitSha')}`.",
        "skipped": f"- Rollback skipped: {rollback.get('reason')}.",
        "failed": f"- Rollback failed: {rollback.get('reason')} ({rollback.get('stderr', 'no stderr')}).",
        "not_applicable": "- Rollback was not attempted for this scenario.",
    }[rollback["status"]]

    issue_line = (
        f"- Source Linear issue marker: `{marker_issue_identifier}`."
        if marker_issue_identifier
        else "- Source Linear issue marker was not available."
    )

    pr_line = (
        f"- Source PR: [#{pr.number}]({pr.url}) - {pr.title}"
        if pr
        else "- Source PR could not be resolved from the merge commit."
    )

    sections = [
        f"## {scenario_title}",
        "",
        f"- Commit: `{sha}`",
        pr_line,
        issue_line,
        f"- Workflow run: {run_url}",
        rollback_line,
        "",
        "### Public Build",
        format_wait_report(wait_report),
    ]

    if scenario == "browser_incident":
        sections.extend(["", "### Browser Incidents", format_browser_incidents(browser_report)])

    return "\n".join(sections)


def write_summary(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def main() -> int:
    args = parse_args()
    wait_report = load_json(args.wait_report)
    browser_report = load_json(args.browser_report)
    summary_path = Path(args.summary_output)

    pr = get_pull_request(args.repo, args.sha)
    marker_issue_identifier = extract_linear_identifier(pr)

    rollback = {"status": "not_applicable"}
    if args.dry_run:
        rollback = {"status": "skipped", "reason": "dry-run"}
    elif args.scenario == "browser_incident" and args.allow_auto_revert:
        rollback = safe_revert(args.repo, args.sha, args.run_url, pr)

    linear_status = {"target": None, "url": None, "error": None}
    comment_body = render_markdown(
        args.scenario,
        args.sha,
        args.run_url,
        pr,
        wait_report,
        browser_report,
        rollback,
        marker_issue_identifier,
    )

    try:
        if marker_issue_identifier:
            issue = find_linear_issue(marker_issue_identifier)
        else:
            issue = None

        if issue:
            if not args.dry_run:
                create_comment(issue["id"], comment_body)
            moved_to = None if args.dry_run else move_issue_to_rework(issue)
            linear_status = {
                "target": issue["identifier"],
                "url": issue["url"],
                "movedTo": moved_to,
                "dryRun": args.dry_run,
            }
        else:
            if args.dry_run:
                linear_status = {
                    "target": None,
                    "url": None,
                    "fallback": True,
                    "dryRun": True,
                }
            else:
                fallback_title = (
                    f"Deploy incident for {short_sha(args.sha)}"
                    if args.scenario == "deploy_witness_timeout"
                    else f"Post-deploy browser incident for {short_sha(args.sha)}"
                )
                fallback_issue = create_fallback_issue(fallback_title, comment_body)
                linear_status = {
                    "target": fallback_issue["identifier"],
                    "url": fallback_issue["url"],
                    "fallback": True,
                }
    except Exception as error:  # pragma: no cover - best effort
        linear_status["error"] = str(error)

    write_summary(
        summary_path,
        {
            "scenario": args.scenario,
            "commitSha": args.sha,
            "pullRequest": None
            if pr is None
            else {"number": pr.number, "url": pr.url, "title": pr.title},
            "markerIssueIdentifier": marker_issue_identifier,
            "rollback": rollback,
            "linear": linear_status,
        },
    )

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
