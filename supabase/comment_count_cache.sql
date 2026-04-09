create table if not exists post_comment_counts (
  post_id text primary key,
  subreddit text not null,
  num_comments integer not null check (num_comments >= 0),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comment_counts_expires_at_idx
  on post_comment_counts (expires_at);

create index if not exists post_comment_counts_checked_at_idx
  on post_comment_counts (checked_at desc);
