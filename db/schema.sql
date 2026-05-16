create extension if not exists pgcrypto;

create table if not exists jobs (
  id text primary key,
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
);

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
);

create index if not exists jobs_email_created_at_idx
  on jobs (email, created_at desc)
  where email is not null;

create index if not exists jobs_polar_checkout_id_idx
  on jobs (polar_checkout_id)
  where polar_checkout_id is not null;

create index if not exists job_outputs_job_id_idx
  on job_outputs (job_id);
