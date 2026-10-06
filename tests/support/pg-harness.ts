import fs from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase", "migrations");

/**
 * Minimal stand-ins for the parts of Supabase that migrations rely on: the auth
 * schema, the API roles, and auth.uid()/auth.jwt(). Default privileges mirror
 * Supabase, which grants new public objects to the API roles.
 */
const SUPABASE_STUBS = `
  create schema if not exists auth;
  create schema if not exists extensions;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable
    as $$ select jsonb_build_object('email', '') $$;
  create or replace function auth.role() returns text language sql stable
    as $$ select 'authenticated' $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type MigratedDb = PGlite;

/** Applies every migration, in filename order, to a fresh PostgreSQL instance. */
export async function createMigratedDb(): Promise<MigratedDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`);
    }
  }

  return db;
}

/**
 * Runs a callback as an authenticated Supabase user so RLS policies apply, then
 * restores the superuser session.
 */
export async function asUser<T>(
  db: MigratedDb,
  userId: string,
  callback: () => Promise<T>,
): Promise<T> {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  try {
    return await callback();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

export type SeededWorkspace = {
  agencyId: string;
  clientId: string;
  adminId: string;
  plannerId: string;
  drafterId: string;
};

type IdRow = { id: string };

async function insertId(db: MigratedDb, sql: string, params: unknown[]): Promise<string> {
  const result = await db.query<IdRow>(sql, params);
  return result.rows[0].id;
}

/**
 * One agency, one account, and three accepted members: a client_admin, a
 * client_user holding only ideas_manage, and a client_user holding only
 * posts_draft.
 */
export async function seedWorkspace(db: MigratedDb, label: string): Promise<SeededWorkspace> {
  const agencyId = await insertId(
    db,
    "insert into public.agencies (name) values ($1) returning id",
    [`${label} agency`],
  );
  const clientId = await insertId(
    db,
    "insert into public.clients (agency_id, name) values ($1, $2) returning id",
    [agencyId, `${label} account`],
  );

  const adminId = await insertId(
    db,
    "insert into auth.users (email) values ($1) returning id",
    [`${label}-admin@example.test`],
  );
  const plannerId = await insertId(
    db,
    "insert into auth.users (email) values ($1) returning id",
    [`${label}-planner@example.test`],
  );
  const drafterId = await insertId(
    db,
    "insert into auth.users (email) values ($1) returning id",
    [`${label}-drafter@example.test`],
  );

  await db.query(
    `insert into public.client_access (client_id, user_id, role, invitation_status, permissions)
     values ($1, $2, 'client_admin', 'accepted', '{}'),
            ($1, $3, 'client_user', 'accepted', array['ideas_manage']),
            ($1, $4, 'client_user', 'accepted', array['posts_draft'])`,
    [clientId, adminId, plannerId, drafterId],
  );

  return { agencyId, clientId, adminId, plannerId, drafterId };
}

export async function seedExperience(
  db: MigratedDb,
  clientId: string,
  title: string,
  options: { allowReuse?: boolean; readiness?: string } = {},
): Promise<string> {
  return insertId(
    db,
    `insert into public.founder_experiences (client_id, title, allow_reuse, readiness)
     values ($1, $2, $3, $4) returning id`,
    [clientId, title, options.allowReuse ?? false, options.readiness ?? "ready"],
  );
}

export async function seedResource(
  db: MigratedDb,
  clientId: string,
  title: string,
  options: { allowReuse?: boolean } = {},
): Promise<string> {
  return insertId(
    db,
    `insert into public.content_resources
       (client_id, title, resource_type, keyword, delivery_instructions, allow_reuse, readiness)
     values ($1, $2, 'guide', 'KEYWORD', 'Send manually after the comment.', $3, 'ready')
     returning id`,
    [clientId, title, options.allowReuse ?? false],
  );
}

export async function seedCalendar(
  db: MigratedDb,
  clientId: string,
  month: string,
  postCount = 10,
): Promise<string> {
  return insertId(
    db,
    `insert into public.content_calendars
       (client_id, month, timezone, post_count, share_experience, share_asset,
        share_evergreen, share_news, news_cap_percent)
     values ($1, $2, 'UTC', $3, 40, 10, 40, 10, 20) returning id`,
    [clientId, month, postCount],
  );
}
