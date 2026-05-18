import { query } from "@/lib/db";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

let schemaReady: Promise<void> | null = null;

function ensureUsersSchema() {
  schemaReady ??= (async () => {
    await query("create extension if not exists pgcrypto");
    await query(`
      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
  })();

  return schemaReady;
}

export async function findUserPasswordHash(email: string) {
  await ensureUsersSchema();

  const [user] = await query<UserRow>(
    `
      select email, password_hash
      from users
      where email = $1
      limit 1
    `,
    [email],
  );

  return user?.password_hash ?? null;
}

export async function findUserByEmail(email: string) {
  await ensureUsersSchema();

  const [user] = await query<UserRow>(
    `
      select id, email, password_hash
      from users
      where email = $1
      limit 1
    `,
    [email],
  );

  return user ?? null;
}

export async function createUser(email: string, passwordHash: string) {
  await ensureUsersSchema();

  const [user] = await query<{ id: string; email: string }>(
    `
      insert into users (email, password_hash)
      values ($1, $2)
      on conflict (email) do nothing
      returning id, email
    `,
    [email, passwordHash],
  );

  return user ?? null;
}
