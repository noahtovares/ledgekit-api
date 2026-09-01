# LedgeKit API

LedgeKit API is a small Hono API running as a Vercel Function. It accepts
complete v1 trace envelopes, authenticates per-app ingest keys, and stores the
envelopes in a dedicated Supabase PostgreSQL project:

```text
POST /v1/traces -> Vercel Function -> Supabase PostgREST RPC -> PostgreSQL
```

`GET /health` reports process health without querying Supabase. Hono owns only
routing, request IDs, security headers, and top-level errors; ingestion and
storage remain framework-independent.

`GET /` returns a minimal service identifier for people opening the deployment
URL in a browser.

The application limit is exactly 4 MiB (4,194,304 bytes), leaving headroom
below Vercel Functions' 4.5 MB platform limit. The SDK enforces the same limit
before networking.

## Prerequisites

- Node.js 20 or newer
- A dedicated Supabase project
- Supabase CLI
- Vercel CLI or a connected Vercel project

Use a dedicated Supabase project because the Vercel function uses a server-only
Supabase secret key. The tables live in the unexposed `ledge_private` schema,
have RLS enabled, and revoke direct access from API roles. The secret key never
belongs in a mobile app, browser, repository, or URL.

## Local setup

```sh
npm install
supabase start
supabase db reset
cp .env.example .env.local
vercel dev
```

Configure these Vercel variables:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

`DATABASE_URL` is only for operator scripts and must not be configured in
Vercel.

## Deploy database and API

```sh
supabase link --project-ref <project-ref>
supabase db push
vercel deploy
```

Point `api.ledgekit.com` at the Vercel project after the development smoke test
passes.

## Onboard an app

```sh
DATABASE_URL=... npm run create-app -- \
  --service sample-app

DATABASE_URL=... npm run create-key -- \
  --app-id <app-uuid> \
  --mode test \
  --name local-development
```

`create-key` prints the complete ingest key exactly once. Store it immediately
in the application's secret configuration. Keys begin with `lk_live_` or
`lk_test_`; the mode is a visible safety marker, while `name` is free-form
operator metadata such as `production-2026-09`.

Every trace stores the internal ID of the key that first committed it. Raw
tokens and secret digests are never copied into trace rows. Revoke keys instead
of deleting them so this audit link remains intact.

Run a sanitized end-to-end request:

```sh
LEDGE_INGEST_KEY=... npm run smoke-test -- \
  --endpoint https://api.ledgekit.com/v1/traces
```

Rotate a key by creating and verifying a replacement before revoking the old
prefix:

```sh
DATABASE_URL=... npm run revoke-key -- --key-prefix lk_test_abcdefghijkl
```

## Retention

Schedule this daily with Supabase Cron after migrations are applied:

```sql
select cron.schedule(
  'ledgekit-daily-retention',
  '15 3 * * *',
  'select ledge_private.delete_expired_traces()'
);
```

Operators can delete a specific trace with:

```sql
select ledge_private.delete_trace(
  '<app-id>',
  '<trace-id>'
);
```

## Verification

```sh
npm run check:contract
npm run typecheck
npm test
```

Logs contain identifiers, status, latency, and coarse error codes only. Never
log request bodies, tokens, token digests, trace errors, prompts, or outputs.
