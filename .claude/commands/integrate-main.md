---
allowed-tools:
  - Bash(scripts/integrate-main.sh:*)
  - Bash(git rebase:*)
  - Bash(git checkout:*)
  - Bash(git merge:*)
  - Bash(git add:*)
---

!`scripts/integrate-main.sh || echo 'integrate-main.sh failed'`.
If it fails, fix conflicts and retry. Otherwise just report success.
