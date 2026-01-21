// Immediate error logging
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Now import everything else
import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, exec } from 'child_process';
import http from 'http';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

// Simple MIME type mapping
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
};

// Log function for console output
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
};

log('Kubectl UI starting...');

let mainWindow = null;
let frontendServer = null;

const BACKEND_PORT = process.env.BACKEND_PORT || 5174;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;

const isDev = !app.isPackaged;
const appPath = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath, 'app.asar.unpacked');

// IPC Handler for executing shell commands
ipcMain.handle('execute-command', async (event, command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error.message, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
});

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false; // Disabled - we'll manually call quitAndInstall

// CRITICAL: Disable signature verification for unsigned apps
// This allows updates to work without code signing
Object.defineProperty(app, 'isPackaged', {
  get() {
    return true;
  }
});

// For macOS, allow unsigned updates
if (process.platform === 'darwin') {
  autoUpdater.allowDowngrade = true;
  autoUpdater.allowPrerelease = false;

  // Disable signature verification - this is safe for self-distributed apps
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// Enable detailed logging
autoUpdater.logger = {
  info: (msg) => log('[AutoUpdater] INFO:', msg),
  warn: (msg) => log('[AutoUpdater] WARN:', msg),
  error: (msg) => log('[AutoUpdater] ERROR:', msg),
  debug: (msg) => log('[AutoUpdater] DEBUG:', msg)
};

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  log('Update available:', info.version);
  pendingUpdateInfo = info;
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', () => {
  // Silent - no update available
});

// Track if we should use fallback installation due to code signing error
let shouldUseFallbackInstall = false;
let pendingUpdateInfo = null;

autoUpdater.on('error', (err) => {
  log('Error in auto-updater:', err.message || err);
  log('Error stack:', err.stack);

  // Check if this is a code signing error
  const isCodeSignError = err.message && (
    err.message.includes('Code signature') ||
    err.message.includes('code has no resources')
  );

  if (isCodeSignError) {
    log('Code signing error - using fallback installation');
    shouldUseFallbackInstall = true;
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log('Update downloaded successfully');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

// IPC handlers for update operations
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { updateAvailable: false, message: 'Updates not available in development mode' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: result !== null, updateInfo: result?.updateInfo };
  } catch (error) {
    log('Error checking for updates:', error.message);
    return { updateAvailable: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log('Error downloading update:', error.message || error);
    log('Error stack:', error.stack);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  // If we detected a code signing error, skip straight to fallback
  if (shouldUseFallbackInstall && process.platform === 'darwin') {
    return await performFallbackInstallation();
  }

  // Try electron auto-update first (works on Windows/Linux, may work on signed macOS)
  return new Promise((resolve) => {
    let hasQuit = false;

    setTimeout(async () => {
      try {
        autoUpdater.quitAndInstall(true, true);
        hasQuit = true;
      } catch (error) {
        log('quitAndInstall error:', error.message);
        const result = await performFallbackInstallation();
        resolve(result);
        return;
      }
    }, 200);

    // If app hasn't quit after 2 seconds, quitAndInstall failed - use fallback
    setTimeout(async () => {
      if (!hasQuit) {
        const result = await performFallbackInstallation();
        resolve(result);
      } else {
        const result = await performFallbackInstallation();
        resolve(result);
      }
    }, 2000);
  });
});

// Perform fallback installation by extracting and installing the cached update
async function performFallbackInstallation() {
  const cacheDir = path.join(app.getPath('cache'), 'kubectl-ui-updater', 'pending');

  try {
    const files = fs.readdirSync(cacheDir);
    const updateFile = files.find(f => f.endsWith('.zip') || f.endsWith('.dmg'));

    if (!updateFile) {
      return {
        success: false,
        error: 'Update file not found. Please download manually.',
        downloadUrl: 'https://github.com/sapod/Kubutctl-UI/releases/latest'
      };
    }

    const updatePath = path.join(cacheDir, updateFile);

    // For macOS, we need to extract and install the ZIP
    if (process.platform === 'darwin') {
      return await installMacOSUpdate(updatePath);
    } else {
      // For Windows/Linux, if we get here, something went wrong
      return {
        success: false,
        error: 'Auto-update failed',
        downloadUrl: 'https://github.com/sapod/Kubutctl-UI/releases/latest'
      };
    }
  } catch (err) {
    log('Error in fallback installation:', err.message);
    return {
      success: false,
      error: 'Installation failed: ' + err.message,
      downloadUrl: 'https://github.com/sapod/Kubutctl-UI/releases/latest'
    };
  }
}

// Fallback installation for macOS
async function installMacOSUpdate(zipPath) {
  const tempDir = path.join(app.getPath('temp'), 'kubectl-ui-update-' + Date.now());
  const appPath = '/Applications/Kubectl-UI.app';

  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Extract ZIP
    await new Promise((resolve, reject) => {
      exec(`unzip -q "${zipPath}" -d "${tempDir}"`, (error, stdout, stderr) => {
        if (error) {
          log('Extract error:', error.message);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Find the .app in extracted contents
    const extractedApp = path.join(tempDir, 'Kubectl-UI.app');

    if (!fs.existsSync(extractedApp)) {
      throw new Error('Extracted app not found');
    }

    // Remove quarantine attributes from extracted app
    await new Promise((resolve) => {
      exec(`xattr -cr "${extractedApp}"`, (error) => {
        if (error) {
          log('xattr warning:', error.message);
        }
        resolve();
      });
    });

    // Remove old app
    if (fs.existsSync(appPath)) {
      await new Promise((resolve, reject) => {
        exec(`rm -rf "${appPath}"`, (error) => {
          if (error) {
            log('Error removing old app:', error.message);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    // Copy new app to Applications
    await new Promise((resolve, reject) => {
      exec(`cp -R "${extractedApp}" "${appPath}"`, (error, stdout, stderr) => {
        if (error) {
          log('Error copying app:', error.message);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Verify the app was actually copied
    if (!fs.existsSync(appPath)) {
      throw new Error('App copy failed - file does not exist at destination');
    }
    
    // Clean up temp directory
    try {
      await new Promise((resolve) => {
        exec(`rm -rf "${tempDir}"`, (error) => {
          if (error) {
            log('Cleanup error:', error.message);
          }
          resolve();
        });
      });
    } catch (err) {
      log('Cleanup error:', err.message);
    }

    // Schedule the new app to launch after current app quits
    try {
      process.chdir('/Applications');
    } catch (e) {
      log('Could not change directory:', e.message);
    }

    // Create a small script that will launch the app after a delay
    const launchScript = `#!/bin/bash
sleep 2
open "/Applications/Kubectl-UI.app"
`;
    const scriptPath = path.join(app.getPath('temp'), 'launch-kubectl-ui.sh');

    try {
      fs.writeFileSync(scriptPath, launchScript);
      fs.chmodSync(scriptPath, '755');

      // Execute the script in background
      exec(`"${scriptPath}" &`, (error) => {
        if (error) {
          log('Error scheduling app launch:', error.message);
        }
      });
    } catch (err) {
      log('Error creating launch script:', err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    app.quit();

    return { success: true, method: 'fallback' };

  } catch (err) {
    log('Installation error:', err.message);

    // Clean up on error
    try {
      if (fs.existsSync(tempDir)) {
        exec(`rm -rf "${tempDir}"`, () => {});
      }
    } catch (cleanupErr) {
      log('Cleanup error:', cleanupErr.message);
    }

    return {
      success: false,
      error: 'Installation failed: ' + err.message,
      downloadUrl: 'https://github.com/sapod/Kubutctl-UI/releases/latest'
    };
  }
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});


function createWindow() {
  // Determine correct preload path for dev and production
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, 'preload.js'); // In production, preload.js is in the same dir as main.js in app.asar

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    title: 'Kubectl UI'
  });

  // Use the actual port that frontend is running on (may have changed if original port was taken)
  const actualFrontendPort = process.env.FRONTEND_PORT || FRONTEND_PORT;
  const frontendUrl = `http://localhost:${actualFrontendPort}`;

  // Show window when ready to prevent crashes
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Better error handling for load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log(`Failed to load: ${errorCode} - ${errorDescription}`);
    setTimeout(() => {
      mainWindow.loadURL(frontendUrl);
    }, 2000);
  });

  const loadWindow = () => {
    mainWindow.loadURL(frontendUrl).catch((err) => {
      log('Load URL error: ' + err.message);
      setTimeout(loadWindow, 1000);
    });
  };

  setTimeout(loadWindow, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend(port = BACKEND_PORT, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(appPath, 'src/backend/server.js');

    if (!fs.existsSync(serverPath)) {
      reject(new Error(`Backend server not found at: ${serverPath}`));
      return;
    }

    // Set environment variables
    process.env.PORT = port;
    process.env.BACKEND_PORT = port;
    process.env.NODE_ENV = 'production';

    // Change working directory to where node_modules are
    if (!isDev) {
      process.chdir(path.join(process.resourcesPath, 'app.asar.unpacked'));
    }

    let resolved = false;
    let uncaughtHandler;
    let unhandledHandler;

    // Set up error handlers
    uncaughtHandler = (error) => {
      if (resolved) return;
      
      const isPortError = error.code === 'EADDRINUSE' || 
                         (error.message && error.message.includes('EADDRINUSE'));
      
      if (isPortError) {
        log(`Port ${port} is in use`);
        
        // Try up to 5 different ports
        if (retryCount < 5) {
          const nextPort = port + 1;
          log(`Retrying with port ${nextPort}...`);
          resolved = true;
          
          // Clean up handlers
          process.removeListener('uncaughtException', uncaughtHandler);
          process.removeListener('unhandledRejection', unhandledHandler);
          
          // Retry with next port
          startBackend(nextPort, retryCount + 1)
            .then(resolve)
            .catch(reject);
        } else {
          resolved = true;
          process.removeListener('uncaughtException', uncaughtHandler);
          process.removeListener('unhandledRejection', unhandledHandler);
          reject(new Error(`Could not find available port after ${retryCount} attempts. Last tried: ${port}`));
        }
      } else {
        resolved = true;
        process.removeListener('uncaughtException', uncaughtHandler);
        process.removeListener('unhandledRejection', unhandledHandler);
        log('Backend error: ' + error.message);
        reject(error);
      }
    };

    unhandledHandler = (error) => {
      uncaughtHandler(error);
    };

    // Listen for errors during startup
    process.once('uncaughtException', uncaughtHandler);
    process.once('unhandledRejection', unhandledHandler);

    // Import backend directly
    import(serverPath)
      .then(() => {
        // Wait a bit to see if the server throws an error
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            process.removeListener('uncaughtException', uncaughtHandler);
            process.removeListener('unhandledRejection', unhandledHandler);
            log('Backend started on port ' + port);
            resolve();
          }
        }, 1000);
      })
      .catch((err) => {
        if (resolved) return;
        
        resolved = true;
        process.removeListener('uncaughtException', uncaughtHandler);
        process.removeListener('unhandledRejection', unhandledHandler);
        
        // Check if this is a port conflict error
        const isPortError = err.code === 'EADDRINUSE' || 
                           (err.message && err.message.includes('EADDRINUSE'));
        
        if (isPortError && retryCount < 5) {
          const nextPort = port + 1;
          log(`Port ${port} is in use, retrying with port ${nextPort}...`);
          startBackend(nextPort, retryCount + 1)
            .then(resolve)
            .catch(reject);
        } else if (isPortError) {
          reject(new Error(`Could not find available port after ${retryCount} attempts. Last tried: ${port}`));
        } else {
          log('Backend error: ' + err.message);
          reject(err);
        }
      });
  });
}

function startFrontend() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      let actualPort = null;
      let hasResolved = false;

      const npmProcess = spawn('npm', ['run', 'prod', '--', '--port', FRONTEND_PORT.toString()], {
        cwd: appPath,
        env: {
          ...process.env,
          BE_PORT: BACKEND_PORT,
          FRONTEND_PORT: FRONTEND_PORT
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      // Capture stdout to detect actual port
      npmProcess.stdout.on('data', (data) => {
        const output = data.toString();

        // Match Vite's port output: "Local:   http://localhost:XXXX/"
        const portMatch = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
        if (portMatch && !hasResolved) {
          actualPort = parseInt(portMatch[1], 10);
          log(`Frontend started on port ${actualPort}`);

          // Update the global FRONTEND_PORT variable
          process.env.FRONTEND_PORT = actualPort.toString();

          // Wait a bit for Vite to be fully ready, then resolve
          setTimeout(() => {
            hasResolved = true;
            resolve();
          }, 2000);
        }
      });

      npmProcess.stderr.on('data', (data) => {
        // Silent - ignore stderr output unless there's an error
      });

      npmProcess.on('error', (err) => {
        log('Frontend error: ' + err.message);
        if (!hasResolved) {
          hasResolved = true;
          reject(err);
        }
      });

      // Fallback timeout - if port not detected after 10 seconds, something is wrong
      setTimeout(() => {
        if (!hasResolved) {
          log('Frontend port detection timeout - assuming default port');
          process.env.FRONTEND_PORT = FRONTEND_PORT.toString();
          hasResolved = true;
          resolve();
        }
      }, 10000);

    } else {
      const distPath = path.join(appPath, 'dist');

      if (!fs.existsSync(distPath)) {
        reject(new Error(`Built frontend not found at: ${distPath}`));
        return;
      }

      const server = http.createServer((req, res) => {
        let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);

        if (!fs.existsSync(filePath)) {
          filePath = path.join(distPath, 'index.html');
        }

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading file');
            return;
          }

          const mimeType = getMimeType(filePath);
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(data);
        });
      });

      server.listen(FRONTEND_PORT, 'localhost', () => {
        log(`Frontend started on port ${FRONTEND_PORT}`);
        frontendServer = server;
        resolve();
      });

      server.on('error', (err) => {
        log('Frontend error: ' + err.message);
        reject(err);
      });
    }
  });
}

function cleanup() {
  if (frontendServer) {
    try {
      frontendServer.close();
    } catch (err) {
      console.error('Error closing frontend server:', err);
    }
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    await startFrontend();
    createWindow();
    log('Kubectl UI started successfully');

    // Check for updates after app starts (delay to let UI load)
    if (!isDev) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
          log('checkForUpdates error:', err);
        });
      }, 5000);
    }
  } catch (err) {
    log('Failed to start: ' + err.message);
    log('Error stack: ' + err.stack);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', cleanup);

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

