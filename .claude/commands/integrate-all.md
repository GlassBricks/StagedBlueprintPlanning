---
allowed-tools:
  - Read(../**)
  - Write(../**)
  - Bash(scripts/integrate-all.sh:*)
  - Bash(git rebase:*)
  - Bash(git merge:*)
  - Bash(git reset:*)
  - Bash(git add:*)
---

!`scripts/integrate-all.sh || echo 'integrate-all.sh failed'`
If this fails, fix conflicts and retry. Otherwise just report success.
