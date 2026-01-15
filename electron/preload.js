// Preload script for Electron
// This script runs in the renderer process before web content loads
// It has access to Node.js APIs and can expose selected APIs to the renderer

const { contextBridge, shell, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
try {
  contextBridge.exposeInMainWorld('electron', {
    // Add any Electron-specific APIs you want to expose to the renderer
    isElectron: true,
    platform: process.platform,
    openExternal: async (url) => {
      await shell.openExternal(url);
    },
    executeCommand: async (command) => {
      // Use IPC to communicate with main process
      return await ipcRenderer.invoke('execute-command', command);
    },
  });
} catch (error) {
  console.error('[Preload] Error setting up context bridge:', error);
}

