-- JARVIS database schema (Postgres 15+ with pgvector).
-- Not wired into the app yet; this is the target model for the memory and
-- wallet features. Every user-owned table is protected by row-level security.

create extension if not exists vector;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Addresses the user proved they own with Sign-In with Ethereum, or added
-- as watch-only. JARVIS never stores private keys.
create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  chain_id integer not null,
  address text not null,
  label text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, chain_id, address)
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null default 'text', -- text | link | file | voice
  title text,
  body text not null,
  source_url text,
  tags text[] not null default '{}',
  -- Dimension must match the embedding model chosen later.
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_idx on notes (user_id, created_at desc);
create index notes_embedding_idx on notes using hnsw (embedding vector_cosine_ops);
create index notes_fts_idx on notes using gin (to_tsvector('simple', coalesce(title, '') || ' ' || body));

-- Links between notes, and between notes and assets ("why I bought X").
create table note_links (
  from_note uuid not null references notes (id) on delete cascade,
  to_note uuid references notes (id) on delete cascade,
  asset_address text,
  chain_id integer,
  relation text not null default 'related',
  check (to_note is not null or asset_address is not null)
);

-- User-defined rules such as "tell me if TSLA drops below 200". Alerts only;
-- JARVIS never executes trades.
create table theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  note_id uuid references notes (id) on delete set null,
  chain_id integer not null,
  asset_address text not null,
  condition jsonb not null,
  active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table wallets enable row level security;
alter table notes enable row level security;
alter table note_links enable row level security;
alter table theses enable row level security;

-- The app sets app.user_id per request (set_config('app.user_id', ..., true)).
create policy wallets_owner on wallets
  using (user_id = current_setting('app.user_id')::uuid);
create policy notes_owner on notes
  using (user_id = current_setting('app.user_id')::uuid);
create policy theses_owner on theses
  using (user_id = current_setting('app.user_id')::uuid);
create policy note_links_owner on note_links
  using (exists (
    select 1 from notes n
    where n.id = note_links.from_note
      and n.user_id = current_setting('app.user_id')::uuid
  ));
