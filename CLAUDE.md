# Claude Code Instructions

## After every code change

After making any change to the codebase, always run:

```
git add . && git commit -m "<relevant message>" && git push
```

Do this automatically without asking. Write a short, descriptive commit message based on what changed.

## Reddit data fetching — constraints

Reddit has hard blocks that rule out the obvious approaches:

1. **Reddit OAuth / official API registration is broken for new developers** (2023-2024). Do NOT suggest creating a Reddit developer app, OAuth client credentials, or anything requiring reddit.com/prefs/apps.

2. **Client-side (browser) fetching is blocked by Reddit's CORS policy** — browsers get `Cross-Origin Request Blocked` errors. Do NOT suggest fetching Reddit `.json` endpoints directly from the browser.

3. **Vercel serverless and Edge functions both get 403 from reddit.com** — Reddit blocks all datacenter IPs (AWS and Cloudflare).

4. **Pullpush.io data is 300+ days stale as of 2025** — their ingestion broke after Reddit's 2023 API changes. Do NOT use Pullpush.

**The working approach: Arctic Shift**
- Posts: `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=X&limit=25&sort=-created_utc` — minus prefix = descending, no `order` param (rejected with 400)
- Comments: `https://arctic-shift.photon-reddit.com/api/comments/search?link_id=${postId}&limit=500` — bare post ID, NO `t3_` prefix
- Arctic Shift is a free, actively maintained Reddit archive — no auth, no API key, works from any server, has recent data
- Fetch server-side in the Next.js API route with `export const runtime = 'edge'`
