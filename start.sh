#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=================================================="
echo "🚀 Starting MacFileBridge Server..."
echo "=================================================="

# Check node
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is required to run MacFileBridge."
    echo "Please install Node.js or run with Homebrew: brew install node"
    exit 1
fi

# Run Node server
node server/server.js
