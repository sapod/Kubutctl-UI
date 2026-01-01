FROM node:22.21.1-alpine

WORKDIR /srv

# Install kubectl and AWS CLI
RUN echo "http://dl-cdn.alpinelinux.org/alpine/v3.23/main" > /etc/apk/repositories && \
    echo "http://dl-cdn.alpinelinux.org/alpine/v3.23/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache kubectl aws-cli ca-certificates

# Handle self-signed certificates
ENV AWS_CA_BUNDLE=""
ENV PYTHONHTTPSVERIFY=0
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

COPY package*.json  ./

RUN npm config set strict-ssl false && \
    npm install

COPY ./src ./src
COPY ./index.html ./index.html
COPY ./vite.config.ts ./vite.config.ts
COPY ./tsconfig.json ./tsconfig.json
COPY ./start_docker.sh ./start_docker.sh

# Make start script executable
RUN chmod +x start_docker.sh

# Expose backend and frontend ports
EXPOSE 3001 5173

CMD ["./start_docker.sh"]
