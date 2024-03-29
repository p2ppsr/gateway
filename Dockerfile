FROM node:20-alpine

# Install nginx
RUN echo "http://dl-4.alpinelinux.org/alpine/v3.3/main" >> /etc/apk/repositories && \
    apk add --no-cache --update nginx && \
    chown -R nginx:www-data /var/lib/nginx

COPY ./nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
WORKDIR /app
COPY . .
RUN npm i knex -g && \
    npm run build
CMD [ "node", "src/server.js"]