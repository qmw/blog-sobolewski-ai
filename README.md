# Astro multilingual AI blog

A fast, fully static personal site and blog built for SEO and for AI-assisted writing.

- **Astro 7 + Tailwind CSS 4**, zero JavaScript by default, dark/light theme without flash
- **9 languages** out of the box: pl (default, no prefix), en, de, es, fr, it, ar (right-to-left), ja, zh, with localized slugs and full `hreflang`
- **SEO**: canonical URLs, Open Graph, JSON-LD (Person, WebSite, BlogPosting, BreadcrumbList), sitemap, RSS per language, `robots.txt`, `llms.txt`
- **WYSIWYG editor** at `/admin` ([Sveltia CMS](https://sveltiacms.app)), Git-based, no server needed
- **Translation pipeline helpers**: `scripts/posts.mjs` tracks drafts, ready posts and missing or stale translations via source hashes
- **MCP server** (`mcp/`) so AI agents can draft posts as GitHub pull requests

## Quick start

```bash
nvm use        # Node 24
npm install
npm run dev    # http://localhost:4321
```

Then:
1. Edit `src/data/profile.ts` (name, bio, links).
2. Set `site` in `astro.config.mjs` and `repo` / `site_url` in `public/admin/config.yml`.
3. Replace `public/og-default.png`.
4. Change languages in `src/i18n/index.ts` and `astro.config.mjs`.

## Post lifecycle

Posts live in `src/content/blog/<lang>/<slug>.md`. The default language is the source:

1. Write or generate a draft (`draft: true`).
2. Edit it in `/admin`, then tick **ready**.
3. Translate it into the other languages (by hand or with an AI agent). Each translation stores the source's `sourceHash` (`node scripts/posts.mjs hash <slug>`).
4. Set `draft: false` on all versions. `node scripts/posts.mjs status` shows what's missing or stale.

## Editor login

On `/admin`, choose "Sign In with Token" and paste a fine-grained GitHub token for your repo with **Contents: Read and write**.

## Deploy

Any static host works. On Vercel: import the repo; `vercel.json` sets the build, clean URLs, headers and redirects (change the `www` host redirect to your domain).

## License

MIT
