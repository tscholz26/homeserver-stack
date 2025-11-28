FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.29.3-alpine-slim
# Copy dist build to /home: MUST MATCH WITH BASE URL FROM CADDYFILE
COPY --from=build /app/dist /usr/share/nginx/html/home
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
