FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8080

CMD ["sh", "-c", "npm start || npm run dev"]

