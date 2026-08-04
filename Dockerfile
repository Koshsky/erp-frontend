# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app

# Базовый URL API, подставляется при сборке (vite встраивает VITE_* на этапе build)
ARG VITE_API_BASE=/api/v1
ENV VITE_API_BASE=$VITE_API_BASE
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve via nginx
FROM nginx:1.25-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80


