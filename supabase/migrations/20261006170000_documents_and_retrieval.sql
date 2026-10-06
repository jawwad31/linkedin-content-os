-- Migration: Supporting Documents and Scoped Retrieval
-- Product: Virel
-- Phase: P03

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  filename text not null,
  file_size_bytes integer not null,
  mime_type text not null default 'text/markdown',
  purpose text not null default 'source_material' check (
    purpose in ('source_material', 'private_evidence', 'reader_download', 'profile_reference')
  ),
  version integer not null default 1,
  status text not null default 'ready' check (
    status in ('pending', 'processing', 'ready', 'failed', 'archived')
  ),
  content_text text not null,
  content_hash text not null,
  error_message text,
  storage_path text,
  linked_source_id uuid,
  linked_source_type text check (
    linked_source_type in ('founder_experience', 'content_resource', 'client_profile')
  ),
  vector_store_file_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists client_documents_client_status_idx
  on public.client_documents(client_id, status)
  where deleted_at is null;

create index if not exists client_documents_hash_idx
  on public.client_documents(client_id, content_hash);

create index if not exists client_documents_linked_source_idx
  on public.client_documents(client_id, linked_source_id)
  where deleted_at is null;

-- Enable RLS
alter table public.client_documents enable row level security;

-- Read policy: accepted workspace members
create policy "Accepted workspace users can read client documents"
  on public.client_documents for select
  using (
    (
      exists (
        select 1 from public.client_access ca
        where ca.client_id = client_documents.client_id
        and ca.user_id = auth.uid()
        and ca.invitation_status = 'accepted'
      )
      or exists (
        select 1 from public.agency_members am
        join public.clients c on c.agency_id = am.agency_id
        where c.id = client_documents.client_id
        and am.user_id = auth.uid()
        and am.role = 'agency_admin'
      )
    )
    and client_documents.deleted_at is null
  );

-- Insert policy: admins or authorized contributors
create policy "Authorized users can insert client documents"
  on public.client_documents for insert
  with check (
    public.has_client_access(client_documents.client_id, array['agency_admin', 'client_admin'])
    or (
      -- Contributor permissions for non-admin purposes
      client_documents.purpose in ('source_material', 'private_evidence')
      and exists (
        select 1 from public.client_access ca
        where ca.client_id = client_documents.client_id
        and ca.user_id = auth.uid()
        and ca.invitation_status = 'accepted'
        and (
          'founder_experience_manage' = any (ca.permissions)
          or 'ideas_manage' = any (ca.permissions)
          or 'posts_draft' = any (ca.permissions)
        )
      )
    )
  );

-- Update policy
create policy "Authorized users can update client documents"
  on public.client_documents for update
  using (
    public.has_client_access(client_documents.client_id, array['agency_admin', 'client_admin'])
    or (
      client_documents.purpose in ('source_material', 'private_evidence')
      and exists (
        select 1 from public.client_access ca
        where ca.client_id = client_documents.client_id
        and ca.user_id = auth.uid()
        and ca.invitation_status = 'accepted'
        and (
          'founder_experience_manage' = any (ca.permissions)
          or 'ideas_manage' = any (ca.permissions)
          or 'posts_draft' = any (ca.permissions)
        )
      )
    )
  );
