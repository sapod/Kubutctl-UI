import express from 'express';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import http from 'http';
import WebSocket from 'ws';
import { KubeConfig, Exec } from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to find package.json - handle both dev and production paths
let packageJson;
try {
    // Try current directory first
    packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
} catch (e) {
    try {
        // Try relative to this file (production)
        packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    } catch (e2) {
        // Fallback to default version
        console.warn('Could not find package.json, using default version');
        packageJson = { version: '1.3.0' };
    }
}

const app = express();
const port = process.env.PORT || 5174;
const DEBUG = false;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/exec' });


// Find kubectl executable path
let kubectlPath = 'kubectl';
try {
    const { execSync } = await import('child_process');
    const possiblePaths = [
        '/usr/local/bin/kubectl',
        '/opt/homebrew/bin/kubectl',
        '/usr/bin/kubectl',
        process.env.HOME + '/.local/bin/kubectl'
    ];

    try {
        kubectlPath = execSync('which kubectl', { encoding: 'utf8' }).trim();
    } catch (e) {
        for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
                kubectlPath = possiblePath;
                break;
            }
        }
    }
} catch (e) {
    // Use default
}

// Find AWS CLI executable path (needed for EKS authentication)
let awsPath = 'aws';
try {
    const { execSync } = await import('child_process');
    const possibleAwsPaths = [
        '/usr/local/bin/aws',
        '/opt/homebrew/bin/aws',
        '/usr/bin/aws',
        process.env.HOME + '/.local/bin/aws',
        '/opt/aws-cli/bin/aws'
    ];

    try {
        awsPath = execSync('which aws', { encoding: 'utf8' }).trim();
    } catch (e) {
        for (const possiblePath of possibleAwsPaths) {
            if (fs.existsSync(possiblePath)) {
                awsPath = possiblePath;
                break;
            }
        }
    }
} catch (e) {
    // Use default
}

// Add kubectl and aws directories to PATH for EKS authentication
const kubectlDir = path.dirname(kubectlPath);
const awsDir = path.dirname(awsPath);
[kubectlDir, awsDir].forEach(dir => {
    if (process.env.PATH && !process.env.PATH.includes(dir)) {
        process.env.PATH = `${dir}:${process.env.PATH}`;
    }
});

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

process.on('SIGTERM', () => {
    Object.keys(activeChildHandles).forEach(pid => {
        try {
            activeChildHandles[pid].kill();
        } catch (e) {
            // Ignore
        }
    });
    process.exit(0);
});

process.on('SIGINT', () => {
    Object.keys(activeChildHandles).forEach(pid => {
        try {
            activeChildHandles[pid].kill();
        } catch (e) {
            // Ignore
        }
    });
    process.exit(0);
});

app.use(cors());
app.use(bodyParser.json());

// Use home directory for persistent storage (works in packaged apps)
const DB_FILE = path.join(os.homedir(), '.kubectl-ui-port-forwards.json');

// Load persistent state
let persistentForwards = {};
try {
    if (fs.existsSync(DB_FILE)) {
        persistentForwards = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        // Clean up zombies on startup
        Object.keys(persistentForwards).forEach(pidKey => {
            const pid = parseInt(pidKey);
            try {
                process.kill(pid, 0);
            } catch (e) {
                delete persistentForwards[pidKey];
            }
        });
        fs.writeFileSync(DB_FILE, JSON.stringify(persistentForwards, null, 2));
    }
} catch (e) {
    console.error("Failed to load persistence file:", e);
    persistentForwards = {};
}

// In-memory map for ChildProcess objects (only for processes spawned in this session)
const activeChildHandles = {};

function savePersistence() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(persistentForwards, null, 2));
    } catch (e) {
        console.error("Failed to save persistence:", e);
    }
}

// Proxy endpoint for kubectl commands
app.post('/api/kubectl', (req, res) => {
    const { command } = req.body;

    // Basic Security: Ensure command is a kubectl command
    if (!command || !command.trim().startsWith('kubectl')) {
        return res.status(400).json({ error: 'Only kubectl commands are allowed.' });
    }

    // Replace 'kubectl' with the full path
    const fullCommand = command.replace(/^kubectl/, kubectlPath);

    if (DEBUG) {
        console.log(`[DEBUG] 📥 Received: ${command}`);
        console.log(`[DEBUG] 🔧 Executing: ${fullCommand}`);
    }

    // Increase buffer size to handle large JSON outputs (e.g. get all)
    exec(fullCommand, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
        if (error) {
            if (DEBUG) {
                console.error(`[DEBUG] ❌ Error executing: ${command}`);
                console.error(`[DEBUG] Message: ${error.message}`);
                console.error(`[DEBUG] Stderr: ${stderr}`);
            }
            return res.status(500).json({ error: error.message, stderr });
        }

        if (DEBUG) {
            console.log(`[DEBUG] ✅ Success: ${command}`);
            const snippet = stdout.trim().substring(0, 100).replace(/\n/g, ' ');
            console.log(`[DEBUG] Output: ${snippet}${stdout.length > 100 ? '...' : ''}`);
        }

        res.json({ data: stdout });
    });
});

// Endpoint for applying YAML (uses stdin)
app.post('/api/kubectl/apply', (req, res) => {
    const { yaml, namespace } = req.body;

    if (!yaml) {
        console.error("❌ [/api/kubectl/apply] Missing YAML content");
        return res.status(400).json({ error: 'Missing YAML content' });
    }

    const args = ['apply', '-f', '-'];
    if (namespace && namespace !== 'All Namespaces') {
        args.push('-n', namespace);
    }

    if (DEBUG) console.log(`[DEBUG] 📝 Applying YAML to namespace: ${namespace}`);

    let child;
    try {
        child = spawn(kubectlPath, args);
    } catch (e) {
        console.error("❌ [/api/kubectl/apply] Failed to spawn kubectl:", e.message);
        console.error("Stack:", e.stack);
        return res.status(500).json({ error: `Failed to spawn kubectl: ${e.message}` });
    }

    let stdout = '';
    let stderr = '';

    child.stdin.on('error', (err) => {
        console.error("❌ [/api/kubectl/apply] stdin error:", err.message);
    });

    try {
        child.stdin.write(yaml);
        child.stdin.end();
    } catch (e) {
        console.error("❌ [/api/kubectl/apply] Failed to write YAML to stdin:", e.message);
        return res.status(500).json({ error: `Failed to write YAML: ${e.message}` });
    }

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stdout.on('error', (err) => {
        console.error("❌ [/api/kubectl/apply] stdout stream error:", err.message);
    });

    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.stderr.on('error', (err) => {
        console.error("❌ [/api/kubectl/apply] stderr stream error:", err.message);
    });

    child.on('error', (err) => {
        console.error("❌ [/api/kubectl/apply] Process error:", err.message);
        console.error("Stack:", err.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: `Process error: ${err.message}` });
        }
    });

    child.on('close', (code) => {
        if (code === 0) {
            res.json({ data: stdout });
        } else {
            console.error(`❌ [/api/kubectl/apply] Command failed with code ${code}`);
            console.error(`Stderr: ${stderr}`);
            res.status(500).json({ error: stderr || `Command failed with code ${code}`, stderr });
        }
    });
});

// List Active Port Forwards
app.get('/api/port-forward/list', (req, res) => {
    const list = Object.values(persistentForwards).map(entry => ({
        pid: entry.pid,
        ...entry.metadata,
        status: 'Active'
    }));
    res.json({ items: list });
});

// Start Port Forwarding (Long running process)
app.post('/api/port-forward/start', (req, res) => {
    const { commandArgs, metadata } = req.body;

    if (!commandArgs || !Array.isArray(commandArgs)) {
        console.error("❌ [/api/port-forward/start] Invalid arguments:", commandArgs);
        return res.status(400).json({ error: 'Invalid arguments' });
    }

    if (DEBUG) console.log(`[DEBUG] 🚀 Spawning: kubectl ${commandArgs.join(' ')}`);

    let child;
    try {
        child = spawn(kubectlPath, commandArgs);
    } catch (e) {
        console.error("❌ [/api/port-forward/start] Failed to spawn kubectl:", e.message);
        console.error("Stack:", e.stack);
        return res.status(500).json({ error: `Failed to spawn kubectl: ${e.message}` });
    }

    const pid = child.pid;

    if (!pid) {
        console.error("❌ [/api/port-forward/start] Failed to get PID from spawned process");
        return res.status(500).json({ error: 'Failed to spawn process' });
    }

    let stderrOutput = '';
    const onStderr = (data) => {
        stderrOutput += data.toString();
        if (DEBUG) console.error(`[PF-Err ${pid}]: ${data}`);
    };
    child.stderr.on('data', onStderr);
    child.stderr.on('error', (err) => {
        console.error(`❌ [PF ${pid}] stderr stream error:`, err.message);
    });

    child.stdout.on('error', (err) => {
        console.error(`❌ [PF ${pid}] stdout stream error:`, err.message);
    });

    let responded = false;

    const startupCheck = setTimeout(() => {
        if (responded) return;
        responded = true;

        activeChildHandles[pid] = child;
        persistentForwards[pid] = { pid, metadata, commandArgs };
        savePersistence();

        child.on('close', (code, signal) => {
            console.log(`[PF ${pid}] Process exited with code ${code}, signal: ${signal}`);
            if (stderrOutput) {
                console.error(`[PF ${pid}] Final stderr: ${stderrOutput}`);
            }
            delete activeChildHandles[pid];
            if (persistentForwards[pid]) {
                delete persistentForwards[pid];
                savePersistence();
            }
        });

        child.on('error', (err) => {
            console.error(`❌ [PF ${pid}] Process error:`, err.message);
            console.error("Stack:", err.stack);
        });

        res.json({ pid, status: 'Started' });
    }, 5000);

    child.on('error', (err) => {
        if (responded) return;
        responded = true;
        clearTimeout(startupCheck);
        console.error(`❌ [PF] Spawn error for ${commandArgs.join(' ')}:`, err.message);
        console.error("Stack:", err.stack);
        res.status(500).json({ error: `Spawn error: ${err.message}` });
    });

    child.on('close', (code, signal) => {
        if (responded) return;
        responded = true;
        clearTimeout(startupCheck);
        const msg = stderrOutput || `Process exited immediately with code ${code}. Check if port is in use.`;
        console.error(`❌ [PF] Port-forward failed to start (code ${code}, signal ${signal}): ${msg}`);
        res.status(400).json({ error: msg.trim() });
    });
});

// Stop Port Forwarding
app.post('/api/port-forward/stop', (req, res) => {
    const { pid } = req.body;

    if (!pid) {
        console.error("❌ [/api/port-forward/stop] Missing PID");
        return res.status(400).json({ error: 'Missing PID' });
    }

    let stopped = false;

    if (activeChildHandles[pid]) {
        if (DEBUG) console.log(`[DEBUG] 🛑 Killing active process ${pid}`);
        try {
            activeChildHandles[pid].kill();
            stopped = true;
        } catch (e) {
            console.error(`❌ Failed to kill active process ${pid}:`, e.message);
        }
    } else if (persistentForwards[pid]) {
        if (DEBUG) console.log(`[DEBUG] 🛑 Killing persistent process ${pid}`);
        try {
            process.kill(pid);
            stopped = true;
        } catch (e) {
            console.log(`Failed to kill process ${pid}: ${e.message} (may already be stopped)`);
            stopped = true;
        }
    }

    if (activeChildHandles[pid]) delete activeChildHandles[pid];
    if (persistentForwards[pid]) {
        delete persistentForwards[pid];
        savePersistence();
    }

    if (stopped) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Process not found or already stopped' });
    }
});

// Spawn External Shell
app.post('/api/kubectl/shell', (req, res) => {
    const { pod, namespace, container } = req.body;
    if (!pod || !namespace) {
        console.error("❌ [/api/kubectl/shell] Missing pod or namespace");
        return res.status(400).json({ error: 'Missing pod or namespace' });
    }

    const k8sCmd = `${kubectlPath} exec -it ${pod} -n ${namespace} ${container ? `-c ${container}` : ''} -- /bin/sh`;

    let spawnCmd = '';
    let spawnArgs = [];

    if (process.platform === 'win32') {
        spawnCmd = 'cmd.exe';
        spawnArgs = ['/c', 'start', 'cmd', '/k', k8sCmd];
    } else if (process.platform === 'darwin') {
        spawnCmd = 'osascript';
        spawnArgs = ['-e', `tell application "Terminal" to do script "${k8sCmd}"`, '-e', 'tell application "Terminal" to activate'];
    } else if (process.platform === 'linux') {
        spawnCmd = 'x-terminal-emulator';
        spawnArgs = ['-e', k8sCmd];
    } else {
        console.error(`❌ [/api/kubectl/shell] Unsupported platform: ${process.platform}`);
        return res.status(500).json({ error: `Unsupported platform: ${process.platform}` });
    }

    console.log(`[Shell] Launching external terminal: ${spawnCmd} ${spawnArgs.join(' ')}`);

    try {
        const child = spawn(spawnCmd, spawnArgs, { detached: true, stdio: 'ignore' });

        child.on('error', (err) => {
            console.error("❌ [Shell] Failed to spawn terminal:", err.message);
            console.error("Stack:", err.stack);
        });

        child.unref();
        res.json({ success: true, message: 'Terminal launched' });
    } catch (e) {
        console.error("❌ [Shell] Exception spawning terminal:", e.message);
        console.error("Stack:", e.stack);
        res.status(500).json({ error: e.message });
    }
});

// Version check endpoint
app.get('/api/version/check', async (req, res) => {
  try {
    const response = await fetch('https://hub.docker.com/v2/repositories/sapod/kubectl-ui/tags?page_size=100');
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      // Filter out 'latest' tag and find the most recent semantic version
      const versionTags = data.results
        .map(tag => tag.name)
        .filter(name => name !== 'latest' && /^\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => {
          const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
          const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
          if (aMajor !== bMajor) return bMajor - aMajor;
          if (aMinor !== bMinor) return bMinor - aMinor;
          return bPatch - aPatch;
        });

      const latestVersion = versionTags[0] || null;

      res.json({
        latestVersion,
        currentVersion: packageJson.version,
        allTags: data.results.map(t => t.name).slice(0, 10) // First 10 tags for debugging
      });
    } else {
      res.json({ latestVersion: null, error: 'No tags found' });
    }
  } catch (error) {
    console.error('Error checking Docker Hub version:', error);
    res.status(500).json({ error: 'Failed to check version', message: error.message });
  }
});

// Load kube config:
// - Out-of-cluster (Docker backend): mounts ~/.kube/config and uses it.
// - In-cluster (k8s backend): loads service account automatically.
wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const namespace = url.searchParams.get('ns') || 'default';
  const pod = url.searchParams.get('pod');
  const container = url.searchParams.get('container') || undefined;
  const shell = url.searchParams.get('shell') || '/bin/sh';

  if (!pod) {
    ws.close(1011, 'pod is required');
    return;
  }

  // Reload KubeConfig for each connection to pick up context changes
  const kc = new KubeConfig();
  try {
    kc.loadFromDefault();
  } catch (err) {
    ws.send(`\r\n[Error loading kubeconfig: ${err.message}]\r\n`);
    ws.close(1011, 'Failed to load kubeconfig');
    return;
  }
  const k8sExec = new Exec(kc);

  // Streams to bridge Kubernetes exec <-> WebSocket
  const inStream = new PassThrough();   // client -> pod stdin
  const outStream = new PassThrough();  // pod stdout -> client
  const errStream = new PassThrough();  // pod stderr -> client
  let closed = false;

  inStream.setEncoding('utf8');
  outStream.setEncoding('utf8');
  errStream.setEncoding('utf8');

  // Pipe pod output back to browser terminal
  outStream.on('data', (chunk) => ws.readyState === WebSocket.OPEN && ws.send(chunk.toString('utf-8')));
  errStream.on('data', (chunk) => ws.readyState === WebSocket.OPEN && ws.send(chunk.toString('utf-8')));

  // Incoming data from terminal goes to pod stdin
  ws.on('message', (msg) => {
    if (typeof msg === 'string') inStream.write(msg);
    else inStream.write(Buffer.from(msg));
  });

  ws.on('close', () => {
    closed = true;
    inStream.end();
    outStream.destroy();
    errStream.destroy();
  });

  try {
    // Attach to pod shell. tty=true for interactive session.
    await k8sExec.exec(
      namespace,
      pod,
      container,
      [shell],
      outStream,
      errStream,
      inStream,
      true, // tty
      (status) => {
        // Called when stream ends; send a final message
        if (!closed && ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n[Session ended: ${JSON.stringify(status)}]\r\n`);
          ws.close();
        }
      }
    );
  } catch (err) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\n[Error starting shell: ${err.message}]\r\n`);
      ws.close(1011, err.message);
    }
  }
});

server.listen(port, () => {
    console.log(`🚀 Kubectl-UI Backend Server running on http://localhost:${port}`);
}).on('error', (err) => {
    console.error('Failed to start server:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use.`);
    }
    process.exit(1);
});
