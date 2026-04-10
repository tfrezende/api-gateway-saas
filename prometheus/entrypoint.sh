#!/bin/sh
set -e

mkdir -p /etc/prometheus/secrets
echo -n "$METRICS_API_KEY" > /etc/prometheus/secrets/metrics-api-key

exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --web.console.libraries=/usr/share/prometheus/console_libraries \
  --web.console.templates=/usr/share/prometheus/consoles