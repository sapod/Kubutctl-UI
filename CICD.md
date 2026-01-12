# CI/CD Pipeline - Desktop Application Releases

## Overview

The GitHub Actions workflow automatically builds and releases desktop applications for macOS, Windows, and Linux whenever code is pushed to the master branch.

## How It Works

### Trigger
- Push to `master` branch
- Pull request merged to `master`

### Build Process

1. **Parallel Builds** - Three jobs run simultaneously:
   - **macOS**: Builds `.dmg` and `.zip` for Intel and Apple Silicon
   - **Windows**: Builds `.exe` installer
   - **Linux**: Builds `.AppImage`, `.deb`, and `.rpm`

2. **Create Release** - After all builds complete:
   - Checks if version tag already exists
   - Creates Git tag (e.g., `v1.3.0`)
   - Creates GitHub Release
   - Attaches all installers to the release

### Release Assets

Each release includes:

**macOS:**
- `Kubectl UI-{version}-arm64.dmg` (Apple Silicon)
- `Kubectl UI-{version}.dmg` (Intel)
- ZIP archives for both architectures

**Windows:**
- `Kubectl UI Setup {version}.exe`

**Linux:**
- `Kubectl UI-{version}.AppImage` (universal)
- `kubectl-ui_{version}_amd64.deb` (Debian/Ubuntu)
- `kubectl-ui-{version}.x86_64.rpm` (Red Hat/Fedora)

## Creating a New Release

### 1. Update Version

Edit `package.json`:
```json
{
  "version": "1.4.0"
}
```

### 2. Commit and Push

```bash
git add package.json
git commit -m "Release v1.4.0"
git push origin master
```

### 3. Workflow Runs Automatically

The workflow will:
- ✅ Build installers for all platforms
- ✅ Create Git tag `v1.4.0`
- ✅ Create GitHub Release with all files attached

## Testing Locally

Before pushing, test the build:

```bash
# Build frontend
npm run build

# Build for your platform
npm run electron:build:mac    # macOS
npm run electron:build:win    # Windows
npm run electron:build:linux  # Linux

# Build all platforms (takes longer)
npm run electron:build:all
```

## Build Artifacts

- Artifacts are uploaded with 30-day retention
- Available even if release creation fails
- Can be downloaded from GitHub Actions workflow runs

## Troubleshooting

### Build fails on specific platform
- Check the logs in GitHub Actions for that platform
- Test locally if possible
- Verify all dependencies are installed

### Release creation fails
- Check if tag already exists
- Verify GITHUB_TOKEN has write permissions
- Ensure artifact upload succeeded

### Tag already exists error
The workflow skips release creation if the tag already exists. To force a new release:
1. Delete the tag: `git tag -d v1.3.0 && git push origin :refs/tags/v1.3.0`
2. Update version in package.json
3. Push again

## Requirements

No additional secrets are required! The workflow uses:
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## Workflow File Location

`.github/workflows/build-and-release.yml`
