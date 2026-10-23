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

## Database (auto-pick like TeamTask)

| When | Database |
|------|----------|
| Local `start-web.cmd` | **SQLite** (`FORCE_SQLITE=1`) |
| Server without D1 env | **SQLite** in Docker volume |
| Server with D1 env + `FORCE_SQLITE=0` | **Cloudflare D1** over HTTP (Prisma adapter) |

**Live D1** — in server `.env` / Docker `.env`:

```env
FORCE_SQLITE=0
CLOUDFLARE_ACCOUNT_ID=c572f097e1a07b2c249efa2921ec98b6
CLOUDFLARE_D1_DATABASE_ID=1f6ca043-2eef-415f-9f0c-16bec2161cd9
CLOUDFLARE_API_TOKEN=your_token
DATABASE_URL=file:/data/db/unused-placeholder.db
```

Apply schema once from a machine with Wrangler: `npm run d1:migrate:remote`  
Then seed against D1: `FORCE_SQLITE=0` + those vars → `npm --prefix server run db:seed`
