#!/usr/bin/env bash

set -euo pipefail

echo "🔧 Running format"
yarn format

echo "🧹 Running lint"
yarn lint

echo "🧪 Running tests"
yarn test

echo "🧮 Type-checking project"
yarn typecheck

echo "🔐 Running yarn audit"
yarn audit --groups dependencies

echo "📦 Checking for outdated dependencies"
yarn outdated

echo "✅ All checks completed"

