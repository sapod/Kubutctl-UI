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
    // Get unique session ID per app launch (same across refreshes, different on new launch)
    getAppSessionId: async () => {
      return await ipcRenderer.invoke('get-app-session-id');
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
    // Logs window management
    openLogsWindow: async (width, height) => {
      return await ipcRenderer.invoke('open-logs-window', { width, height });
    },
    closeLogsWindow: async () => {
      return await ipcRenderer.invoke('close-logs-window');
    },
    onLogsWindowClosed: (callback) => {
      ipcRenderer.on('logs-window-closed', () => callback());
    },
    // Listen for app quit event
    onAppWillQuit: (callback) => {
      ipcRenderer.on('app-will-quit', () => callback());
    },
    // Cleanup on quit
    cleanupOnQuit: () => {
      try {
        localStorage.removeItem('kube_logs_state');
        localStorage.removeItem('terminalActiveTab');
        return true;
      } catch (e) {
        return false;
      }
    },
  });
} catch (error) {
  console.error('[Preload] Error setting up context bridge:', error);
}

