#!/usr/bin/env node

/**
 * Update README Download Links Script
 * 
 * This script automatically updates the download links in README.md
 * to match the current version in package.json.
 * 
 * Usage:
 *   npm run update-readme
 * 
 * Or directly:
 *   node scripts/update-readme-version.js
 * 
 * What it does:
 * - Reads version from package.json
 * - Updates all platform download links in README.md
 * - Ensures download links point to the correct GitHub release
 * 
 * When to use:
 * - After bumping version in package.json
 * - Before committing a new release
 * - As part of the release workflow
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read package.json to get the version
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

console.log(`📦 Current version: ${version}`);

// Read README.md
const readmePath = join(rootDir, 'README.md');
let readme = readFileSync(readmePath, 'utf8');

console.log('📝 Updating README.md download links...');

// Define the download links section pattern
const downloadSectionStart = '### Download Pre-built Application';
const downloadSectionEnd = '### Installation Instructions';

// Find the download section
const startIndex = readme.indexOf(downloadSectionStart);
const endIndex = readme.indexOf(downloadSectionEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error('❌ Could not find download section in README.md');
  process.exit(1);
}

// Create the new download section with updated version
const newDownloadSection = `### Download Pre-built Application

**macOS:**
- **Apple Silicon (M1/M2/M3):** [⬇️ Download DMG](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/Kubectl-UI-${version}-arm64.dmg) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Intel:** [⬇️ Download DMG](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/Kubectl-UI-${version}.dmg) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

**Windows:**
- [⬇️ Download Installer (.exe)](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/Kubectl-UI-Setup-${version}.exe) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

**Linux:**
- **AppImage (Universal):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/Kubectl-UI-${version}.AppImage) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Debian/Ubuntu (.deb):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/kubectl-ui_${version}_amd64.deb) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)
- **Red Hat/Fedora (.rpm):** [⬇️ Download](https://github.com/sapod/Kubutctl-UI/releases/download/v${version}/kubectl-ui-${version}.x86_64.rpm) | [All Releases](https://github.com/sapod/Kubutctl-UI/releases)

> **Note**: Download links point to version ${version}. For other versions or to always get the latest, visit the [Releases page](https://github.com/sapod/Kubutctl-UI/releases).

`;

// Replace the old section with the new one
const beforeSection = readme.substring(0, startIndex);
const afterSection = readme.substring(endIndex);
const updatedReadme = beforeSection + newDownloadSection + afterSection;

// Write the updated README
writeFileSync(readmePath, updatedReadme, 'utf8');

console.log('✅ README.md updated successfully!');
console.log(`📋 Updated download links to version ${version}`);

