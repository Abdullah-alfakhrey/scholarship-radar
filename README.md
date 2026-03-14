# Scholarship Radar

A static scholarship dashboard that refreshes every 12 hours and is designed to publish on GitHub Pages.

## What This Project Does

- Searches the web for fully funded master's scholarships with a stipend
- Focuses on the UK, EU, US, Australia, and Gulf countries
- Filters for Iraq-specific eligibility or broad international eligibility
- Prioritizes architecture, sustainability, circular economy, climate change, climate policy, and adjacent design-to-climate fields
- Publishes results to a simple dashboard using `data/scholarships.json`

## Why This Architecture

Searching the entire web literally from a GitHub Action is not realistic. The reliable pattern is:

1. Use a web search API to discover candidate scholarship pages.
2. Fetch those pages and extract structured details.
3. Apply strict filtering rules to keep only relevant matches.
4. Publish the cleaned dataset to a static dashboard.

That is what this project scaffolds for you.

## Stack

- Static UI: `index.html`, `styles.css`, `script.js`
- Data updater: `scripts/update-scholarships.js`
- Scheduler and deploy: GitHub Actions and GitHub Pages
- Default search provider: Brave Search API via `BRAVE_SEARCH_API_KEY`

## Local Setup

1. Run `npm install`
2. Export `BRAVE_SEARCH_API_KEY` in your shell
3. Run `npm run refresh`
4. Run `npm run dev`
5. Open [http://localhost:4173](http://localhost:4173)

If no API key is set, the dashboard still loads and explains why the feed is empty.

## Manual Curation

Use `data/manual-curation.json` to:

- Add hand-reviewed scholarships the crawler missed
- Exclude noisy URLs
- Exclude domains that keep producing low-quality pages

## Publish To GitHub

1. Create a GitHub repository and push this project
2. Add the repository secret `BRAVE_SEARCH_API_KEY`
3. In GitHub Pages settings, publish from the `main` branch root for the first live deployment
4. If your GitHub token includes `workflow` scope, you can switch back to `GitHub Actions` later
5. The prepared workflow schedule is `03:17` and `15:17` UTC, which is `06:17` and `18:17` in Iraq

## Important Notes

- Automated extraction is helpful, but it is not perfect. Always verify the official scholarship page before applying.
- Some scholarship sites block bots or hide details in PDFs and application portals. That is why `reviewNeeded` exists in the dashboard.
- The earlier jellyfish demo has been preserved under `legacy/jelly-drift/`.
- A ready-to-use GitHub Actions workflow template is preserved in `docs/refresh-and-deploy.workflow.yml.example`. Move it into `.github/workflows/` after your GitHub token has `workflow` scope.
