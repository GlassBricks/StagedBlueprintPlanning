#!/usr/bin/env bash
set -euo pipefail

worktree_path="$1"
source_root="$2"

if [[ -f "$source_root/factorio-test-data-dir/config.ini" ]]; then
    mkdir -p "$worktree_path/factorio-test-data-dir"
    cp "$source_root/factorio-test-data-dir/config.ini" "$worktree_path/factorio-test-data-dir/"
    echo "Copied factorio-test-data-dir/config.ini"
fi

cd "$worktree_path"
pnpm i
