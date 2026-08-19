#!/usr/bin/env bash
# Link the @deepseek-ai seam packages from a DeepSeek Harness checkout so this
# package can build and test against the same seam API the harness runs.
#
# Usage: scripts/link-dev-deps.sh [path-to-harness-checkout]
#   default: $HOME/deepseek-harness
#
# Each harness package resolves its own dependencies through its own pnpm
# node_modules, so linking the package directories directly (rather than the
# harness root's node_modules) preserves the isolated dependency layout.
set -euo pipefail

HARNESS="${1:-$HOME/deepseek-harness}"

mkdir -p node_modules/@deepseek-ai

for spec in \
  "cordis:$HARNESS/vendor/cordis" \
  "schemastery:$HARNESS/vendor/schemastery" \
  "dsh-web:$HARNESS/packages/web/web" \
  "dsh-launch-environment:$HARNESS/packages/util/launch-environment" \
  "dsh-invariants:$HARNESS/packages/runtime-diagnostics/invariants" \
  "dsh-web-search-deepseek:$HARNESS/packages/web/web-search-deepseek"; do
  name="${spec%%:*}"
  dir="${spec#*:}"
  if [ ! -f "$dir/package.json" ]; then
    echo "missing harness package: $dir" >&2
    exit 1
  fi
  ln -sfn "$dir" "node_modules/@deepseek-ai/$name"
done

echo "linked @deepseek-ai seam packages from $HARNESS"
