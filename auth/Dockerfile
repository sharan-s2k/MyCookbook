FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript (for production image)
RUN npm run build || true

# Expose port
EXPOSE 8001

# Run migrations and start server
# Note: In dev with bind mounts, dist/ may not exist, so we use tsx directly
CMD ["sh", "-c", "npm run migrate && ([ -f dist/index.js ] && npm start || npm run dev)"]

