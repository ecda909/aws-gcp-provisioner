FROM node:18-alpine

WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema
COPY src/db/prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Add necessary tools for health checks and waiting for dependencies
RUN apk add --no-cache bash wget curl

# Command to run the application
CMD ["npm", "start"]
