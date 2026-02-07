#!/usr/bin/env bash
set -euo pipefail

worktree_path="$1"
source_root="$2"

if [[ -f "$source_root/factorio-test-data-dir/config.ini" ]]; then
    mkdir -p "$worktree_path/factorio-test-data-dir"
    cp "$source_root/factorio-test-data-dir/config.ini" "$worktree_path/factorio-test-data-dir/"
    echo "Copied factorio-test-data-dir/config.ini"
fi

if [[ -d "$source_root/factorio-test-data-dir/saves" ]]; then
    ln -snf "$source_root/factorio-test-data-dir/saves" "$worktree_path/factorio-test-data-dir/saves"
    echo "Symlinked factorio-test-data-dir/saves/"
fi

cd "$worktree_path"
pnpm i
