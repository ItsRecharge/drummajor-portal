#!/usr/bin/env bash
#
# update-and-run.sh — pull latest, rebuild if changed, then run the server.
#
# Invoked by drummajor-portal.service as ExecStart. On every (re)start it:
#   1. Fetches the remote and checks whether the local branch is behind.
#   2. If behind: pulls, installs deps, applies DB migrations, rebuilds.
#   3. Execs `next start` (replaces this shell so systemd tracks the node PID).
#
# Safe to run by hand too:  ./deploy/update-and-run.sh
set -euo pipefail

APP_DIR="/home/musicserver/drummajor-portal"
PORT="${PORT:-3002}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "[update] fetching origin/$BRANCH ..."
git fetch --quiet origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[update] new changes ($LOCAL -> $REMOTE), updating ..."
  git pull --ff-only origin "$BRANCH"

  echo "[update] installing dependencies ..."
  npm ci

  echo "[update] applying database migrations ..."
  npx prisma migrate deploy

  echo "[update] building ..."
  npm run build
else
  echo "[update] already up to date ($LOCAL); skipping rebuild."
fi

echo "[update] starting server on port $PORT ..."
exec node node_modules/.bin/next start -p "$PORT"
