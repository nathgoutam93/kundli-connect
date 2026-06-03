alter table public.likes
  add column if not exists match_score_id uuid references public.match_scores(id) on delete set null;

create index if not exists likes_match_score_id_idx
  on public.likes(match_score_id);

alter table public.likes
  drop column if exists compatibility_score,
  drop column if exists compatibility_report;
