-- Migration: Enforce one active Post per Content Idea
CREATE UNIQUE INDEX posts_one_active_post_per_idea_idx
ON public.posts (content_idea_id)
WHERE content_idea_id IS NOT NULL
  AND deleted_at IS NULL;
