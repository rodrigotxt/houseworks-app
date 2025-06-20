FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV NODE_ENV=development

EXPOSE 3000 9229

CMD ["./node_modules/.bin/nodemon", "--inspect=0.0.0.0:9229", "server.js"]