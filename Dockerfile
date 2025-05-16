FROM node:22-alpine

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

CMD ["npm", "run", "start:api"]