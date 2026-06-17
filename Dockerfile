FROM node:22-slim

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Pre-download the embedding model into the image
COPY warmup.js ./
RUN node warmup.js

# Copy source
COPY . .

EXPOSE 3456

CMD ["node", "server.js"]
