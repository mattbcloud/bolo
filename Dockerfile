FROM node:18

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and assets
COPY . .

# Build the application
RUN npm run build

# Expose port (Railway will override with PORT env var)
EXPOSE 8124

# Start the server
CMD ["npm", "start"]
