#!/usr/bin/env bash

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <branch-name>"
    echo "Example: $0 feature/new-feature"
    exit 1
fi

BRANCH="$1"
WORKTREE_PATH="../StagedBlueprintPlanning-${BRANCH//\//-}"
MAIN_DIR="$(pwd)"

if git show-ref --verify --quiet "refs/heads/$BRANCH" || git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    echo "Creating worktree for existing branch '$BRANCH' at '$WORKTREE_PATH'..."
    git worktree add "$WORKTREE_PATH" "$BRANCH"
else
    echo "Branch '$BRANCH' does not exist. Creating new branch at current commit..."
    git worktree add "$WORKTREE_PATH" -b "$BRANCH"
fi

echo "Setting up symlinks..."
ln -sf "$MAIN_DIR/node_modules" "$WORKTREE_PATH/node_modules"
ln -sf "$MAIN_DIR/factorio-test-data-dir" "$WORKTREE_PATH/factorio-test-data-dir"
ln -sf "$MAIN_DIR/.vscode" "$WORKTREE_PATH/.vscode"

if [ -f "$MAIN_DIR/.env" ]; then
    echo "Copying .env file..."
    cp "$MAIN_DIR/.env" "$WORKTREE_PATH/.env"
fi

echo "✓ Worktree created successfully at: $WORKTREE_PATH"
echo "  - Symlinked: node_modules, factorio-test-data-dir, .vscode"
if [ -f "$MAIN_DIR/.env" ]; then
    echo "  - Copied: .env"
fi
