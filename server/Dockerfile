FROM node:20-bullseye-slim

# Retry apt-get up to 3 times to handle transient mirror connection resets.
# --fix-missing tells apt to retry failed package downloads rather than abort.
RUN apt-get update && \
    apt-get install -y --no-install-recommends --fix-missing \
        libreoffice \
        fonts-liberation \
    || (apt-get update && apt-get install -y --no-install-recommends --fix-missing \
        libreoffice \
        fonts-liberation) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
