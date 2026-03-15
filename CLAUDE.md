# Claude Code Instructions

## After every code change

After making any change to the codebase, always run:

```
git add . && git commit -m "<relevant message>" && git push
```

Do this automatically without asking. Write a short, descriptive commit message based on what changed.

## Reddit API — DO NOT suggest official Reddit OAuth or API registration

Reddit's official API registration is broken/blocked for new developers as of 2023-2024.
Do NOT suggest:
- Creating a Reddit developer app
- Using Reddit OAuth (client_id / client_secret)
- Any flow that requires reddit.com/prefs/apps

**The working approach:** Fetch Reddit's public `.json` endpoints (e.g. `https://www.reddit.com/r/sub/hot.json`) **directly from the browser (client-side)**. Reddit allows browser CORS requests on these endpoints, so the user's residential IP makes the request — not Vercel's blocked datacenter IPs. No API key needed.
