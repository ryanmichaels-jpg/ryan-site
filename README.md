# ryan-site

A personal site built with [Astro](https://astro.build).

Two registers, on purpose. The **shell** — homepage, header, footer — is a quiet sans (Inter)
at a small size, in the idiom of [leerob.com](https://leerob.com) and [paco.me](https://paco.me):
prose, not a billboard. The **post** is where the typography works: a Newsreader reading
column with numbered chapters, a drop cap, and a sticky chapter rail. Light and dark both
come from the OS setting.

## Run it

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview  # serve the built output locally
```

## Deploy

Plain static files, so anything works. Two zero-config options:

**Vercel** — push to a GitHub repo, import it at vercel.com. It detects Astro; nothing to
configure. Custom domain under Project → Settings → Domains.

**Netlify** — same flow, or drag `dist/` onto their dashboard for a one-off. `netlify.toml`
is already here.

Either way: set `site` in `astro.config.mjs` to your real domain before pointing DNS at it,
or canonical URLs and the RSS feed will keep claiming the placeholder.

## Routes

```
/            the homepage — intro prose + the Building list
/junto       a post (posts live at the top level, no /blog or /writing prefix)
/rss.xml     feed, published posts only
```

There's deliberately no writing index and no about page. The homepage does both jobs. If you
outgrow that — more than four or five entries — add `src/pages/writing.astro` listing the
collection.

## The homepage

Two things to edit:

- **The prose** is written directly in `src/pages/index.astro`. It's three paragraphs; keep
  it that way.
- **The Building list** comes from `building` in `src/site.ts`. Each entry is a name, a
  one-line blurb, and optionally `post: 'slug'` to link its build journal:

```ts
building: [
  { name: 'Junto', blurb: 'A shared, compounding knowledge layer…', post: 'junto' },
]
```

`src/site.ts` also holds your name, tagline, email and social links.

## Writing a post

MDX files in `src/content/posts/`. The filename is the URL: `junto.mdx` → `/junto`.

```yaml
---
title: Talented and disposable
dek: One sentence under the title.
date: 2026-07-25
draft: true       # shows a "draft" tag; excluded from RSS
tags: ['build journal']
---
```

`draft: true` plus `showDrafts: true` in `src/site.ts` means the post still appears on the
homepage, tagged as a draft — useful while writing. Set `showDrafts: false` to hide drafts
from the homepage; the URL keeps working, which is what you want for sharing a
work-in-progress.

### Components you can use inside a post

| Component | What it does |
| --- | --- |
| `<Lede>` | The opening paragraph — larger, with a drop cap. One per post. |
| `## heading` | Becomes a numbered chapter and appears in the chapter rail. |
| `<Diagram src="foo.html" label="Fig. 1" caption="…" height={620} />` | Embeds a standalone HTML diagram from `public/diagrams/` live, mounted on a dark plate. |
| `<Depth summary="…">` | A collapsible toggle — the spine stays on the page, the depth folds away. |
| `<Glance items={[{ n: '15', label: '…' }]} />` | The "at a glance" numbers block. |
| `<Marginal>` | A sidenote. Floats into the right margin on wide screens. |
| `<Tk points={['…']} />` | A visible placeholder for an undrafted chapter. Delete as you fill in. |
| `> quote` | Pull quote — large italic with an accent rule. |

### Adding a diagram

Drop the standalone `.html` file into `public/diagrams/` and reference it by filename. The
diagrams in there came from the Junto build docs; they keep their own dark styling and the
figure frame is designed around that rather than against it.

## Design knobs

Everything is a custom property at the top of `src/styles/global.css`: paper and ink,
`--accent`, `--underline`, the type scale, `--shell` (site width) and `--measure` (reading
column). Change the accent in one place and the whole site follows.

## Structure

```
src/
  content/posts/       posts (.mdx)
  components/          the editorial building blocks listed above
  layouts/             BaseLayout (shell) + PostLayout (title block, chapter rail)
  pages/               / · /[slug] · /rss.xml · 404
  styles/global.css    the whole design system
  site.ts              name, links, Building list, draft visibility
public/diagrams/       standalone HTML diagrams embedded by <Diagram />
```
