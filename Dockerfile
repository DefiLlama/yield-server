FROM node:22-alpine AS base
# Install crond and other dependencies
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install

FROM base AS migrations

COPY migrations ./migrations

CMD ["npm", "run", "migrate", "up"]

FROM base AS api

COPY . .

CMD ["npm", "run", "start:api"]