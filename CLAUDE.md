# Claude Code Instructions

## After every code change

After making any change to the codebase, always run:

```
git add . && git commit -m "<relevant message>" && git push
```

Do this automatically without asking. Write a short, descriptive commit message based on what changed.

## Reddit data fetching — constraints

Reddit has two hard blocks that rule out the obvious approaches:

1. **Reddit OAuth / official API registration is broken for new developers** (2023-2024). Do NOT suggest creating a Reddit developer app, OAuth client credentials, or anything requiring reddit.com/prefs/apps.

2. **Client-side (browser) fetching is blocked by Reddit's CORS policy** — browsers get `Cross-Origin Request Blocked` errors. Do NOT suggest fetching Reddit `.json` endpoints directly from the browser.

3. **Vercel standard serverless functions use AWS IPs, which Reddit blocks with 403.**

**The working approach: Pullpush.io for posts**
- Use `https://api.pullpush.io/reddit/search/submission/?subreddit=X&sort=desc&sort_type=score&after=<48h_timestamp>` for fetching posts
- Pullpush is a free public Pushshift-style Reddit archive — no auth, no API key, works from any server
- Returns top-scoring posts from the last 48h (not Reddit's "hot" algorithm, but close enough for personal use)
- Fetch server-side in the Next.js API route with `export const runtime = 'edge'`
- Do NOT try to fetch from reddit.com or oauth.reddit.com — all datacenter IPs (AWS, Cloudflare) are blocked
