# ChatGPT Tricks Archive

Interactive archive navigator for ChatGPT Tricks Instagram posts.

## Features

- Three-column post gallery with sticky filters.
- Selected post rail with Instagram-style post preview.
- Caption and stats panels for the selected post.
- Search, type, media, date, engagement, sort, and page-size filters.
- Local cover fallback plus Instagram cover proxy for post images.

## Setup

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Data

The app reads generated data from:

- `src/data/posts.json`
- `src/data/summary.json`

To regenerate from the workbook:

```bash
WORKBOOK_PATH="/path/to/chatgptricks_posts.xlsx" pnpm generate:data
```

If `WORKBOOK_PATH` is omitted, the script uses `/Users/tbnalfaro/Downloads/chatgptricks_posts.xlsx`.
