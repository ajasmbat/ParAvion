#!/bin/sh
set -eu

echo "→ installing dependencies…"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
echo "✓ setup complete"
