# Tricks Dash

Interactive dashboard for ChatGPT Tricks Instagram posts.

## Features

- Three-column post gallery with sticky filters.
- Selected post rail with Instagram-style post preview.
- Caption and stats panels for the selected post.
- Search, type, media, date, engagement, sort, and page-size filters.
- Reads the canonical historical Post DB from Predict, including its stored cover images.

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

The live dashboard reads the shared Post DB from Predict through
`GET /api/tricks-dash/posts`. Set `VITE_API_BASE` to the Predict API URL when
building for a different environment. The JSON generation scripts remain only
as archival utilities and are not used by the dashboard.

Each post includes `ocrText`, sourced from Predict's normalized cover-image OCR
(`hook_text`). The dashboard search indexes captions, metadata, and this cover
text together.

## OCR For Cover Images

The recommended implementation in this repo is Google Cloud Vision OCR at build time.

Why this setup:

- Strong OCR quality for image-based content.
- Simple API-key based integration for a static-site workflow.
- Cached results in `outputs/ocr-cache.json` so reruns only process new or changed covers.
- OCR text is merged directly into `src/data/posts.json` and automatically added to the search index.

### Configure

Copy `.env.example` to `.env` and set:

```bash
GOOGLE_CLOUD_VISION_API_KEY=your_key_here
```

### Run OCR

```bash
pnpm ocr:covers
```

Useful overrides:

```bash
OCR_LIMIT=100 pnpm ocr:covers
OCR_FORCE=1 pnpm ocr:covers
OCR_GOOGLE_PRIMARY_FEATURE=TEXT_DETECTION pnpm ocr:covers
OCR_GOOGLE_SECONDARY_FEATURE=DOCUMENT_TEXT_DETECTION pnpm ocr:covers
```

The OCR pass uses `TEXT_DETECTION` first and falls back to `DOCUMENT_TEXT_DETECTION` when the first result is too short.
