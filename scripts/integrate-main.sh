#!/bin/bash
set -e

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "ERROR: Already on main branch"
  exit 1
fi

echo "==> Rebasing $CURRENT_BRANCH onto main..."
git rebase main

echo "==> Finding main worktree..."
MAIN_WORKTREE=$(git worktree list | grep '\[main\]' | awk '{print $1}')
if [ -z "$MAIN_WORKTREE" ]; then
  echo "ERROR: Could not find main worktree"
  exit 1
fi

echo "==> Merging $CURRENT_BRANCH into main at $MAIN_WORKTREE..."
cd "$MAIN_WORKTREE"
git merge --ff-only "$CURRENT_BRANCH"

echo "==> SUCCESS: $CURRENT_BRANCH merged into main"
