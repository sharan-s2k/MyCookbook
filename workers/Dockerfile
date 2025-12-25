FROM node:18-alpine

# Install ffmpeg, python3 (for yt-dlp script), and curl
RUN apk add --no-cache ffmpeg ca-certificates curl python3 && \
    # Download yt-dlp Python script from GitHub releases (it's a standalone Python script, not a binary)
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    yt-dlp --version

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build || true

EXPOSE 8005

CMD ["sh", "-c", "npm start || npm run dev"]
