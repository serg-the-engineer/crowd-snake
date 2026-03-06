#!/usr/bin/env bash
set -euo pipefail

domain="${1:?usage: bootstrap-host.sh <domain> [web-port] [app-dir]}"
web_port="${2:-18081}"
app_dir="${3:-${HOME}/apps/crowd-snake}"

sudo apt-get update
sudo apt-get install -y caddy

sudo install -d -m 755 /etc/caddy/sites

tmp_site_config="$(mktemp)"
cat <<EOF > "${tmp_site_config}"
${domain} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:${web_port}
}
EOF

sudo install -m 644 "${tmp_site_config}" /etc/caddy/sites/crowd-snake.caddy
rm -f "${tmp_site_config}"

if ! sudo grep -q '^import /etc/caddy/sites/\*\.caddy$' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/sites/*.caddy\n' | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi

mkdir -p "${app_dir}"

sudo systemctl enable --now caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
