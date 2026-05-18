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

Create the products in Polar, attach the same Credits benefit/meter to the
credit-based plans, then copy each product ID into the matching env var:

- Starter: one-time, `$9`, 20 credits.
- Pro: one-time, `$19`, 60 credits.
- Studio: one-time, `$49`, 200 credits.
- Monthly: subscription, `$39/mo`, unlimited usage.
- Lifetime: one-time, `$999`, lifetime access. Add a custom benefit and set
  `POLAR_LIFETIME_BENEFIT_ID`, or set benefit metadata to `plan=lifetime`.

For credits-only spending, do not add a metered price to the products. Use a
Credits benefit against the `image_generation` meter, and set
`POLAR_CREDIT_METER_ID` so the app can check balances before AI generation.
The app records usage by ingesting `image_generation` events with a `credits`
metadata value.

Set the Polar webhook endpoint to:

```text
https://image-stripper.vercel.app/api/webhook/polar
```

`/webhook` and `/webhook/polar` also accept the same POST payload, but the API
route above is the canonical URL. The site root should not be used for webhooks.
Keep `POLAR_SERVER=sandbox` until test checkout succeeds.

Required env:

```bash
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_STARTER_PRODUCT_ID=
POLAR_PRO_PRODUCT_ID=
POLAR_STUDIO_PRODUCT_ID=
POLAR_MONTHLY_PRODUCT_ID=
POLAR_LIFETIME_PRODUCT_ID=
POLAR_CREDIT_METER_ID=
POLAR_LIFETIME_BENEFIT_ID=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Set `PAYMENT_REQUIRED=false` only when testing generation locally without Polar.

## Accounts

The owner email `lois@sf-voice.sh` can sign in without a password.

Public sign-up creates password accounts server-side. In production, set
`POSTGRES_URL` and `AUTH_SESSION_SECRET`; accounts are stored in the `users`
table. Locally, use the Docker Postgres connection from `.env.example`:

```bash
AUTH_SESSION_SECRET=
POSTGRES_URL=postgres://image_stripper:image_stripper@localhost:5432/image_stripper
```

Existing manually provisioned accounts still work through `AUTH_USERS_JSON`:

```bash
AUTH_USERS_JSON='{"user@example.com":"scrypt:salt:hexhash"}'
```

Do not use a SQLite file in Vercel Blob as the writable auth database. Blob is
object storage, not a shared filesystem with SQLite locking semantics.

## Persistence

`db/schema.sql` defines the durable job and output records. Local Postgres is
bootstrapped by `Dockerfile.postgres` through `docker-compose.yml`.

Vercel production should use the Neon connection string injected by the Vercel
integration:

```bash
POSTGRES_URL=
BLOB_READ_WRITE_TOKEN=
VERCEL_BLOB_ACCESS=private
```

The current app saves draft jobs locally before checkout so external payment
redirects can restore the in-progress image in the same browser session.

Signed-in browser sessions autosave the source image, selected regions, settings,
and generated outputs into IndexedDB, Vercel Blob, and Postgres metadata rows.
Blob writes go through `/api/storage/vercel/save`, so `BLOB_READ_WRITE_TOKEN`
stays server-side.

Every uploaded file is stored under this folder key:

```text
image-stripper/<user-id>/<job-id>/<timestamp>-source.<ext>
image-stripper/<user-id>/<job-id>/<timestamp>-output-<n>-<name>.<ext>
```

`<user-id>` is the signed-in email sanitized for a Blob pathname. Vercel Blob
does not expose arbitrary custom object metadata through the current upload
surface, so each image also gets a sibling `*.metadata.json` blob containing
`uploadedAt`, `userId`, `folderKey`, `jobId`, role, content type, and Blob URL.
A job-level `<timestamp>-job.metadata.json` manifest stores selections,
settings, payment state, source metadata, and output metadata paths.
