FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install

FROM node:20-alpine AS runner
# openssl so Prisma detects v3 and loads the musl-openssl-3.0.x query engine.
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY package*.json ./
WORKDIR /app/apps/api
RUN npm run prisma:generate
RUN npm run build
EXPOSE 3000
# Liveness probe: process up + serving. start-period covers Nest boot.
HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["npm", "run", "start"]
