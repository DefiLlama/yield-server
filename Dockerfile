FROM node:22-alpine AS base
# Install crond and other dependencies
RUN apk add --no-cache python3 make g++

FROM base AS builder

WORKDIR /compile

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install

FROM builder AS migrations

COPY migrations ./migrations

CMD ["npm", "run", "migrate", "up"]

FROM node:22-alpine AS api

WORKDIR /app

COPY --from=builder /compile/node_modules /app/node_modules
COPY --from=builder /compile/package.json /app/package.json

COPY . .

CMD ["npm", "run", "start:api"]