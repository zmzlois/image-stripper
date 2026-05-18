import { hasDatabaseUrl, query } from "@/lib/db";

type SavedOutput = {
  selectionId: string;
  name: string;
  prompt?: string;
  model?: string;
  blobUrl?: string;
  mediaType?: string;
  extension?: string;
  width?: number;
  height?: number;
  error?: string;
};

type SavedJob = {
  id: string;
  userId?: string;
  email: string;
  sourceName: string;
  sourceBlobUrl?: string;
  settings: unknown;
  selections: unknown;
  polarCheckoutId?: string;
  polarStatus?: string;
  outputs: SavedOutput[];
};

let schemaReady: Promise<void> | null = null;

function ensureJobsSchema() {
  schemaReady ??= (async () => {
    await query("create extension if not exists pgcrypto");
    await query(`
      create table if not exists jobs (
        id text primary key,
        user_id uuid references users(id) on delete set null,
        email text,
        source_name text not null,
        source_blob_url text,
        settings jsonb not null,
        selections jsonb not null,
        status text not null default 'draft',
        polar_checkout_id text,
        polar_status text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await query("alter table jobs add column if not exists user_id uuid");
    await query(`
      create index if not exists jobs_user_id_created_at_idx
      on jobs (user_id, created_at desc)
      where user_id is not null
    `);
    await query(`
      create table if not exists job_outputs (
        id uuid primary key default gen_random_uuid(),
        job_id text not null references jobs(id) on delete cascade,
        selection_id text not null,
        name text not null,
        prompt text,
        model text,
        blob_url text,
        media_type text,
        extension text,
        width integer,
        height integer,
        error text,
        created_at timestamptz not null default now()
      )
    `);
    await query(`
      create index if not exists jobs_email_created_at_idx
      on jobs (email, created_at desc)
      where email is not null
    `);
    await query(`
      create index if not exists job_outputs_job_id_idx
      on job_outputs (job_id)
    `);
  })();

  return schemaReady;
}

export async function saveJobToDatabase(job: SavedJob) {
  if (!hasDatabaseUrl()) {
    return false;
  }

  await ensureJobsSchema();
  await query(
    `
      insert into jobs (
        id,
        user_id,
        email,
        source_name,
        source_blob_url,
        settings,
        selections,
        status,
        polar_checkout_id,
        polar_status,
        updated_at
      )
      values ($1, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, 'saved', $8, $9, now())
      on conflict (id) do update set
        user_id = excluded.user_id,
        email = excluded.email,
        source_name = excluded.source_name,
        source_blob_url = excluded.source_blob_url,
        settings = excluded.settings,
        selections = excluded.selections,
        status = excluded.status,
        polar_checkout_id = excluded.polar_checkout_id,
        polar_status = excluded.polar_status,
        updated_at = now()
    `,
    [
      job.id,
      job.userId ?? null,
      job.email,
      job.sourceName,
      job.sourceBlobUrl ?? null,
      JSON.stringify(job.settings),
      JSON.stringify(job.selections),
      job.polarCheckoutId ?? null,
      job.polarStatus ?? null,
    ],
  );
  await query("delete from job_outputs where job_id = $1", [job.id]);

  for (const output of job.outputs) {
    await query(
      `
        insert into job_outputs (
          job_id,
          selection_id,
          name,
          prompt,
          model,
          blob_url,
          media_type,
          extension,
          width,
          height,
          error
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        job.id,
        output.selectionId,
        output.name,
        output.prompt ?? null,
        output.model ?? null,
        output.blobUrl ?? null,
        output.mediaType ?? null,
        output.extension ?? null,
        output.width ?? null,
        output.height ?? null,
        output.error ?? null,
      ],
    );
  }

  return true;
}
