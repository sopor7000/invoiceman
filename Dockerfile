FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
RUN cd frontend && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ backend/
COPY --from=build /app/frontend/dist frontend/dist
WORKDIR /app/backend
EXPOSE 4001
CMD ["node", "src/server.js"]