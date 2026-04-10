alter table if exists user_subreddits
  add column if not exists max_posts integer;

alter table if exists user_subreddits
  add column if not exists min_comments integer;

update user_subreddits
set
  max_posts = coalesce(max_posts, 100),
  min_comments = coalesce(min_comments, 0);

alter table if exists user_subreddits
  alter column max_posts set default 100;

alter table if exists user_subreddits
  alter column min_comments set default 0;

alter table if exists user_subreddits
  alter column max_posts set not null;

alter table if exists user_subreddits
  alter column min_comments set not null;
