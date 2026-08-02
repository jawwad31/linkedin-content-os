alter table public.clients
  add column founder_voice_examples jsonb not null default '[]'::jsonb;

alter table public.clients
  add constraint clients_founder_voice_examples_array_check
    check (
      jsonb_typeof(founder_voice_examples) = 'array'
      and jsonb_array_length(founder_voice_examples) <= 3
    );

create table public.content_resources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  title text not null,
  resource_type text not null,
  description text,
  problem_solved text,
  target_use_case text,
  keyword text not null,
  delivery_url text,
  delivery_instructions text,
  active boolean not null default true,
  comment_gate_approved boolean not null default false,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_resources_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint content_resources_type_check
    check (
      resource_type in (
        'guide',
        'template',
        'checklist',
        'report',
        'worksheet',
        'tool',
        'other'
      )
    ),
  constraint content_resources_keyword_check
    check (
      char_length(btrim(keyword)) between 1 and 40
      and keyword = upper(keyword)
      and keyword ~ '^[A-Z0-9_-]+$'
    ),
  constraint content_resources_delivery_check
    check (
      nullif(btrim(coalesce(delivery_url, '')), '') is not null
      or nullif(btrim(coalesce(delivery_instructions, '')), '') is not null
    )
);

alter table public.content_resources
  add constraint content_resources_client_id_id_key
    unique (client_id, id);

create index content_resources_client_active_idx
  on public.content_resources (client_id, active, created_at desc)
  where deleted_at is null;

drop trigger if exists set_updated_at on public.content_resources;
create trigger set_updated_at
  before update on public.content_resources
  for each row
  execute function public.set_updated_at();

alter table public.content_resources enable row level security;

create policy content_resources_select_workspace_access
  on public.content_resources
  for select
  to authenticated
  using (
    deleted_at is null
    and public.has_client_access(
      client_id,
      array['agency_admin', 'client_admin', 'client_user']
    )
  );

create policy content_resources_insert_workspace_admin
  on public.content_resources
  for insert
  to authenticated
  with check (
    public.has_client_access(
      client_id,
      array['agency_admin', 'client_admin']
    )
  );

create policy content_resources_update_workspace_admin
  on public.content_resources
  for update
  to authenticated
  using (
    public.has_client_access(
      client_id,
      array['agency_admin', 'client_admin']
    )
  )
  with check (
    public.has_client_access(
      client_id,
      array['agency_admin', 'client_admin']
    )
  );

grant select, insert, update
  on table public.content_resources
  to authenticated, service_role;

alter table public.content_ideas
  add column selected_resource_id uuid;

alter table public.content_ideas
  add constraint content_ideas_selected_resource_client_check
    foreign key (client_id, selected_resource_id)
    references public.content_resources(client_id, id)
    on delete restrict;

create index content_ideas_selected_resource_id_idx
  on public.content_ideas (selected_resource_id)
  where selected_resource_id is not null;

alter table public.posts
  add column format_recommendation jsonb;

alter table public.posts
  add constraint posts_format_recommendation_object_check
    check (
      format_recommendation is null
      or jsonb_typeof(format_recommendation) = 'object'
    );

comment on column public.clients.founder_voice_examples is
  'Up to three pasted posts used only to calibrate writing style.';
comment on table public.content_resources is
  'Client-owned resources that may be offered through a manually fulfilled comment gate.';
comment on column public.content_ideas.selected_resource_id is
  'Optional approved Content Resource selected by GenerationPlanV2.';
comment on column public.posts.format_recommendation is
  'Advisory text, carousel, video, poll, or newsletter recommendation from QA.';
comment on column public.content_ideas.generation_plan is
  'Canonical GenerationPlanV2 used to draft this idea.';
