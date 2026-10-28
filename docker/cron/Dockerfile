FROM alpine:3.21

RUN apk add --no-cache curl

# supercronic — cron daemon with proper env var support and structured logging.
#
# The architecture is taken from the build rather than hardcoded. This read
# `supercronic-linux-amd64` with a comment to change it by hand for Graviton, and the hosts
# these images are built for are Graviton — so the first deploy would have pulled a binary
# the machine cannot execute, and every scheduled job would have failed at container start.
# `TARGETARCH` is supplied by buildx and already spells the values supercronic publishes
# under (`amd64`, `arm64`).
ARG TARGETARCH
ENV SUPERCRONIC_VERSION=0.2.29
RUN wget -q -O /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH}" \
    && chmod +x /usr/local/bin/supercronic

COPY crontab /app/crontab
# Strip Windows CRLF line endings so supercronic can exec commands correctly
RUN sed -i 's/\r$//' /app/crontab

CMD ["supercronic", "/app/crontab"]
