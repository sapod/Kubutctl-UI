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
  -e AWS_PROFILE=$AWS_PROFILE -e KUBECONFIG=/root/.kube/config  --add-host kubernetes.docker.internal:host-gateway --name kubectl-ui  kubectl-ui:1.0.0`

## Ready docker image repository
You can pull the ready image from the following repository: \
`docker pull sapod/kubectl-ui:1.0.0`
[See available tags on Docker Hub](https://hub.docker.com/r/sapod/kubectl-ui/tags)

## Install as app in Mac
1. Open the site in chrome browser
2. Click on the three dots on the top right corner
3. Go to Cast, Save, and Share -> Install Page as App
4. Follow the instructions
