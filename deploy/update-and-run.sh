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

needs_build=0

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[update] new changes ($LOCAL -> $REMOTE), updating ..."
  git pull --ff-only origin "$BRANCH"
  needs_build=1
fi

# Fresh clone (already at origin/main) or wiped artifacts: deps/build never ran.
if [ ! -x node_modules/.bin/next ] || [ ! -d .next ]; then
  echo "[update] missing node_modules/.next; forcing first build ..."
  needs_build=1
fi

if [ "$needs_build" -eq 1 ]; then
  echo "[update] installing dependencies ..."
  # --include=dev: portal.env sets NODE_ENV=production, which would otherwise make
  # `npm ci` skip devDependencies (tailwindcss, @tailwindcss/postcss, prisma, etc.)
  # that the build needs. Runtime still honors NODE_ENV for `next start`.
  npm ci --include=dev

  echo "[update] generating Prisma client ..."
  # The generated client (src/generated/prisma) is gitignored, so it must be built
  # here. `prisma migrate deploy` does NOT generate it.
  npx prisma generate

  echo "[update] applying database migrations ..."
  npx prisma migrate deploy

  echo "[update] building ..."
  npm run build
else
  echo "[update] already up to date ($LOCAL) and built; skipping rebuild."
fi

echo "[update] starting server on port $PORT ..."
exec node node_modules/.bin/next start -p "$PORT"
