-- ── Who opened a share link ─────────────────────────────────────────────────
-- Admins want to know how many people looked at a link, not how many times a
-- page loaded. Each visitor's browser carries a random ID (a cookie set on
-- share pages; nothing personal). A visit counts once per visitor per half
-- hour, so refreshing and paging do not inflate it. Downloads are counted
-- separately.

alter table public.share_links
  add column visitor_count integer not null default 0,
  add column download_count integer not null default 0;

create table public.share_visitors (
  share_link_id uuid not null references public.share_links (id) on delete cascade,
  visitor_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (share_link_id, visitor_id)
);

revoke all on public.share_visitors from anon, authenticated;
grant all on public.share_visitors to service_role;
alter table public.share_visitors enable row level security;

drop function public.record_share_view(uuid);

-- Counts a visit. With no visitor ID (cookies blocked) every call counts.
create function public.record_share_view(p_share_id uuid, p_visitor_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_visitor boolean := false;
  counts boolean := true;
  previous timestamptz;
begin
  if p_visitor_id is not null then
    insert into public.share_visitors (share_link_id, visitor_id)
    values (p_share_id, p_visitor_id)
    on conflict do nothing;
    get diagnostics new_visitor = row_count;

    if not new_visitor then
      select last_seen_at into previous
      from public.share_visitors
      where share_link_id = p_share_id and visitor_id = p_visitor_id
      for update;
      counts := previous < now() - interval '30 minutes';
      update public.share_visitors
      set last_seen_at = now()
      where share_link_id = p_share_id and visitor_id = p_visitor_id;
    end if;
  end if;

  update public.share_links
  set view_count = view_count + (case when counts then 1 else 0 end),
      visitor_count = visitor_count + (case when new_visitor then 1 else 0 end),
      last_viewed_at = now()
  where id = p_share_id;
end;
$$;

create function public.record_share_download(p_share_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.share_links
  set download_count = download_count + 1
  where id = p_share_id
$$;

revoke all on function public.record_share_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_share_view(uuid, uuid) to service_role;
revoke all on function public.record_share_download(uuid) from public, anon, authenticated;
grant execute on function public.record_share_download(uuid) to service_role;
