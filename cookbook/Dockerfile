FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8006

CMD ["sh", "-c", "npm run migrate && ([ -f dist/index.js ] && npm start || npm run dev)"]
