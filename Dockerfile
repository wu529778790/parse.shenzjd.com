FROM php:8.2-cli

WORKDIR /var/www/html/api

COPY ./api /var/www/html/api

EXPOSE 8080

CMD ["php", "-S", "0.0.0.0:8080"] 