#!/bin/bash

echo "========================================="
echo "Kubectl UI - Electron App Installer"
echo "========================================="
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Get version from package.json
VERSION=$(grep -m 1 '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
echo "Version: $VERSION"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    DMG="Kubectl UI-${VERSION}-arm64.dmg"
    echo "Platform: Apple Silicon"
else
    DMG="Kubectl UI-${VERSION}.dmg"
    echo "Platform: Intel Mac"
fi

# Check if DMG exists, if not build it
if [ ! -f "dist-electron/$DMG" ]; then
    echo ""
    echo "DMG not found. Building application..."
    echo "This may take a few minutes..."
    echo ""

    npm run electron:build:mac

    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ Build failed!"
        echo "Please check the error messages above."
        exit 1
    fi

    # Check if DMG was created
    if [ ! -f "dist-electron/$DMG" ]; then
        echo ""
        echo "❌ Build completed but DMG not found: dist-electron/$DMG"
        echo "Available files:"
        ls -la dist-electron/*.dmg 2>/dev/null || echo "No DMG files found"
        exit 1
    fi

    echo ""
    echo "✅ Build completed successfully!"
fi

# Remove old app
echo ""
echo "Removing old app..."
rm -rf "/Applications/Kubectl UI.app"

# Install
echo "Installing app from: dist-electron/$DMG"
if ! hdiutil attach "dist-electron/$DMG" -mountpoint /tmp/kubectl-dmg -quiet; then
    echo "❌ Failed to mount DMG file"
    exit 1
fi

if [ ! -d "/tmp/kubectl-dmg/Kubectl UI.app" ]; then
    echo "❌ App not found in DMG"
    hdiutil detach /tmp/kubectl-dmg -quiet 2>/dev/null
    exit 1
fi

cp -R "/tmp/kubectl-dmg/Kubectl UI.app" /Applications/
hdiutil detach /tmp/kubectl-dmg -quiet

if [ ! -d "/Applications/Kubectl UI.app" ]; then
    echo "❌ Failed to copy app to Applications"
    exit 1
fi

# Remove quarantine
echo "Configuring app..."
xattr -cr "/Applications/Kubectl UI.app"

# Launch
echo ""
echo "✅ Installation complete!"
echo ""
echo "Launching Kubectl UI..."
open "/Applications/Kubectl UI.app"

echo ""
echo "========================================="
echo "Requirements:"
echo "  - kubectl (brew install kubectl)"
echo "  - aws CLI for EKS (brew install awscli)"
echo "========================================="

