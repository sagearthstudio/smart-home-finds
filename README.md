# Smart Home Finds (GitHub Pages)

A lightweight webapp that lists your curated products and updates automatically from GitHub Issues.

## How it works
- Products are stored as GitHub Issues with the label: `product`
- The website fetches issues via GitHub API and renders them as product cards
- You add products by clicking **+ Add Product** (it opens an Issue Form)

## Setup (important)
1) Enable Issues:
   Repo → Settings → General → Features → ✅ Issues

2) GitHub Pages:
   Repo → Settings → Pages → Deploy from branch
   Branch: `main` — Folder: `/ (root)`

3) Configure:
   Edit `config.json`:
   - owner: your GitHub username/org
   - repo: this repository name
   - social links (Pinterest/Instagram/Linktree)

## Notes
- This app loads BOTH open and closed issues so products won't disappear if you close issues.
- GitHub API unauthenticated rate limit exists; the app caches results for a few minutes.
- If GitHub API is unavailable, it falls back to `products.sample.json`.
