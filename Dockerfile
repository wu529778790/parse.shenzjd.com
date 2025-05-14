FROM php:8.2-cli
WORKDIR /var/www/html
COPY ./api /var/www/html
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080"] 