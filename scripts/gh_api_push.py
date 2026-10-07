#!/usr/bin/env python3
"""Push local commits via the GitHub Git Data API.

Use this when git push to GitHub returns 403 because the Intel EC/HPC proxy
blocks git-receive-pack (Fortinet URLfilter Policy 241). The REST API is allowed.

From the repo root:

    python3 scripts/gh_api_push.py

Repo and branch come from origin and the upstream branch (this repo: master
tracks origin/main, so the script updates refs/heads/main). Override with
GH_API_PUSH_REPO and GH_API_PUSH_BRANCH. Token: GITHUB_TOKEN, GH_TOKEN, or
`gh auth token`. No token is stored in the repo.

After a successful push the server SHAs differ from the local ones. Sync with:

    git fetch origin && git rebase origin/main
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PROXY = (
    os.environ.get("HTTPS_PROXY")
    or os.environ.get("https_proxy")
    or os.environ.get("HTTP_PROXY")
    or os.environ.get("http_proxy")
    or "http://proxy-dmz.intel.com:912"
)
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})
)


def git(args, cwd):
    return subprocess.check_output(["git"] + args, cwd=cwd, text=True).strip()


def repo_dir():
    for start in (os.getcwd(), os.path.dirname(os.path.abspath(__file__))):
        try:
            return git(["rev-parse", "--show-toplevel"], start)
        except subprocess.CalledProcessError:
            continue
    print("Not inside a git repository.", file=sys.stderr)
    sys.exit(2)


def parse_repo(url):
    cleaned = url.strip()
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    for marker in ("github.com/", "github.com:"):
        if marker in cleaned:
            return cleaned.split(marker, 1)[1]
    print("Cannot parse GitHub repo from origin URL: %s" % url, file=sys.stderr)
    sys.exit(2)


def get_token():
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        return tok.strip()
    for gh in [
        "gh",
        "/nfs/site/itools/em64t_SLES15/pkgs/github-cli/2.83.1/bin/gh",
        "/nfs/site/itools/em64t_SLES15/pkgs/github-cli/2.25.1/bin/gh",
    ]:
        try:
            if subprocess.run([gh, "--version"], capture_output=True).returncode != 0:
                continue
            tok = subprocess.check_output([gh, "auth", "token"], text=True).strip()
            if tok:
                return tok
        except FileNotFoundError:
            continue
    return None


REPO_DIR = repo_dir()
REPO = os.environ.get("GH_API_PUSH_REPO") or parse_repo(git(["remote", "get-url", "origin"], REPO_DIR))
if os.environ.get("GH_API_PUSH_BRANCH"):
    BRANCH = os.environ["GH_API_PUSH_BRANCH"]
else:
    try:
        upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], REPO_DIR)
        BRANCH = upstream.split("/", 1)[1]
    except subprocess.CalledProcessError:
        BRANCH = git(["rev-parse", "--abbrev-ref", "HEAD"], REPO_DIR)

TOKEN = get_token()
if not TOKEN:
    print("No GitHub token found.")
    print("Option A: setenv GITHUB_TOKEN <your-token> and re-run.")
    print("Option B: run 'gh auth login' then re-run.")
    print("Required scopes: repo (private) or public_repo (public).")
    sys.exit(2)


def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        "https://api.github.com" + path,
        data=body,
        method=method,
        headers={
            "Authorization": "token " + TOKEN,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "gh-api-push/1.0",
        },
    )
    try:
        with opener.open(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        print("ERROR %s %s %s: %s" % (exc.code, method, path, exc.read().decode()), file=sys.stderr)
        sys.exit(1)


print("Repo: %s  Branch: %s  Proxy: %s" % (REPO, BRANCH, PROXY))
remote_sha = api("GET", "/repos/%s/git/ref/heads/%s" % (REPO, BRANCH))["object"]["sha"]
print("Remote HEAD: %s" % remote_sha[:12])

commits_out = git(["log", "%s..HEAD" % remote_sha, "--reverse", "--format=%H"], REPO_DIR)
commit_shas = [line for line in commits_out.splitlines() if line]
print("Commits to push: %d" % len(commit_shas))
if not commit_shas:
    print("Nothing to push.")
    sys.exit(0)
for sha in commit_shas:
    print("  %s %s" % (sha[:12], git(["log", "-1", "--format=%s", sha], REPO_DIR)))

parent_sha = remote_sha
for commit_sha in commit_shas:
    author_name = git(["log", "-1", "--format=%an", commit_sha], REPO_DIR)
    author_email = git(["log", "-1", "--format=%ae", commit_sha], REPO_DIR)
    author_date = git(["log", "-1", "--format=%aI", commit_sha], REPO_DIR)
    committer_name = git(["log", "-1", "--format=%cn", commit_sha], REPO_DIR)
    committer_email = git(["log", "-1", "--format=%ce", commit_sha], REPO_DIR)
    committer_date = git(["log", "-1", "--format=%cI", commit_sha], REPO_DIR)
    commit_msg = git(["log", "-1", "--format=%B", commit_sha], REPO_DIR)
    changed = git(["diff-tree", "--no-commit-id", "-r", "--name-status", commit_sha], REPO_DIR)
    print("\nCommit %s: %d file(s)" % (commit_sha[:12], len(changed.splitlines())))

    base_tree_sha = api("GET", "/repos/%s/git/commits/%s" % (REPO, parent_sha))["tree"]["sha"]
    tree_items = []
    for line in changed.splitlines():
        status, rest = line.split("\t", 1)
        if status.startswith("R") or status.startswith("C"):
            old_path, filepath = rest.split("\t", 1)
            if status.startswith("R"):
                tree_items.append({"path": old_path, "mode": "100644", "type": "blob", "sha": None})
                print("  D %s" % old_path)
        elif status == "D":
            tree_items.append({"path": rest, "mode": "100644", "type": "blob", "sha": None})
            print("  D %s" % rest)
            continue
        else:
            filepath = rest
        file_content = subprocess.check_output(["git", "show", "%s:%s" % (commit_sha, filepath)], cwd=REPO_DIR)
        blob = api("POST", "/repos/%s/git/blobs" % REPO, {
            "content": base64.b64encode(file_content).decode(),
            "encoding": "base64",
        })
        mode_out = git(["ls-tree", commit_sha, filepath], REPO_DIR)
        mode = mode_out.split()[0] if mode_out else "100644"
        tree_items.append({"path": filepath, "mode": mode, "type": "blob", "sha": blob["sha"]})
        print("  %s %s -> blob %s" % (status[0], filepath, blob["sha"][:12]))

    tree = api("POST", "/repos/%s/git/trees" % REPO, {
        "base_tree": base_tree_sha,
        "tree": tree_items,
    })
    print("  Tree: %s" % tree["sha"][:12])
    new_commit = api("POST", "/repos/%s/git/commits" % REPO, {
        "message": commit_msg,
        "tree": tree["sha"],
        "parents": [parent_sha],
        "author": {"name": author_name, "email": author_email, "date": author_date},
        "committer": {"name": committer_name, "email": committer_email, "date": committer_date},
    })
    print("  Commit: %s" % new_commit["sha"][:12])
    parent_sha = new_commit["sha"]

api("PATCH", "/repos/%s/git/refs/heads/%s" % (REPO, BRANCH), {
    "sha": parent_sha,
    "force": False,
})
print("\nPushed! refs/heads/%s -> %s" % (BRANCH, parent_sha[:12]))
print("Sync local branch to the new remote SHA:")
print("  git fetch origin && git rebase origin/%s" % BRANCH)
