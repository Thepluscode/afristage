FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY package*.json ./
WORKDIR /app/apps/web
RUN npm run build
EXPOSE 3002
# Railway injects $PORT and probes it; bind it (fall back to 3002 locally).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3002}/api/health" || exit 1
CMD ["npm", "run", "start"]
