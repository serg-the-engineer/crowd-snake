#!/bin/sh
set -eu

auth_dir="/etc/nginx/conf.d/auth"
auth_file="/etc/nginx/demo-auth.htpasswd"

mkdir -p "${auth_dir}"
rm -f "${auth_dir}"/*.conf "${auth_file}"

username="${DEMO_BASIC_AUTH_USERNAME:-}"
password="${DEMO_BASIC_AUTH_PASSWORD:-}"
realm="${DEMO_BASIC_AUTH_REALM:-crowd-snake-demo}"

if [ -z "${username}" ] && [ -z "${password}" ]; then
    exit 0
fi

: "${username:?DEMO_BASIC_AUTH_USERNAME must be set when basic auth is enabled}"
: "${password:?DEMO_BASIC_AUTH_PASSWORD must be set when basic auth is enabled}"

htpasswd -bc "${auth_file}" "${username}" "${password}"

cat <<EOF > "${auth_dir}/basic-auth.conf"
auth_basic "${realm}";
auth_basic_user_file ${auth_file};
EOF
