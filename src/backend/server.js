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

// Set environment variables to handle SSL certificate issues with custom SSO endpoints
// This helps users who have self-signed certificates in their corporate environment
if (!process.env.AWS_CA_BUNDLE) {
    process.env.AWS_CA_BUNDLE = '';
}
if (!process.env.REQUESTS_CA_BUNDLE) {
    process.env.REQUESTS_CA_BUNDLE = '';
}
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

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
    let capturedPort = null;
    let responded = false;

    // Check if using random port (port 0) - look for "0:xxxx" in any argument
    const isRandomPort = commandArgs.some(arg => String(arg).match(/^0:\d+$/));

    // Function to send success response (defined first so tryCapturingPort can use it)
    const sendSuccessResponse = () => {
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

        // Include captured port in response
        const response = { pid, status: 'Started' };
        if (capturedPort) {
            response.localPort = capturedPort;
        }
        res.json(response);
    };

    // Function to try capturing port from output
    const tryCapturingPort = (output, source) => {
        if (capturedPort) return; // Already captured

        // kubectl outputs: "Forwarding from 127.0.0.1:xxxxx -> yyyy" or "Forwarding from [::1]:xxxxx -> yyyy"
        const match = output.match(/Forwarding from .*?:(\d+)/);
        if (match) {
            capturedPort = parseInt(match[1], 10);

            // If using random port, respond immediately after capturing
            if (isRandomPort) {
                clearTimeout(startupCheck);
                sendSuccessResponse();
            }
        }
    };

    const onStderr = (data) => {
        const output = data.toString();
        stderrOutput += output;
        if (DEBUG) console.error(`[PF-Err ${pid}]: ${output}`);

        // Try to capture port from stderr too (kubectl sometimes outputs here)
        tryCapturingPort(output, 'stderr');
    };
    child.stderr.on('data', onStderr);
    child.stderr.on('error', (err) => {
        console.error(`❌ [PF ${pid}] stderr stream error:`, err.message);
    });


    // Capture stdout to get the actual port when using port 0
    const onStdout = (data) => {
        const output = data.toString();
        if (DEBUG) console.log(`[PF-Out ${pid}]: ${output}`);

        // Try to capture port from stdout
        tryCapturingPort(output, 'stdout');
    };
    child.stdout.on('data', onStdout);
    child.stdout.on('error', (err) => {
        console.error(`❌ [PF ${pid}] stdout stream error:`, err.message);
    });

    // Wait longer for random ports to capture
    const timeoutDuration = isRandomPort ? 10000 : 5000;
    const startupCheck = setTimeout(() => {
        sendSuccessResponse();
    }, timeoutDuration);

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

// ===== PV File Explorer Endpoints =====

// Helper function to find a pod that mounts a specific PV
const findPodForPV = (pvName, namespace, callback) => {
    console.log(`[findPodForPV] Looking for PV: ${pvName}`);

    // Step 1: Get the PV to find which PVC is bound to it
    const getPvCommand = `${kubectlPath} get pv ${pvName} -o json`;

    exec(getPvCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, pvStdout) => {
        if (error) {
            console.error(`[findPodForPV] Failed to get PV:`, error.message);
            return callback(new Error(`Failed to get PV: ${error.message}`), null);
        }

        let pv;
        try {
            pv = JSON.parse(pvStdout);
        } catch (e) {
            console.error(`[findPodForPV] Failed to parse PV JSON:`, e.message);
            return callback(new Error('Failed to parse PV data'), null);
        }

        // Get the PVC name from the PV's claimRef
        const pvcName = pv.spec?.claimRef?.name;
        const pvcNamespace = pv.spec?.claimRef?.namespace || namespace;

        console.log(`[findPodForPV] PVC: ${pvcName}, namespace: ${pvcNamespace}`);

        if (!pvcName) {
            console.error(`[findPodForPV] PV is not bound to any PVC`);
            return callback(new Error('PV is not bound to any PVC'), null);
        }

        // Step 2: Get the PVC to check for labels
        const getPvcCommand = `${kubectlPath} get pvc ${pvcName} -n ${pvcNamespace} -o json`;

        exec(getPvcCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, pvcStdout) => {
            let appLabel = null;

            if (!error) {
                try {
                    const pvc = JSON.parse(pvcStdout);
                    appLabel = pvc.metadata?.labels?.app;
                    if (appLabel) {
                        console.log(`[findPodForPV] Found app label on PVC: ${appLabel}`);
                    }
                } catch (e) {
                    console.log(`[findPodForPV] Could not parse PVC, will search all pods`);
                }
            }

            // Helper function to search for pods
            const searchPods = (labelSelector, fallbackToAll = false) => {
                let labelSelectorCmd = labelSelector ? ` -l ${labelSelector}` : '';
                const findPodCommand = `${kubectlPath} get pods -n ${pvcNamespace} --field-selector=status.phase=Running${labelSelectorCmd} -o json`;

                exec(findPodCommand, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                    if (error) {
                        console.error(`[findPodForPV] Failed to get pods:`, error.message);
                        return callback(new Error(`Failed to find pods: ${error.message}`), null);
                    }

                    let pods;
                    try {
                        const result = JSON.parse(stdout);
                        pods = result.items || [];
                        console.log(`[findPodForPV] Found ${pods.length} running pods`);
                    } catch (e) {
                        console.error(`[findPodForPV] Failed to parse pods JSON:`, e.message);
                        return callback(new Error('Failed to parse pod list'), null);
                    }

                    // Find a running pod that uses this specific PVC
                    let targetPod = null;
                    let mountPath = null;
                    let targetContainer = null;

                    for (const pod of pods) {
                        const volumes = pod.spec?.volumes || [];
                        for (const volume of volumes) {
                            if (volume.persistentVolumeClaim?.claimName === pvcName) {
                                console.log(`[findPodForPV] Pod ${pod.metadata.name} uses PVC ${pvcName}`);
                                const containers = pod.spec?.containers || [];
                                for (const container of containers) {
                                    const volumeMounts = container.volumeMounts || [];
                                    for (const mount of volumeMounts) {
                                        if (mount.name === volume.name) {
                                            targetPod = pod.metadata.name;
                                            targetContainer = container.name;
                                            mountPath = mount.mountPath;
                                            console.log(`[findPodForPV] Using pod: ${targetPod}, container: ${targetContainer}, mount: ${mountPath}`);
                                            break;
                                        }
                                    }
                                    if (targetPod) break;
                                }
                            }
                            if (targetPod) break;
                        }
                        if (targetPod) break;
                    }

                    // If no pod found and we were using label selector, try without label selector
                    if (!targetPod && labelSelector && fallbackToAll) {
                        console.log(`[findPodForPV] No pod found with label selector, trying all pods`);
                        return searchPods(null, false);
                    }

                    if (!targetPod || !mountPath) {
                        console.error(`[findPodForPV] No running pod found using PVC ${pvcName}`);
                        return callback(
                            new Error(`No running pod found using PVC "${pvcName}". Deploy a pod that mounts this PVC to browse its files.`),
                            null
                        );
                    }

                    console.log(`[findPodForPV] Success - pod: ${targetPod}, container: ${targetContainer}, mountPath: ${mountPath}`);
                    callback(null, { podName: targetPod, containerName: targetContainer, mountPath, namespace: pvcNamespace });
                });
            };

            // Start search: first with app label if available, otherwise all pods
            if (appLabel) {
                searchPods(`app=${appLabel}`, true);
            } else {
                searchPods(null, false);
            }
        });
    });
};

// Helper function to list files in a pod - receives all parameters including res
const listFilesInPod = (podName, podNamespace, fullPath, targetPath, container, res) => {
    const containerArg = container ? `-c ${container}` : '';

    // Helper to list files once we know the actual path
    const performListing = (actualPath, responseMetadata = {}) => {
        const pathArg = actualPath ? `"${actualPath}"` : '';
        const lsCommand = `${kubectlPath} exec -n ${podNamespace} ${podName} ${containerArg} -- ls -la --full-time ${pathArg}`;

        exec(lsCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                const errorMsg = stderr || error.message || '';
                if (errorMsg.includes('Forbidden') || errorMsg.includes('cannot create resource "pods/exec"')) {
                    return res.status(403).json({
                        error: `Permission denied: You don't have 'pods/exec' permission in namespace "${podNamespace}". Contact your cluster administrator to grant you access.`
                    });
                }

                return res.status(500).json({ error: `Failed to list files: ${stderr || error.message}` });
            }

            const lines = stdout.split('\n').filter(line => line.trim());
            const files = [];

            // Use actualPath for building file paths, fallback to targetPath
            const basePath = actualPath || targetPath;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const parts = line.split(/\s+/);

                if (parts.length < 9) continue;

                const permissions = parts[0];
                const nameStartIdx = 8;
                const name = parts.slice(nameStartIdx).join(' ');

                if (name === '.' || name === '..') continue;

                const isDirectory = permissions.startsWith('d');
                const size = parseInt(parts[4]) || 0;
                const modTime = `${parts[5]} ${parts[6]} ${parts[7]}`;
                const itemPath = basePath === '/' ? `/${name}` : `${basePath}/${name}`.replace('//', '/');

                files.push({
                    name,
                    path: itemPath,
                    isDirectory,
                    size: isDirectory ? undefined : size,
                    modTime
                });
            }

            res.json({ files, ...responseMetadata });
        });
    };

    // If fullPath is __WORKDIR__, first get the actual working directory with pwd
    if (fullPath === '__WORKDIR__') {
        const pwdCommand = `${kubectlPath} exec -n ${podNamespace} ${podName} ${containerArg} -- pwd`;

        exec(pwdCommand, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                // Fall back to listing without path
                performListing('', {});
            } else {
                const actualWorkDir = stdout.trim();
                // List files in the working directory and include the actual path in response
                performListing(actualWorkDir, { actualPath: actualWorkDir });
            }
        });
    } else {
        // Normal path listing
        performListing(fullPath, {});
    }
};

// Unified file listing endpoint (handles both PV and Pod)
app.get('/api/files', async (req, res) => {
    const { resourceType, resourceName, namespace, path: targetPath, container } = req.query;

    if (!resourceType || !resourceName || !namespace || !targetPath) {
        return res.status(400).json({ error: 'Missing required parameters: resourceType, resourceName, namespace, path' });
    }

    if (resourceType !== 'pv' && resourceType !== 'pod') {
        return res.status(400).json({ error: 'resourceType must be either "pv" or "pod"' });
    }

    if (resourceType === 'pod') {
        // For pods, directly use the pod name and path
        listFilesInPod(resourceName, namespace, targetPath, targetPath, container, res);
    } else {
        // For PVs, find a pod that mounts the PV
        findPodForPV(resourceName, namespace, (err, podInfo) => {
            if (err) {
                return res.status(404).json({ error: err.message });
            }

            const { podName, containerName, mountPath, namespace: podNamespace } = podInfo;
            const fullPath = targetPath === '/' ? mountPath : path.join(mountPath, targetPath);

            listFilesInPod(podName, podNamespace, fullPath, targetPath, containerName, res);
        });
    }
});

// Helper function to download a file from a pod
const downloadFileFromPod = (podName, podNamespace, fullPath, fileName, container, res) => {
    // Use kubectl exec with cat instead of kubectl cp to avoid tar warnings in output
    const containerArg = container ? `-c ${container}` : '';
    const catCommand = `${kubectlPath} exec -n ${podNamespace} ${podName} ${containerArg} -- cat "${fullPath}"`;

    const child = spawn('sh', ['-c', catCommand], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    child.stdout.pipe(res);

    // Handle stderr for errors only
    child.stderr.on('data', (data) => {
        const errorMsg = data.toString();

        // Only treat as error if it's a real error
        if (errorMsg.includes('Forbidden') || errorMsg.includes('cannot create resource "pods/exec"') || errorMsg.includes('error:')) {
            if (!res.headersSent) {
                res.status(403).json({
                    error: `Permission denied: You don't have 'pods/exec' permission in namespace "${podNamespace}".`
                });
            }
        }
    });

    child.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    });
};

// Unified file download endpoint (handles both PV and Pod)
app.get('/api/download-file', async (req, res) => {
    const { resourceType, resourceName, namespace, path: targetPath, container } = req.query;

    if (!resourceType || !resourceName || !namespace || !targetPath) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (resourceType !== 'pv' && resourceType !== 'pod') {
        return res.status(400).json({ error: 'resourceType must be either "pv" or "pod"' });
    }

    const fileName = path.basename(targetPath);

    if (resourceType === 'pod') {
        downloadFileFromPod(resourceName, namespace, targetPath, fileName, container, res);
    } else {
        findPodForPV(resourceName, namespace, (err, podInfo) => {
            if (err) {
                return res.status(404).json({ error: err.message });
            }

            const { podName, containerName, mountPath, namespace: podNamespace } = podInfo;
            const fullPath = targetPath === '/' ? mountPath : path.join(mountPath, targetPath);

            downloadFileFromPod(podName, podNamespace, fullPath, fileName, containerName, res);
        });
    }
});

// Helper function to download a folder from a pod as tar.gz
const downloadFolderFromPod = (podName, podNamespace, fullPath, folderName, container, res) => {
    const containerArg = container ? `-c ${container}` : '';
    const tarCommand = `${kubectlPath} exec -n ${podNamespace} ${podName} ${containerArg} -- sh -c 'tar czf - -C "${fullPath}" . 2>/dev/null'`;

    const child = spawn('sh', ['-c', tarCommand]);

    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.tar.gz"`);
    res.setHeader('Content-Type', 'application/gzip');

    child.stdout.pipe(res);

    child.stderr.on('data', (data) => {
        const errorMsg = data.toString();

        if (errorMsg.includes('Forbidden') || errorMsg.includes('cannot create resource "pods/exec"')) {
            if (!res.headersSent) {
                res.status(403).json({
                    error: `Permission denied: You don't have 'pods/exec' permission in namespace "${podNamespace}".`
                });
            }
        }
    });

    child.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    });
};

// Unified folder download endpoint (handles both PV and Pod)
app.get('/api/download-folder', async (req, res) => {
    const { resourceType, resourceName, namespace, path: targetPath, container } = req.query;

    if (!resourceType || !resourceName || !namespace || !targetPath) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (resourceType !== 'pv' && resourceType !== 'pod') {
        return res.status(400).json({ error: 'resourceType must be either "pv" or "pod"' });
    }

    const folderName = path.basename(targetPath) || 'root';

    if (resourceType === 'pod') {
        downloadFolderFromPod(resourceName, namespace, targetPath, folderName, container, res);
    } else {
        findPodForPV(resourceName, namespace, (err, podInfo) => {
            if (err) {
                return res.status(404).json({ error: err.message });
            }

            const { podName, containerName, mountPath, namespace: podNamespace } = podInfo;
            const fullPath = targetPath === '/' ? mountPath : path.join(mountPath, targetPath);

            downloadFolderFromPod(podName, podNamespace, fullPath, folderName, containerName, res);
        });
    }
});

server.listen(port, () => {
    console.log(`🚀 Kubectl-UI Backend Server running on http://localhost:${port}`);
}).on('error', (err) => {
    console.error('Failed to start server:', err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use.`);
        // Throw error instead of process.exit so parent can handle it
        throw new Error(`EADDRINUSE: Port ${port} is already in use`);
    }
    // For other errors, throw as well
    throw err;
});
