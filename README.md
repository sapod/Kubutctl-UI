# Kubectl-UI

A modern, feature-rich desktop application for managing Kubernetes clusters with an intuitive graphical interface.

## Desktop Application Installation

Kubectl-UI is available as a native desktop application for macOS, Windows, and Linux with **automatic updates**.

### Download Pre-built Application

**macOS:**
- **Apple Silicon (M1/M2/M3):** [⬇️ Download DMG](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/Kubectl-UI-2.5.0-arm64.dmg) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Intel:** [⬇️ Download DMG](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/Kubectl-UI-2.5.0.dmg) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

**Windows:**
- [⬇️ Download Installer (.exe)](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/Kubectl-UI-Setup-2.5.0.exe) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

**Linux:**
- **AppImage (Universal):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/Kubectl-UI-2.5.0.AppImage) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Debian/Ubuntu (.deb):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/kubectl-ui_2.5.0_amd64.deb) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Red Hat/Fedora (.rpm):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v2.5.0/kubectl-ui-2.5.0.x86_64.rpm) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

> **Note**: Download links point to version 2.5.0. For other versions or to always get the latest, visit the [Releases page](https://github.com/sapod/Kubutctl-UI/releases).

### Installation Instructions

#### macOS
1. Download the DMG file for your architecture
2. Open the DMG file
3. Drag "Kubectl-UI" to the Applications folder
4. **Important**: The app is not code-signed, so macOS will show a warning

**To open the app for the first time:**

Option 1 - Right-click method:
- Right-click on "Kubectl-UI" in Applications
- Select "Open"
- Click "Open" in the dialog

Option 2 - Command line (if you get "damaged" error):
```bash
xattr -cr "/Applications/Kubectl-UI.app"
```
Then open normally from Applications.

> **Note**: This warning appears because the app is not signed with an Apple Developer certificate. The app is safe to use.

#### Windows
1. Download the `.exe` installer
2. Run the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

If you get a SmartScreen warning, click "More info" → "Run anyway"

#### Linux

**AppImage (Recommended):**
```bash
chmod +x Kubectl-UI-*.AppImage
./Kubectl-UI-*.AppImage
```

**Debian/Ubuntu:**
```bash
sudo dpkg -i kubectl-ui_*_amd64.deb
```

**Red Hat/Fedora:**
```bash
sudo rpm -i kubectl-ui-*.x86_64.rpm
```

### Requirements

The desktop application requires:
- **kubectl** installed and in PATH: `brew install kubectl` (macOS) or equivalent
- **AWS CLI** for EKS clusters: `brew install awscli` (macOS) or equivalent
- Access to your `~/.kube/config` file

### Quick Installation Script

For convenience, use the installation script:

```bash
cd /path/to/kubectl-ui
./install-electron.sh
```

This will automatically detect your platform and install the app.

### Automatic Updates

Kubectl-UI includes **automatic update functionality**:
- The app checks for new versions and updates with an in-app notification
- Click "Download & Install" to update automatically
- The app will restart with the new version
- No need to manually download and reinstall!

> **Note**: Updates are downloaded from GitHub releases and installed seamlessly in the background.

## Features

- **🎯 Cluster Management** - Multi-cluster support with user-friendly organization options
- **📊 Resource Monitoring** - Real-time updates for all Kubernetes resources, CPU & memory metrics, bulk operations, and advanced search & filtering
- **🖥️ Logs & Terminal** - Built-in terminal, real-time log streaming with regex search, deployment-level log aggregation, date range filtering, and log export
- **🔌 Port Forwarding** - Manage port forwards to localhost, save routine configurations, and automatically open in browser
- **🔍 Advanced Capabilities** - Pod shell access, detailed resource inspection, event monitoring, AWS SSO integration, namespace filtering, and light/dark themes

## Development Setup

### Run in Development Mode

**Prerequisites:** Node.js 20+

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run electron
   ```

### Build from Source

Build the application for your platform:

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux

# All platforms
npm run electron:build:all
```

The built application will be in the `dist-electron/` folder.

### Updating README Download Links

The download links in this README are **automatically updated** by CI/CD when a new release is published.

For manual updates (if needed), you can run:

```bash
npm run update-readme
```

This script will:
- Read the version from `package.json`
- Update all download links in README.md to point to the new version
- Ensure users always see the correct download links

**Example workflow (manual release):**
```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Update README with new version (optional - CI/CD does this automatically)
npm run update-readme

# 3. Commit changes
git add package.json README.md
git commit -m "Release v2.3.2"

# 4. Push to trigger CI/CD
git push origin master
```

> **Note**: When using CI/CD, you only need to update `package.json` and push. The README will be updated automatically after the release is published.

### Development Mode with Hot Reload

For rapid development with hot reload:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the backend server (in one terminal):
   ```bash
   npm run server
   ```

3. Start the frontend dev server (in another terminal):
   ```bash
   npm run dev
   ```

4. Open your browser: `http://localhost:5173`

The frontend will automatically reload when you make changes. Press `Ctrl+C` in each terminal to stop the servers.

**Or run everything in Electron:**
```bash
npm run electron
```
This runs the full app in Electron with DevTools open for debugging.

## Troubleshooting

### kubectl not found
Ensure kubectl is installed and in your PATH:
```bash
kubectl version --client
```

Install if needed:
- macOS: `brew install kubectl`
- Windows: `choco install kubernetes-cli`
- Linux: See [kubectl installation docs](https://kubernetes.io/docs/tasks/tools/)

### AWS CLI not found (for EKS)
Install AWS CLI if you use EKS clusters:
- macOS: `brew install awscli`
- Windows: `choco install awscli`
- Linux: `pip install awscli`

### Port conflicts
If ports 5173 or 5174 are in use:
```bash
lsof -i :5173  # Check what's using the port
lsof -i :5174
```

### Application won't start
1. Check system logs (Console.app on macOS, Event Viewer on Windows)
2. Verify kubectl is accessible: `which kubectl`
3. Check kubeconfig is valid: `kubectl cluster-info`

### Updates not working

If automatic updates fail:
1. Download the latest version manually from [Releases](https://github.com/sapod/Kubutctl-UI/releases)
2. Reinstall the application
3. On macOS, also run: `xattr -cr "/Applications/Kubectl-UI.app"`
4. Reopen the app

### Fresh install
If you encounter persistent issues:
```bash
# Remove old installation (macOS)
rm -rf "/Applications/Kubectl-UI.app"

# Remove configuration (optional)
rm -rf ~/.kubectl-ui

# Reinstall
./install-electron.sh
```

## Documentation

- [ELECTRON-INSTALL.md](./ELECTRON-INSTALL.md) - Complete installation guide
- [CICD.md](./CICD.md) - CI/CD pipeline documentation

## Contributing

See the releases page for the latest version and changelog.
