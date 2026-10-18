#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_HOST:?Missing DEPLOY_HOST repository variable}"
: "${DEPLOY_KNOWN_HOSTS:?Missing DEPLOY_KNOWN_HOSTS repository variable}"
: "${DEPLOY_SSH_KEY:?Missing DEPLOY_SSH_KEY repository secret}"
install -d -m 700 "$HOME/.ssh"
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$HOME/.ssh/property-deploy"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$HOME/.ssh/property-known-hosts"
cat > "$HOME/.ssh/config" <<CONFIG
Host property-demo
  HostName $DEPLOY_HOST
  User deploy
  IdentityFile ~/.ssh/property-deploy
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/property-known-hosts
  BatchMode yes
  ConnectTimeout 20
CONFIG
