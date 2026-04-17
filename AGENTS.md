# Project Goals

- Build a humane Reddit client that helps people consume less, not more.
- Optimize for useful behavioral tests and product learnings rather than maximum growth.
- Fresh post discovery matters more than perfect archive completeness for the home feed.
- Comments and comment reading quality are a core strength and should not be degraded lightly.

# Reddit Constraints

- Do not suggest the official Reddit API or OAuth app registration as the path forward.
- Client-side Reddit fetching is blocked by CORS and is not a path forward.
- The current app has relied on Arctic Shift because it is fast, free, and works from server infrastructure.
- Arctic Shift is acceptable for comments and historical coverage, but it is not reliable enough as the sole source of truth for very recent post discovery.
- The user does not want 7-day-old posts in the daily digest. The intended digest window is the last 72 hours.

# Architecture Priorities

- Preserve the current fast UX where possible.
- Prefer shared, server-side cached discovery over per-user live fetches.
- If live recent discovery is added, treat it as a shared candidate pool per subreddit, then build user feeds from that pool.
- Keep the existing comment pipeline unless there is a strong reason to replace it.

# Preferred Direction

- Recent post discovery should eventually come from a separate worker or service that can fetch Reddit listing pages outside the current Vercel runtime limits.
- The app should be able to consume that worker via an env-configured endpoint rather than baking Reddit scraping directly into the deployed Next.js app.
- Arctic Shift should remain the fallback and historical source until recent discovery coverage is proven good enough.

# Collaboration Notes

- When making tradeoffs, bias toward data quality for feed coverage over clever ranking tweaks.
- If a proposal improves completeness but makes the product stale, call that out directly.
- If infrastructure or policy constraints block a clean solution, say so plainly rather than disguising a workaround as a fix.
