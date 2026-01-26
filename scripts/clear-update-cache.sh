#!/bin/bash
# Script to clear electron-updater cache for testing

echo "🧹 Clearing Kubectl UI update cache..."
echo ""

CACHE_DIR="$HOME/Library/Caches/kubectl-ui-updater"

if [ -d "$CACHE_DIR" ]; then
  echo "📁 Found cache directory: $CACHE_DIR"
  ls -lh "$CACHE_DIR"
  echo ""
  rm -rf "$CACHE_DIR"
  echo "✅ Update cache cleared successfully!"
else
  echo "ℹ️  No cache directory found (already clean)"
fi

echo ""
echo "💡 Tip: Also clear dismissed updates in the app by running this in DevTools console:"
echo "   localStorage.removeItem('kubectl-ui-dismissed-2.3.6')"
echo "   (Replace 2.3.6 with the actual version number)"

