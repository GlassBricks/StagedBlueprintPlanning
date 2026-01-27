#!/bin/bash
set -e

MAIN_WORKTREE=$(git worktree list | grep '\[main\]' | awk '{print $1}')
if [ -z "$MAIN_WORKTREE" ]; then
  echo "ERROR: Could not find main worktree"
  exit 1
fi

echo "==> Main worktree: $MAIN_WORKTREE"

BRANCHES_TO_INTEGRATE=()
SKIPPED_BRANCHES=()

while IFS= read -r line; do
  WORKTREE_PATH=$(echo "$line" | awk '{print $1}')
  BRANCH=$(echo "$line" | grep -oP '\[\K[^\]]+')

  if [ "$BRANCH" = "main" ]; then
    continue
  fi

  if ! git -C "$WORKTREE_PATH" diff --quiet || ! git -C "$WORKTREE_PATH" diff --cached --quiet; then
    SKIPPED_BRANCHES+=("$BRANCH (uncommitted changes)")
    continue
  fi

  BRANCHES_TO_INTEGRATE+=("$BRANCH:$WORKTREE_PATH")
done < <(git worktree list)

if [ ${#SKIPPED_BRANCHES[@]} -gt 0 ]; then
  echo "==> Skipping branches with uncommitted changes:"
  for SKIP in "${SKIPPED_BRANCHES[@]}"; do
    echo "    - $SKIP"
  done
fi

if [ ${#BRANCHES_TO_INTEGRATE[@]} -eq 0 ]; then
  echo "==> No branches to integrate"
  exit 0
fi

echo "==> Integrating branches: ${BRANCHES_TO_INTEGRATE[*]}"

for ENTRY in "${BRANCHES_TO_INTEGRATE[@]}"; do
  BRANCH="${ENTRY%%:*}"
  WORKTREE_PATH="${ENTRY#*:}"

  echo ""
  echo "==> Rebasing $BRANCH onto main..."
  cd "$WORKTREE_PATH"
  git rebase main

  echo "==> Merging $BRANCH into main..."
  cd "$MAIN_WORKTREE"
  git merge --ff-only "$BRANCH"
done

echo ""
echo "==> Resetting all worktrees to main..."
while IFS= read -r line; do
  WORKTREE_PATH=$(echo "$line" | awk '{print $1}')
  BRANCH=$(echo "$line" | grep -oP '\[\K[^\]]+')

  if [ "$BRANCH" = "main" ]; then
    continue
  fi

  SKIP=false
  for SKIPPED in "${SKIPPED_BRANCHES[@]}"; do
    if [[ "$SKIPPED" == "$BRANCH"* ]]; then
      SKIP=true
      break
    fi
  done

  if [ "$SKIP" = true ]; then
    continue
  fi

  echo "    Resetting $BRANCH..."
  git -C "$WORKTREE_PATH" reset --keep main
done < <(git worktree list)

echo ""
echo "==> SUCCESS: All branches integrated into main"
