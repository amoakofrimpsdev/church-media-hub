-- Several Telegram groups per region, each for photos, videos or everything.
--
-- A region's media team can be split into a photography group and a video
-- group. Each group gets the "Today" upload link, reminders and the "who
-- uploaded what" list about its own kind of media, tagging only the people in
-- the matching role. Handoff alerts ("ready", "late") go to groups that have
-- them switched on. A region with no groups of its own still uses the
-- church's main group (app_settings).
--
-- Server-only, like the Telegram columns on regions it replaces.

create table public.region_telegram_groups (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions (id) on delete cascade,
  chat_id bigint not null unique,
  title text not null,
  -- 'photos', 'videos', or 'all'.
  media text not null default 'all' check (media in ('all', 'photos', 'videos')),
  handoff_alerts boolean not null default true,
  linked_by uuid references public.profiles (id) on delete set null,
  linked_at timestamptz not null default now()
);

create index region_telegram_groups_region_idx on public.region_telegram_groups (region_id, linked_at);

-- Each region's group so far becomes an "everything" group.
insert into public.region_telegram_groups (region_id, chat_id, title, linked_at)
select id, telegram_chat_id, coalesce(telegram_chat_title, 'Telegram group'), coalesce(telegram_linked_at, now())
from public.regions
where telegram_chat_id is not null;

alter table public.regions
  drop column telegram_chat_id,
  drop column telegram_chat_title,
  drop column telegram_linked_at;

-- Which kind of media each role takes, so reminders tag photographers in the
-- photography group and videographers in the video group. Roles without
-- one (Editor) appear in every group.
alter table public.duty_roles
  add column media text check (media in ('photos', 'videos'));
update public.duty_roles set media = 'photos' where name ilike '%photo%';
update public.duty_roles set media = 'videos' where name ilike '%video%';

revoke all on public.region_telegram_groups from anon, authenticated;
grant all on public.region_telegram_groups to service_role;
alter table public.region_telegram_groups enable row level security;
