create table if not exists user_usage_settings (
  username text primary key,
  timezone text not null default 'Australia/Brisbane',
  daily_limit_seconds integer null,
  daily_usage_seconds integer not null default 0,
  daily_open_limit integer null,
  daily_open_count integer not null default 0,
  daily_reset_at timestamptz not null,
  count_visible_without_focus boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_usage_settings
  add column if not exists daily_open_limit integer null;

alter table user_usage_settings
  add column if not exists daily_open_count integer not null default 0;

create table if not exists usage_schedules (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  name text not null,
  days integer[] not null default '{}',
  all_day boolean not null default false,
  banned boolean not null default false,
  daily_allowance_seconds integer null,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists usage_schedule_windows (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references usage_schedules(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create table if not exists reddit_usage_events (
  id bigint generated always as identity primary key,
  username text not null,
  occurred_at timestamptz not null default now(),
  usage_date date not null,
  seconds integer not null check (seconds > 0),
  feed_id text not null,
  feed_name text not null,
  subreddit text null
);

create table if not exists reddit_open_events (
  id bigint generated always as identity primary key,
  username text not null,
  occurred_at timestamptz not null default now(),
  usage_date date not null,
  session_id text not null
);

create index if not exists reddit_usage_events_user_date_idx
  on reddit_usage_events (username, usage_date);

create index if not exists reddit_open_events_user_date_idx
  on reddit_open_events (username, usage_date);

create unique index if not exists reddit_open_events_user_date_session_idx
  on reddit_open_events (username, usage_date, session_id);

create index if not exists usage_schedules_username_idx
  on usage_schedules (username);
