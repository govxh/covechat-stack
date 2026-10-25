# Heavy-chat test server image. Built in-run on the GitHub runner and
# loaded into kind (pullPolicy: Never) — same pattern as the MinIO images.
# Base node:20-alpine is a public Docker Hub image (unlike the deleted
# minio/minio repo, ordinary Docker Hub pulls work from the runner).
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
USER node
EXPOSE 8080
CMD ["node", "server.js"]
