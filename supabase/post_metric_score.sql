alter table post_comment_counts
  add column if not exists score integer not null default 0;
