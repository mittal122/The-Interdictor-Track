# ──────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for The Interdictor Track
# Stage 1: Build frontend (Vite) and compile TypeScript
# Stage 2: Runtime — lean production image
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for cache efficiency
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built frontend and server-side code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src/services ./src/services
COPY --from=builder /app/src/utils ./src/utils
COPY --from=builder /app/src/schemas ./src/schemas

# Environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "--import", "tsx", "server.ts"]
