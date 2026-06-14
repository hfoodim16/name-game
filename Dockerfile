# Universal container — works on Railway, Fly.io, Render (Docker), or any host.
FROM node:20-alpine
WORKDIR /app

# Install production deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
# Most hosts inject PORT; default to 3000 locally.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
