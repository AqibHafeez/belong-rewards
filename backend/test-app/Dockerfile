FROM node:20-alpine

WORKDIR /app

# Required for entrypoint and health/wait tooling
RUN apk add --no-cache bash

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
