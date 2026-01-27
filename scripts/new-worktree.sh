#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <branch-name> [base-branch]"
    echo "  branch-name: Name for the new worktree/branch"
    echo "  base-branch: Branch to base off (default: main)"
    exit 1
fi

BRANCH_NAME="$1"
BASE_BRANCH="${2:-main}"
GIT_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="$(dirname "$GIT_ROOT")/$BRANCH_NAME"

if [[ -d "$WORKTREE_PATH" ]]; then
    echo "Error: Worktree already exists at $WORKTREE_PATH"
    exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_BRANCH"
fi

echo "Created worktree at $WORKTREE_PATH"

cd "$WORKTREE_PATH"
npm ci
