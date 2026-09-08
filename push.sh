#!/usr/bin/env bash
# commit + push, then print an immutable jsDelivr URL for each file
set -e
cd "$(dirname "$0")"
git add -A
git diff --cached --quiet || git commit -q -m "${1:-update}"
git push -q
SHA=$(git rev-parse HEAD)
for f in *.js; do
  echo "https://cdn.jsdelivr.net/gh/assaf-hub/cdn-test@$SHA/$f"
done
