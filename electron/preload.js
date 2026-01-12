// Preload script for Electron
// This script runs in the renderer process before web content loads
// It has access to Node.js APIs and can expose selected APIs to the renderer

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Add any Electron-specific APIs you want to expose to the renderer
  isElectron: true,
  platform: process.platform,
});

