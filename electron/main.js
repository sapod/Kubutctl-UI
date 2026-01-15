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


function createWindow() {
  // Determine correct preload path for dev and production
  const preloadPath = isDev
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, 'preload.js'); // In production, preload.js is in the same dir as main.js in app.asar
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    title: 'Kubectl UI'
  });

  const frontendUrl = `http://localhost:${FRONTEND_PORT}`;
  
  const loadWindow = () => {
    mainWindow.loadURL(frontendUrl).catch((err) => {
      console.error('Failed to load URL:', err);
      setTimeout(loadWindow, 1000);
    });
  };

  setTimeout(loadWindow, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(appPath, 'src/backend/server.js');
    
    if (!fs.existsSync(serverPath)) {
      reject(new Error(`Backend server not found at: ${serverPath}`));
      return;
    }
    
    // Set environment variables
    process.env.PORT = BACKEND_PORT;
    process.env.BACKEND_PORT = BACKEND_PORT;
    process.env.NODE_ENV = 'production';
    
    // Change working directory to where node_modules are
    if (!isDev) {
      process.chdir(path.join(process.resourcesPath, 'app.asar.unpacked'));
    }
    
    // Import backend directly
    import(serverPath).then(() => {
      log('Backend started on port ' + BACKEND_PORT);
      resolve();
    }).catch((err) => {
      log('Backend error: ' + err.message);
      reject(err);
    });
  });
}

function startFrontend() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      const npmProcess = spawn('npm', ['run', 'prod', '--', '--port', FRONTEND_PORT.toString()], {
        cwd: appPath,
        env: {
          ...process.env,
          BE_PORT: BACKEND_PORT,
          FRONTEND_PORT: FRONTEND_PORT
        },
        stdio: 'inherit',
        shell: true
      });

      npmProcess.on('error', (err) => {
        log('Frontend error: ' + err.message);
        reject(err);
      });

      setTimeout(() => {
        log('Frontend started on port ' + FRONTEND_PORT);
        resolve();
      }, 3000);
      
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
  } catch (err) {
    log('Failed to start: ' + err.message);
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

