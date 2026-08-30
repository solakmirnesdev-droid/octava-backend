# Putting Octava on a server

Three things run, and only two of them are processes:

| | what | where |
|---|---|---|
| `octava-api` | this repository, plus the chat socket | `127.0.0.1:4000` |
| `octava-web` | `octava-app`, server-rendered | `127.0.0.1:3000` |
| dashboard | `octava-dashboard`, a static build | `/var/www/octava-dashboard` |

nginx is the only thing listening publicly. Nothing else should bind to a
public address — the two services are bound to loopback on purpose.

## Before anything

```bash
sudo useradd --system --home /srv/octava --shell /usr/sbin/nologin octava
sudo mkdir -p /srv/octava /etc/octava /srv/octava/backups
sudo chown -R octava:octava /srv/octava
```

MongoDB must have authentication switched on. It ships without it, and a
database reachable on the network with no password is the whole catalogue and
every password hash. Confirm with `mongosh` that an anonymous connection is
refused before going further.

## The environment files

```bash
sudo install -m 600 -o root -g root /dev/null /etc/octava/api.env
sudo install -m 600 -o root -g root /dev/null /etc/octava/web.env
```

Fill them from `.env.example` in each repository. `EnvironmentFile=` is read by
systemd before it drops privileges, so the `octava` user never needs to read
these — keep them `600` and owned by root.

Three that cost the most when they are wrong:

- **`NUXT_PUBLIC_SITE_URL`** (web). Left unset, the sitemap falls back to
  `http://localhost:3000` and hands Google thousands of URLs that do not exist.
  Nothing logs an error; the site simply never appears in results.
- **`CORS_ORIGIN`** (api). Must list the real site and dashboard origins. Add
  `capacitor://localhost` and `https://localhost` only if a native build exists.
- **`JWT_SECRET`** (api). Every session is trusted on the strength of it.
  `openssl rand -base64 48`, and never the value from `.env.example`.

## Build and install

```bash
# API
cd /srv/octava/octava-backend && npm ci --omit=dev

# site
cd /srv/octava/octava-app && npm ci && npm run build

# dashboard
cd /srv/octava/octava-dashboard && npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/octava-dashboard/
```

The dashboard is built, not served by node. Rebuild and rsync it on every
release; there is no process to restart.

## The services

```bash
sudo cp deploy/octava-api.service deploy/octava-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now octava-api octava-web
systemctl status octava-api octava-web
```

`ExecStart` uses `/usr/bin/node` deliberately. systemd has no login shell, so an
nvm-managed node is not on its `PATH`, and the failure it produces (`203/EXEC`)
says nothing about why.

## nginx

Copy `nginx.conf.example`, set the two server names, point the TLS paths at real
certificates, and reload. The comments in that file explain the one thing that
is easy to get wrong: the chat's socket needs the connection upgraded, and
without those headers the handshake still succeeds over long-polling — so the
chat appears to work and then stops, reading as a flaky network.

TLS issuance is not covered here; certbot with the nginx plugin is the short
path.

## The first account

Nobody can sign in yet, and the screen that creates accounts needs somebody
signed in to open it. That is what the bootstrap script is for:

```bash
sudo -u octava node scripts/createAdmin.js
```

Every account after that is made from the dashboard, where it is written to the
audit log. This path is not — which is the other reason to use it once only.

## Releasing again

```bash
git pull
npm ci --omit=dev                      # api
sudo systemctl restart octava-api
```

Restarting the API drops every open chat socket; clients reconnect on their own.
Sessions survive — they are tokens, not server state.

## What this does not cover

A firewall (only 80 and 443 should be open), certificate issuance, log
rotation beyond journald's defaults, and off-machine backups. `scripts/backup.js`
writes locally and encrypts with `BACKUP_KEY`; getting that file somewhere else
is still a manual job.
