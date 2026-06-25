# Deploying the Drum Major Portal (native, no Docker)

Target: a music-department server running the app as a systemd service, with
PostgreSQL and Caddy installed natively on the same box.

## Prerequisites on the server

1. **Node 22 LTS** (the current tooling requires Node ≥ 20.19; we standardize on
   22). Install via your distro or nvm. Confirm with `node --version`.
2. **PostgreSQL 15+**:
   ```bash
   sudo apt install postgresql
   sudo -u postgres psql -c "CREATE ROLE portal LOGIN PASSWORD 'STRONG_PASSWORD';"
   sudo -u postgres psql -c "CREATE DATABASE drummajor_portal OWNER portal;"
   ```
3. **Caddy** (for automatic HTTPS): https://caddyserver.com/docs/install

## Application setup

```bash
sudo mkdir -p /opt/drummajor-portal
# clone or copy the repo into /opt/drummajor-portal, owned by the `portal` user
sudo useradd --system --home /opt/drummajor-portal portal   # if not present
cd /opt/drummajor-portal
npm ci
npx prisma migrate deploy        # apply migrations
npm run build
```

## Secrets / environment

```bash
sudo mkdir -p /etc/drummajor-portal
sudo cp .env.example /etc/drummajor-portal/portal.env
sudo $EDITOR /etc/drummajor-portal/portal.env     # fill in real values
sudo chown root:portal /etc/drummajor-portal/portal.env
sudo chmod 640 /etc/drummajor-portal/portal.env
```

Generate keys:
```bash
openssl rand -base64 48   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # AUTH_SECRET
```

## systemd

```bash
sudo cp deploy/drummajor-portal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now drummajor-portal
systemctl status drummajor-portal
```

## Caddy / domain

Point the domain's DNS A record at the server, then:
```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
sudo systemctl reload caddy
```

Visit `https://<your-domain>` — the first-run setup wizard appears (Stage 1).

## Backups (Stage 0 ops note)

Nightly `pg_dump` via a systemd timer; the actual music/document files live in
Google Drive. Rotating `APP_ENCRYPTION_KEY` requires re-encrypting stored
secrets — document and script this before rotating.
