#!/usr/bin/env sh
# Replays the part of a commit that touched one version folder onto the other one.
#   scripts/port.sh <commit> <from-folder> <to-folder>      e.g. scripts/port.sh a1b2c3d global iran
# Leaves the changes staged (not committed) so you can review, test and commit them. Conflicting hunks are
# left as conflict markers (<<<<<<<) in the files.
set -eu
if [ $# -ne 3 ]; then
  echo "usage: $0 <commit> <from: global|iran> <to: global|iran>" >&2
  exit 2
fi
commit=$1 from=$2 to=$3
root=$(git rev-parse --show-toplevel)
cd "$root"
[ -d "$from" ] && [ -d "$to" ] || { echo "unknown folder" >&2; exit 2; }
if git show --format= "$commit" --relative="$from/" | grep -q .; then
  git show --format= "$commit" --relative="$from/" | git apply --3way --directory="$to" --whitespace=nowarn || {
    echo "Some hunks conflict: resolve the <<<<<<< markers in $to/." >&2
    exit 1
  }
  echo "Applied $commit ($from → $to). Review with: git diff -- $to"
else
  echo "Commit $commit does not touch $from/." >&2
  exit 1
fi
