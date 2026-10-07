-- P04 corrective migration. Preserve all existing ideas and legacy source modes.
alter table public.content_ideas drop constraint if exists content_ideas_source_type_check;
alter table public.content_ideas add constraint content_ideas_source_type_check
  check (source_type in ('founder_experience', 'trend_card', 'trend_reaction',
    'content_resource', 'profile_led', 'custom_upload', 'research_brief'));
