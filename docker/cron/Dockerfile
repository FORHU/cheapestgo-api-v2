FROM alpine:3.21

RUN apk add --no-cache curl

# supercronic — cron daemon with proper env var support and structured logging.
# Change to supercronic-linux-arm64 if running on Graviton (arm64) EC2.
ENV SUPERCRONIC_VERSION=0.2.33
RUN wget -q -O /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic

COPY crontab /app/crontab
# Strip Windows CRLF line endings so supercronic can exec commands correctly
RUN sed -i 's/\r$//' /app/crontab

CMD ["supercronic", "/app/crontab"]
