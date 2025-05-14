FROM php:8.2-cli
WORKDIR /var/www/html
COPY ./api /var/www/html
EXPOSE 3000
CMD ["php", "-S", "0.0.0.0:3000"] 