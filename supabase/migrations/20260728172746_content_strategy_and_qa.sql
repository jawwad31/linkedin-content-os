alter table public.content_ideas
  add column generation_plan jsonb,
  add column generation_plan_version integer,
  add column generation_plan_input_hash text,
  add column strategy_overrides jsonb not null default '{}'::jsonb;

alter table public.content_ideas
  add constraint content_ideas_generation_plan_object_check
    check (generation_plan is null or jsonb_typeof(generation_plan) = 'object'),
  add constraint content_ideas_generation_plan_version_check
    check (generation_plan_version is null or generation_plan_version > 0),
  add constraint content_ideas_generation_plan_hash_check
    check (
      generation_plan_input_hash is null
      or generation_plan_input_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint content_ideas_strategy_overrides_object_check
    check (jsonb_typeof(strategy_overrides) = 'object');

alter table public.posts
  add column qa_result jsonb;

alter table public.posts
  add constraint posts_qa_result_object_check
    check (qa_result is null or jsonb_typeof(qa_result) = 'object');

comment on column public.content_ideas.generation_plan is
  'Versioned canonical generation plan used to draft this idea.';
comment on column public.content_ideas.generation_plan_input_hash is
  'SHA-256 of the current planning inputs; used to detect stale plans.';
comment on column public.content_ideas.strategy_overrides is
  'Safe idea-level taxonomy overrides selected by an authorized workspace user.';
comment on column public.posts.qa_result is
  'Structured result from the independent AI review/finalization stage.';
