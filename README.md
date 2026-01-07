# Smart Home Finds (GitHub Pages)

A minimal webapp that lists curated products. New products are added by creating a GitHub Issue using the "Add Product" form.

## How to add a product
1. Open the webapp and click **+ Add Product**
2. Fill the Issue form (Pin URL required)
3. Submit the Issue
4. GitHub Actions will:
   - parse the issue
   - append product into `data/products.json`
   - commit & push
   - close the issue

## Troubleshooting
- Ensure GitHub Actions are enabled in the repo.
- Repo Settings → Actions → General:
  - Workflow permissions: **Read and write permissions**
- If the site doesn’t update:
  - Click **↻ Refresh** in the webapp
  - Or click **Force update (clear cache)**
