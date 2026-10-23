# BiscuitsCrumb / Excelorithm Vending

React UI + Express/Prisma API. Runs like **TeamTask**: one process, one URL.

## Local (same as TeamTask `start-web.cmd`)

Double-click or run:

```bat
start-web.cmd
```

Open **http://localhost:4000**

- Admin: `admin@excelorithm.com` / `admin123`

That builds the UI, starts the API, and serves both together (no Vite proxy, no second terminal).

### Dev mode (hot reload UI — optional)

```bat
npm run setup:server
npm run dev:server
```

Second terminal:

```bat
npm run dev
```

UI: http://localhost:5173 → proxies API to :4000

## Server (Docker — same idea as TeamTask)

```bash
git clone https://github.com/imrankhokhar/biscuitsCrumb.git
cd biscuitsCrumb
cp .env.docker.example .env
# set JWT_SECRET and CLIENT_ORIGIN=http://YOUR_SERVER_IP:8080
docker compose up -d --build
```

Open `http://YOUR_SERVER_IP:8080` — UI + API + SQLite on a Docker volume.

## Database note

| Mode | Database |
|------|----------|
| Local `start-web.cmd` | SQLite `server/prisma/dev.db` (via `DATABASE_URL`) |
| Docker server | SQLite file in volume `excelorithm_d1` |
| Cloudflare D1 Worker | Optional advanced path — see `D1_SETUP.md` (not required for TeamTask-style run) |

TeamTask can use D1 over HTTP from Node because it has a custom DB layer. This app uses **Prisma + SQLite** for the simple local/server path (same UX, solid on a VPS).
