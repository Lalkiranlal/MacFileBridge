#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "⚡ Launching MacFileBridge on macOS..."
echo "========================================================"

# Start server in background and wait 1 sec then open browser
(sleep 1.2 && open "http://localhost:54321") &
node server/server.js
