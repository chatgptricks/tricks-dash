FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY core.mjs server.mjs ./
USER node
ENV SENTIENT_MCP_HOST=0.0.0.0 PORT=3100
EXPOSE 3100
CMD ["node", "server.mjs", "--http"]
