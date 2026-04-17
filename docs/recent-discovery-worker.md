# Recent Discovery Worker

This app can optionally enrich subreddit discovery with a separate recent-post worker.

Set `RECENT_DISCOVERY_ENDPOINT` to a server endpoint that accepts:

```json
{
  "subreddits": ["conservative", "worldnews"],
  "afterUtc": 1712966400,
  "beforeUtc": 1713225600,
  "limitPerSubreddit": 150
}
```

The worker should return:

```json
{
  "source": "reddit-html-top-week",
  "posts": [
    {
      "id": "abc123",
      "title": "Example title",
      "author": "example_user",
      "subreddit": "conservative",
      "score": 1234,
      "numComments": 98,
      "url": "https://www.reddit.com/r/conservative/comments/abc123/example_title/",
      "permalink": "/r/conservative/comments/abc123/example_title/",
      "thumbnail": null,
      "selftext": "",
      "isVideo": false,
      "isSelf": true,
      "createdUtc": 1713200000,
      "flair": null,
      "domain": "self.conservative",
      "stickied": false,
      "isGallery": false,
      "galleryImages": []
    }
  ],
  "errors": [
    {
      "subreddit": "worldnews",
      "error": "Timed out while fetching page 2"
    }
  ]
}
```

## Intended behavior

- Fetch a live recent candidate pool per subreddit.
- Prefer Reddit listing pages such as `top?t=week`, then filter to the last 72 hours.
- Run on shared cadence and caching, not per-user demand.
- Feed snapshots should consume this pool and still apply per-user subreddit caps locally.

## Testing goals

- Compare the app's kept recent posts against a manual Reddit reference view.
- Track missing high-comment posts in the last 72 hours.
- Track crawl latency and failure rate per subreddit.
- Use shared cache keys by subreddit so user count does not multiply fetch load.
