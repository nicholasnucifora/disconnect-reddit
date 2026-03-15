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

**The working approach: Vercel Edge Functions**
- Add `export const runtime = 'edge'` to the Next.js API route that proxies Reddit
- Edge Functions run on Cloudflare's network (not AWS), which Reddit does not block
- Keep Reddit fetching server-side in the API route, called from the client via `/api/reddit/posts`
- No API key needed — just the public `.json` endpoints with a User-Agent header
