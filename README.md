# Smart Home Finds (GitHub Pages Webapp)

A lightweight, mobile-first hub to collect and browse Pinterest Pins and product links (affiliate-friendly),
hosted on GitHub Pages.

## Features
- Products loaded from `data/products.json`
- Search + category filters + sorting
- Disclosure section
- “Add Product” button opens a GitHub Issue form
- GitHub Action updates `data/products.json` automatically when an Issue is opened

## Setup (Important)
1. Edit `assets/js/app.js` and set:
   - `CONFIG.links.*` (Pinterest/Instagram/Linktree/Shop)
   - `CONFIG.addProductIssueUrl` to:
     `https://github.com/<YOUR_USER>/<YOUR_REPO>/issues/new?template=add-product.yml`

2. Enable GitHub Actions write permissions:
   - Repo → Settings → Actions → General
   - Workflow permissions → **Read and write permissions** → Save

3. Enable GitHub Pages:
   - Repo → Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / root

## Add a product
- Open the site, tap **+ Add Product**
- Fill the form (Pin URL required; add Image URL if Pinterest blocks)
- Submit → Action updates `data/products.json` → site updates.
