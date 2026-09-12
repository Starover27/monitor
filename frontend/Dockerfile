# --- Стадия 1: Сборка фронтенда ---
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package.json package-lock.json* ./
RUN npm ci

# Копируем исходники и собираем production build
COPY . .
RUN npm run build

# --- Стадия 2: Nginx для раздачи статики ---
FROM nginx:alpine

# Копируем собранные файлы из builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Конфигурация Nginx с проксированием API на бэкенд
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
