FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN mkdir -p /app/data /app/workspaces
ENV NODE_ENV=production
ENV PORT=7410
EXPOSE 7410
CMD ["npm","run","prod"]
