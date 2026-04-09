create table if not exists user_feeds (
  id text primary key,
  username text not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_feeds_username_name_idx
  on user_feeds (username, name);

create index if not exists user_feeds_username_position_idx
  on user_feeds (username, position);

create table if not exists user_subreddit_feeds (
  username text not null,
  subreddit text not null,
  feed_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (username, subreddit)
);

create index if not exists user_subreddit_feeds_username_feed_idx
  on user_subreddit_feeds (username, feed_id);

create table if not exists feed_snapshots (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  feed_id text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  post_count integer not null default 0
);

create index if not exists feed_snapshots_user_feed_generated_idx
  on feed_snapshots (username, feed_id, generated_at desc);

create index if not exists feed_snapshots_expires_idx
  on feed_snapshots (expires_at);

create table if not exists feed_snapshot_posts (
  snapshot_id uuid not null references feed_snapshots(id) on delete cascade,
  position integer not null,
  post_id text not null,
  subreddit text not null,
  post_json jsonb not null,
  primary key (snapshot_id, position)
);

create index if not exists feed_snapshot_posts_snapshot_post_idx
  on feed_snapshot_posts (snapshot_id, post_id);
