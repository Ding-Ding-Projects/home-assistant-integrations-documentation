FROM nginx:stable-alpine
COPY docs/ /usr/share/nginx/html/
RUN chmod -R a+rX /usr/share/nginx/html
