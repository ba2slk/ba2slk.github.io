#!/usr/bin/env bash
#
# Create a new post with front matter in _posts/
# Usage: bash tools/new-post.sh <slug> ["제목"]

set -euo pipefail

slug="${1:?Usage: bash tools/new-post.sh <slug> [\"제목\"]}"
title="${2:-$slug}"

file="$(dirname "$0")/../_posts/$(date +%F)-${slug}.md"
[[ -e "$file" ]] && { echo "Already exists: $file" >&2; exit 1; }

cat > "$file" <<POST
---
title: ${title}
date: $(date '+%F %T %z')
categories: []
tags: []
---

POST

echo "$file"
