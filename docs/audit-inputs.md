# Audit Inputs

## Config defaults

- `defaults.sitemap_urls: string[]` allows adding explicit sitemap endpoints for seed discovery.

## Seed discovery behavior (STEP 1)

- Start URL is always a seed.
- Additional seeds can come from `robots.txt` sitemap entries, `/sitemap.xml`, and `defaults.sitemap_urls`.
- `allowed_domains`, `include_patterns`, and `exclude_patterns` are applied in deterministic order.
- `respect_robots` controls robots parsing and disallow filtering.
- In `quick` coverage, seeds are capped by `max_pages` with start URL first.
