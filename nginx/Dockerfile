FROM nginx:1.27.5-alpine

RUN apk add --no-cache apache2-utils

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/40-configure-basic-auth.sh /docker-entrypoint.d/40-configure-basic-auth.sh
COPY site/index.html /usr/share/nginx/html/index.html
COPY site/styles.css /usr/share/nginx/html/styles.css
COPY site/app.js /usr/share/nginx/html/app.js

RUN chmod +x /docker-entrypoint.d/40-configure-basic-auth.sh

EXPOSE 8081
