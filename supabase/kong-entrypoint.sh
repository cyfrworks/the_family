#!/bin/sh
# Render kong.yml template with environment variables
sed \
  -e "s|\${ANON_KEY}|${ANON_KEY}|g" \
  -e "s|\${SERVICE_ROLE_KEY}|${SERVICE_ROLE_KEY}|g" \
  -e "s|\${DASHBOARD_USERNAME}|${DASHBOARD_USERNAME}|g" \
  -e "s|\${DASHBOARD_PASSWORD}|${DASHBOARD_PASSWORD}|g" \
  /var/lib/kong/kong.yml.tpl > /tmp/kong.yml

exec /docker-entrypoint.sh kong docker-start
