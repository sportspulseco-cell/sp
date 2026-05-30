"""
Deploy / redeploy the scheduler-solver to Hugging Face Spaces.

Usage:
    HF_TOKEN=hf_xxx python deploy.py [--space-name scheduler-solver]

What it does:
    1. Authenticates with HF using HF_TOKEN env (never reads from disk).
    2. Resolves the username via whoami.
    3. Creates the Space if missing (sdk=docker, exist_ok=True).
    4. Uploads this directory (excluding deploy/dev artefacts) to the
       Space's git repo, which triggers an HF rebuild.
    5. Prints the public Space URL.

No secrets are ever written to disk. The HF_TOKEN env is used in-process
and discarded. Set production secrets (SOLVER_API_KEY) via the Space's
Settings -> Secrets page once the orchestrator is ready.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--space-name",
        default="scheduler-solver",
        help="Name of the HF Space (default: scheduler-solver)",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Create the Space as private (paid HF plans only).",
    )
    args = parser.parse_args()

    token = os.environ.get("HF_TOKEN")
    if not token:
        print("ERROR: set HF_TOKEN env to your Hugging Face PAT.", file=sys.stderr)
        return 2

    try:
        from huggingface_hub import HfApi
    except ImportError:
        print(
            "ERROR: `huggingface_hub` not installed. Run:\n"
            "    pip install huggingface_hub",
            file=sys.stderr,
        )
        return 2

    api = HfApi(token=token)
    me = api.whoami()
    username = me["name"]
    print(f"Authenticated as: {username}")

    repo_id = f"{username}/{args.space_name}"
    print(f"Target Space:     {repo_id}  (sdk=docker)")

    api.create_repo(
        repo_id=repo_id,
        repo_type="space",
        space_sdk="docker",
        private=args.private,
        exist_ok=True,
    )

    here = Path(__file__).parent.resolve()
    print(f"Uploading folder: {here}")

    api.upload_folder(
        folder_path=str(here),
        repo_id=repo_id,
        repo_type="space",
        commit_message="Deploy scheduler-solver",
        # Don't upload deploy-side files / dev artefacts to the Space.
        ignore_patterns=[
            "deploy.py",
            ".env",
            ".env.local",
            ".gitignore",
            ".venv/*",
            "__pycache__/*",
            "*.pyc",
        ],
    )

    space_url = f"https://huggingface.co/spaces/{repo_id}"
    runtime_url = f"https://{username}-{args.space_name}.hf.space"
    print()
    print(f"  Space dashboard: {space_url}")
    print(f"  Live URL:        {runtime_url}")
    print(f"  Health check:    {runtime_url}/health")
    print()
    print(
        "First build takes a few minutes (ortools install). Watch the\n"
        "build log on the dashboard. Once status is 'running', the URL\n"
        "above will respond."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
