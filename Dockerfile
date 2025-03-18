FROM node:16-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy server code
COPY server.js ./

# Copy example directory
COPY example ./example

# Create directories for dynamic files
RUN mkdir -p /app/protos /app/config

# Expose gRPC and API ports
EXPOSE 9090 8080

# Set environment variables
ENV PORT=9090
ENV API_PORT=8080
ENV PROTO_DIR=./app/protos
ENV CONFIG_DIR=./app/config

# Start the server
CMD ["node", "server.js"]