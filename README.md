# image-stripper

Batch-clean selected image regions with AI. Users can upload an image, select
sections, pay through Polar, then generate outputs.

Fast tools mode bypasses AI and payment for simple Sharp transforms:

- Resize selected regions.
- Remove solid-ish edge backgrounds with deterministic transparency.
- Export selected regions as embedded-image SVG files.

## Local Setup

```bash
cp .env.example .env.local
docker compose up -d postgres
pnpm dev
```

Open `http://localhost:3000`.

## Polar

Create a one-time Polar product for the credit pack and copy its product ID into
`POLAR_PRODUCT_ID`. Keep `POLAR_SERVER=sandbox` until test checkout succeeds.

Required env:

```bash
POLAR_ACCESS_TOKEN=
POLAR_PRODUCT_ID=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Set `PAYMENT_REQUIRED=false` only when testing generation locally without Polar.

## Persistence

`db/schema.sql` defines the durable job and output records. Local Postgres is
bootstrapped by `Dockerfile.postgres` through `docker-compose.yml`.

Vercel production should use:

```bash
POSTGRES_URL=
BLOB_READ_WRITE_TOKEN=
```

The current app saves draft jobs locally before checkout so external payment
redirects can restore the in-progress image in the same browser session. The
schema is ready for server-side job recovery by email once the Postgres/Blob
runtime adapter is connected.
