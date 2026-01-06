## Features

- Light/Dark Theme Toggle
- Multi-cluster management with visual hotbar
- Real-time resource monitoring
- Built-in terminal access
- Port forwarding management + saved routines

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Give execution permissions to the scripts:
   `chmod +x ./start_mac.sh ./stop_mac.sh`
3. Run the app:
   `sh ./start_mac.sh`
4. Open your browser and navigate to `http://localhost:5173`
5. **To stop the app, run:
   `sh ./stop_mac.sh`
6. Docker build: `docker build -t kubectl-ui:1.0.0 .`

## Run as Docker image
1. Enable host networking in MacOS: \
   2. In Docker desktop go to Settings -> Resources -> Network \
   3. check "Enable host networking"
2. Run the docker image:
`docker run -d --restart always --network host -v ~/.kube:/root/.kube -v ~/.kube:/Users/<username>/.kube -v ~/.aws:/root/.aws \
  -e KUBECONFIG=/root/.kube/config  --add-host kubernetes.docker.internal:host-gateway --name kubectl-ui  kubectl-ui:latest`
3. If host network is not possible, map ports instead:
`docker run -d --restart always -p 5173:5173 -p 5174:5174 -p 9229:9229 -p 9000-9010:9000-9010 -v ~/.kube:/root/.kube -v ~/.kube:/Users/<username>/.kube -v ~/.aws:/root/.aws \
  -e KUBECONFIG=/root/.kube/config  --add-host kubernetes.docker.internal:host-gateway --name kubectl-ui  sapod/kubectl-ui:latest`

## Run docker image with script
You can run the `runApp.sh` script to start the docker image automatically. \
Make sure to give execution permissions to the script: \
`chmod +x ./runApp.sh` \
Then run the script: \
`sh ./runApp.sh`

### Script Options
- `--version <tag>`: Specify the Docker image tag to use (default: latest)
- `--extra-ports "PORT1:PORT1,PORT2:PORT2,..."`: Comma-separated list of additional ports to map (non host network mode)
- `--backend-port <PORT>`: Set BACKEND_PORT environment variable in the container and map the port (replaces 5174:5174)
- `--frontend-port <PORT>`: Set FRONTEND_PORT environment variable in the container and map the port (replaces 5173:5173)

### Usage Examples
Run with default options:
`sh ./runApp.sh`

Run with extra ports:
`sh ./runApp.sh --extra-ports "8000:8000,8081:8081"`

Run with custom backend and frontend ports:
`sh ./runApp.sh --backend-port 12345 --frontend-port 5174`

Run with a specific image version:
`sh ./runApp.sh --version 1.2.3 --backend-port 12345 --frontend-port 5174 --extra-ports "8000:8000"`

## Ready docker image repository
You can pull the ready image from the following repository: \
`docker pull sapod/kubectl-ui:1.0.0`
[See available tags on Docker Hub](https://hub.docker.com/r/sapod/kubectl-ui/tags)

## Install as app in Mac
1. Open the site in chrome browser
2. Click on the three dots on the top right corner
3. Go to Cast, Save, and Share -> Install Page as App
4. Follow the instructions
