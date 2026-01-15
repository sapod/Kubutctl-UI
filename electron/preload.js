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
    // Auto-updater APIs
    checkForUpdates: async () => {
      return await ipcRenderer.invoke('check-for-updates');
    },
    downloadUpdate: async () => {
      return await ipcRenderer.invoke('download-update');
    },
    installUpdate: () => {
      ipcRenderer.invoke('install-update');
    },
    getAppVersion: async () => {
      return await ipcRenderer.invoke('get-app-version');
    },
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', (event, info) => callback(info));
    },
    onDownloadProgress: (callback) => {
      ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', (event, info) => callback(info));
    },
    onUpdateError: (callback) => {
      ipcRenderer.on('update-error', (event, error) => callback(error));
    },
  });
} catch (error) {
  console.error('[Preload] Error setting up context bridge:', error);
}

