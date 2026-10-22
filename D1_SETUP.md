# Cloudflare Worker + D1 + R2 setup

The Express server in `server/` (Docker + SQLite) is unchanged and still works. This is the **alternative** deployment:
a Hono Worker (`worker/src`) using Prisma's D1 adapter, with R2 for uploads and encrypted receipts.
It exposes the same `/api/*` paths plus `GET /uploads/:key`.

```
npm install
npm --prefix server install        # worker re-uses server/src/lib/{permissions,cashlineMatch,cashlineParse}
```

## Deploy

1. `npx wrangler login`
2. Create D1 (or use existing): name `biscuitscrumb` — put `database_id` + `account_id` in `wrangler.toml`
3. `npx wrangler r2 bucket create biscuits-crumb-uploads`
4. `npm run d1:migrate:remote`
5. `npm run d1:seed:remote` — `admin@excelorithm.com` / `admin123` (override with `ADMIN_PASSWORD=...`)
6. `npx wrangler secret put JWT_SECRET` (and optionally `RECEIPT_ENCRYPTION_KEY`)
7. `npm run cf:deploy`

Auth for CLI: `npx wrangler login` **or** set env `CLOUDFLARE_API_TOKEN` (never commit the token).

`CLIENT_ORIGIN` / `COOKIE_SECURE` are plain vars in `wrangler.toml` (`*` reflects the caller's origin, like `CLIENT_ORIGIN=true` on Express).

## Local dev

```
copy .dev.vars.example .dev.vars   # set JWT_SECRET; keep COOKIE_SECURE=false for http://localhost
npm run d1:migrate:local
npm run d1:seed
npm run cf:dev                      # http://127.0.0.1:8787
npx tsx worker/scripts/smoke.ts     # optional end-to-end check (use NODE_OPTIONS=--no-experimental-require-module on Node 20)
```

To run the React app against the Worker, change the two `target`s in `vite.config.ts` from `http://localhost:4000` to `http://127.0.0.1:8787`.
Local D1/R2 state lives in `.wrangler/state` (gitignored).

## What differs from Express

| Area | Worker behaviour |
| --- | --- |
| Uploads | `multer` → `request.formData()` + R2 `uploads/<key>`; served by `GET /uploads/:key`. DB still stores `/uploads/<key>`. |
| Receipts | Same AES-GCM + gzip format, stored privately at R2 `receipts/<token>`; only `/api/payables/receipt/:token` reads them (owner or `payables.view`). Files copied from `data/private/receipts/*.bin` into that prefix stay readable. |
| Cashline | `POST /api/cashline/compare` handles **CSV and .xlsx**. **PDF is not supported** (pdf-parse can't run on Workers → clear 400). `POST /api/cashline/compare-json` takes pre-parsed rows: `{ "fileName"?, "rows": [{ "date", "amount", "description" }] }`. |
| Email | nodemailer needs raw TCP, so with SMTP configured `/api/email/send` records a `failed` email with an explanatory error. With SMTP blank it logs and succeeds (same dev fallback as Express). To send for real, call an HTTP mail API in `worker/src/mailer.ts`. |
| Transactions | D1 has no interactive transactions; Prisma's adapter runs `$transaction` as separate queries. Stock decrement, charge-undo and payment-accept use guarded single-statement updates so they can't double-apply, but a failure *between* statements can leave partial writes. Upgrade path: `env.DB.batch([...])` with raw SQL. |
| Auth cache | 45 s per-isolate cache (as in Express), but cache busting after a role/permission change only reaches the isolate that served the request. |
| Frontend | Not served by the Worker. Host `dist/` on Pages (route `/api/*` and `/uploads/*` to the Worker) or add an `[assets]` binding. |

## Gotchas

- **Workers plan**: `bcryptjs` (cost 10) takes tens of ms of CPU per login/signup — more than the 10 ms Free-plan limit. Use Workers Paid, or lower the cost factor.
- **DateTime format**: Prisma's D1 adapter stores ISO-8601 text (`2026-01-01T00:00:00.000+00:00`), whereas Express/SQLite stores epoch-ms integers. Importing rows from an Express `app.db` into D1 requires converting date columns.
- `server/prisma/schema.prisma` has a second generator (`worker`) writing to `worker/generated/prisma` (gitignored). `npm run cf:generate` builds only that one; the Dockerfile builds only `--generator client`. Prisma 6.19 no longer needs the `driverAdapters` preview flag.
