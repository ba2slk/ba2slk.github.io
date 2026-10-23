#!/usr/bin/env bash
#
# Start the local blog editor at http://127.0.0.1:4100
# Usage: bash tools/editor.sh
#
# --watch-path restarts the server whenever editor code changes.

dir="$(dirname "$0")/editor"
exec node --watch-path="$dir" "$dir/server.js"
