#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const svgPath = path.join(rootDir, 'electron/build/icon.svg');
const pngPath = path.join(rootDir, 'electron/build/icon.png');

console.log('🎨 Converting SVG to PNG icon...');

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

// Convert to PNG at 512x512 (recommended size for electron-builder)
sharp(svgBuffer)
  .resize(512, 512, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('✅ Icon converted successfully!');
    console.log(`   Output: ${pngPath}`);
    console.log('');
    console.log('📦 electron-builder will automatically convert this to:');
    console.log('   - icon.icns (macOS)');
    console.log('   - icon.ico (Windows)');
    console.log('   - icon.png (Linux)');
  })
  .catch(err => {
    console.error('❌ Error converting icon:', err);
    process.exit(1);
  });

