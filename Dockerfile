FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=4800 ABS_DATA=/data NODE_OPTIONS=--no-warnings
VOLUME ["/data"]
EXPOSE 4800
CMD ["node", "server.js"]
