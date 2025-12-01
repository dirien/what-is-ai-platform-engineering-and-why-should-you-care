# syntax=docker/dockerfile:1
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for root and workspaces
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install ALL dependencies (including dev deps for build) with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install && \
    cd frontend && npm install && \
    cd ../backend && npm install

# Copy application source
COPY backend ./backend
COPY frontend ./frontend

# Build the React frontend
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install ONLY production dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    cd backend && npm install --production

# Copy built application from builder
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "backend/server.js"]
