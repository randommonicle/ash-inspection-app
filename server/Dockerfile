FROM node:20-bullseye-slim

# No system packages required. LibreOffice was previously installed here to
# convert the report DOCX to PDF; the PDF copy was dropped May 2026 (the
# interactive HTML copy replaces it and prints to PDF in one click), so the
# heavy apt install is gone — Docker builds are now substantially faster.

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
