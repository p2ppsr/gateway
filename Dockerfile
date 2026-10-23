FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
RUN test "$(node --version)" = "v22.23.4"

# Install nginx
RUN apk add --no-cache nginx python3 make g++ && \
    chown -R nginx:www-data /var/lib/nginx

COPY ./nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
WORKDIR /app
COPY . .
RUN npm ci --legacy-peer-deps && npm run build
CMD [ "node", "src/server.js"]
