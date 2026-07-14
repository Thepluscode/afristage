FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
RUN npm install

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/admin-web ./apps/admin-web
COPY package*.json ./
WORKDIR /app/apps/admin-web
RUN npm run build
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["npm", "run", "start"]
