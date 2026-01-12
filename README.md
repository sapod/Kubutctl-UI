## Features

- Light/Dark Theme Toggle
- Multi-cluster management with visual hotbar
- Real-time resource monitoring
- Built-in terminal access
- Port forwarding management + saved routines

## Desktop Application Installation

Kubectl UI is available as a native desktop application for macOS, Windows, and Linux.

### Download Pre-built Application

Download the latest release for your platform from the [Releases page](https://github.com/YOUR_USERNAME/YOUR_REPO/releases):

**macOS:**
- Apple Silicon (M1/M2/M3): `Kubectl UI-{version}-arm64.dmg`
- Intel: `Kubectl UI-{version}.dmg`

**Windows:**
- `Kubectl UI Setup {version}.exe`

**Linux:**
- AppImage: `Kubectl UI-{version}.AppImage` (universal, no installation needed)
- Debian/Ubuntu: `kubectl-ui_{version}_amd64.deb`
- Red Hat/Fedora: `kubectl-ui-{version}.x86_64.rpm`

### Installation Instructions

#### macOS
1. Download the DMG file for your architecture
2. Open the DMG file
3. Drag "Kubectl UI" to the Applications folder
4. Launch from Applications (right-click → Open on first launch)

If you get a security warning:
```bash
xattr -cr "/Applications/Kubectl UI.app"
```

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

### Run as Web Application (Development Only)

For development purposes, you can also run the app as a web application:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application:
   ```bash
   chmod +x ./start_mac.sh
   ./start_mac.sh
   ```

3. Open your browser: `http://localhost:5173`

4. Stop the application:
   ```bash
   ./stop_mac.sh
   ```

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

### Fresh install
If you encounter issues:
```bash
# Remove old installation
rm -rf "/Applications/Kubectl UI.app"  # macOS

# Reinstall
./install-electron.sh
```

## Documentation

- [ELECTRON-INSTALL.md](./ELECTRON-INSTALL.md) - Complete installation guide
- [CICD.md](./CICD.md) - CI/CD pipeline documentation

## Contributing

See the releases page for the latest version and changelog.
