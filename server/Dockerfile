FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
