# Drum Major Portal

A secure, invite-only web portal for band drum majors — a "band leadership
operating system" covering announcements (via the band's Gmail), a Google
Drive-backed music library, planning (events/tasks/sticky-note board), and
leadership knowledge retention.

See [`docs/plan.md`](docs/plan.md) for the full build plan and staged roadmap.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind** + shadcn/ui
- **PostgreSQL** + **Prisma 7** (pg driver adapter)
- **Auth.js** (credentials + DB sessions) — invite-only, school-email allowlist
- **Nodemailer → Gmail SMTP** for announcements/verification/reset email
- **Google Drive** (service account) for music + document storage
- Secrets (SMTP app password, Drive JSON) **encrypted at rest** (AES-256-GCM)
- Self-hosted as a native **systemd** service behind **Caddy** (no Docker)

## Local development

Requires **Node 22** (`nvm use` reads `.nvmrc`) and a local PostgreSQL.

```bash
nvm use                       # Node 22
npm install
cp .env.example .env          # fill in DATABASE_URL, APP_ENCRYPTION_KEY, AUTH_SECRET
npx prisma migrate dev        # create/apply migrations against your local DB
npm run dev                   # http://localhost:3000
```

Generate the required secrets:

```bash
openssl rand -base64 48   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # AUTH_SECRET
```

## Deployment

See [`deploy/README.md`](deploy/README.md) for the native systemd + Postgres +
Caddy setup on the music-department server.

## Project layout

```
prisma/schema.prisma     core data model
src/lib/prisma.ts        Prisma client singleton (pg adapter)
src/lib/crypto.ts        AES-256-GCM secret encryption helpers
deploy/                  systemd unit, Caddyfile, deploy guide
docs/plan.md             full build plan + living status log
```
