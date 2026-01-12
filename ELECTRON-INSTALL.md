# Kubectl UI - Electron Desktop Application

This guide explains how to build and install Kubectl UI as a native desktop application using Electron.

## Overview

The Electron version of Kubectl UI packages the entire application (frontend and backend) into a standalone desktop application that can be installed and run without needing to manually start servers or use a web browser.

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- kubectl installed and configured on your system
- Valid kubeconfig file at `~/.kube/config`

## Installation Steps

### 1. Install Dependencies

First, make sure you have all the required dependencies installed:

```bash
npm install
```

This will install both the application dependencies and the Electron-specific packages including `electron-builder`.

### 2. Prepare Application Icons (Optional)

The default build uses placeholder icons. To use custom icons:

1. Create a 512x512 px PNG icon for your application
2. Install electron-icon-builder globally:
   ```bash
   npm install -g electron-icon-builder
   ```
3. Generate platform-specific icons:
   ```bash
   electron-icon-builder --input=./your-icon.png --output=./electron/build
   ```

This will generate:
- `icon.icns` for macOS
- `icon.ico` for Windows  
- `icon.png` for Linux

### 3. Test in Development Mode

Before building the application, test it in development mode:

```bash
npm run electron
```

Or with debug logging:

```bash
npm run electron:dev
```

This will:
1. Start the backend server on port 5174 (or custom `BACKEND_PORT`)
2. Start the frontend server on port 5173 (or custom `FRONTEND_PORT`)
3. Open an Electron window with the application

### 4. Build the Desktop Application

#### For macOS:

```bash
npm run electron:build:mac
```

This creates:
- `.dmg` installer in `dist-electron/` folder
- `.zip` archive for distribution

The build supports both Intel (x64) and Apple Silicon (arm64) architectures.

#### For Windows:

```bash
npm run electron:build:win
```

This creates:
- NSIS installer (`.exe`) in `dist-electron/` folder
- Portable executable

#### For Linux:

```bash
npm run electron:build:linux
```

This creates:
- AppImage (portable)
- `.deb` package (Debian/Ubuntu)
- `.rpm` package (RedHat/Fedora)

#### For All Platforms:

```bash
npm run electron:build:all
```

**Note:** Building for all platforms requires platform-specific tools. On macOS, you can build for all platforms, but on Windows/Linux, you may need additional setup.

## Installation

### macOS

1. Locate the `.dmg` file in `dist-electron/`
2. Double-click the `.dmg` file
3. Drag the "Kubectl UI" app to your Applications folder
4. Open from Applications or Spotlight

**First Launch Note:** macOS may show a security warning for unsigned applications. To bypass:
- Right-click the app and select "Open"
- Click "Open" in the security dialog
- Or go to System Preferences → Security & Privacy and click "Open Anyway"

### Windows

1. Locate the `.exe` installer in `dist-electron/`
2. Double-click to run the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

### Linux

#### AppImage:
```bash
chmod +x dist-electron/Kubectl-UI-*.AppImage
./dist-electron/Kubectl-UI-*.AppImage
```

#### Debian/Ubuntu (.deb):
```bash
sudo dpkg -i dist-electron/kubectl-ui_*_amd64.deb
```

#### RedHat/Fedora (.rpm):
```bash
sudo rpm -i dist-electron/kubectl-ui-*.x86_64.rpm
```

## Configuration

### Environment Variables

You can set custom ports before launching the Electron app:

```bash
export BACKEND_PORT=8080
export FRONTEND_PORT=3000
npm run electron
```

### Kubernetes Configuration

The application uses your system's kubeconfig file located at `~/.kube/config`. Make sure:
- kubectl is installed and in your PATH
- Your kubeconfig is properly configured
- You have access to your Kubernetes clusters

## Troubleshooting

### Application Won't Start

1. Check that kubectl is installed:
   ```bash
   kubectl version --client
   ```

2. Verify your kubeconfig:
   ```bash
   kubectl config view
   ```

3. Check if ports are available:
   ```bash
   # Check if ports 5173 and 5174 are free
   lsof -i :5173
   lsof -i :5174
   ```

### Build Errors

1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clear Electron builder cache:
   ```bash
   rm -rf dist-electron
   npm run electron:build:mac
   ```

### macOS Security Issues

If macOS prevents the app from running:

```bash
# Remove quarantine attribute
xattr -cr /Applications/Kubectl\ UI.app
```

### Linux Permission Issues

If you get permission errors on Linux:

```bash
# For AppImage
chmod +x kubectl-ui-*.AppImage

# For system-wide installation
sudo chown -R $USER:$USER ~/.config/kubectl-ui
```

## Updating the Application

To update to a new version:

1. Pull the latest code
2. Install dependencies: `npm install`
3. Rebuild the application: `npm run electron:build:mac` (or your platform)
4. Install the new version (overwrites the old one)

## Uninstalling

### macOS
- Drag "Kubectl UI" from Applications folder to Trash
- Remove config (optional): `rm -rf ~/.config/kubectl-ui`

### Windows
- Use "Add or Remove Programs" in Windows Settings
- Or run the uninstaller from the installation directory

### Linux
```bash
# For .deb
sudo apt remove kubectl-ui

# For .rpm
sudo rpm -e kubectl-ui

# For AppImage
rm kubectl-ui-*.AppImage
```

## Development

### Project Structure

```
electron/
  ├── main.js              # Electron main process
  ├── preload.js           # Preload script for security
  └── build/
      ├── entitlements.mac.plist  # macOS entitlements
      └── README-ICONS.md         # Icon generation guide
electron-builder.json      # Build configuration
```

### Modifying the Electron App

1. **Main Process** (`electron/main.js`): Handles window creation, backend/frontend startup, and process lifecycle
2. **Preload Script** (`electron/preload.js`): Exposes safe APIs to the renderer
3. **Builder Config** (`electron-builder.json`): Defines build targets and packaging options

### Auto-Updates (Future Enhancement)

To add auto-update functionality, you can integrate `electron-updater`:

```bash
npm install electron-updater
```

Then configure publishing in `electron-builder.json` and add update checking logic to `main.js`.

## Known Limitations

1. **Port Forwarding**: Dynamic port forwarding in containers works differently in the desktop app. The app manages port forwarding through kubectl directly.

2. **Terminal Access**: Terminal functionality requires kubectl to be accessible from the system PATH.

3. **Multi-User**: The app runs with the current user's kubectl configuration and credentials.

4. **Resource Usage**: The Electron app runs both frontend and backend servers, which uses more memory than the web version.

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [Electron Builder Documentation](https://www.electron.build/)
- [Kubectl Documentation](https://kubernetes.io/docs/reference/kubectl/)

## Support

For issues specific to the Electron version:
1. Check that the web version works correctly (`npm run dev` + `npm run server`)
2. Review console logs when running `npm run electron:dev`
3. Check the build logs in `dist-electron/` folder

