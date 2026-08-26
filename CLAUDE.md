# CLAUDE.md — rhino-docs

Documentation site for **Rhino** (automatic REST APIs for Laravel, Rails and NestJS, plus a React
client). Built with Docusaurus.

## Where the docs are

All documentation lives in `docs/`, one directory per stack. **Read these directly — they are the
source of truth, not the built site.**

| Stack | Path | Entry point |
|---|---|---|
| Laravel server | `docs/laravel/` | `docs/laravel/getting-started.md` |
| Rails server | `docs/rails/` | `docs/rails/getting-started.md` |
| NestJS server | `docs/nestjs/` | `docs/nestjs/getting-started.md` |
| React client | `docs/react/` | `docs/react/getting-started.md` |
| React Native client | `docs/react-native/` | `docs/react-native/getting-started.md` |
| Laravel best-practices manual | `docs/laravel/best-practices/` | `docs/laravel/best-practices/index.md` |
| Cross-stack intro | `docs/intro.md` | — |

One stack's full docs are roughly 50k tokens — small enough to load entirely as context. If you are
working on a Rhino app, read the `getting-started.md` for that stack first: it summarizes every
feature the library ships, so you never hand-write something Rhino already generates.

Absolute path to the docs in this checkout:

```
<repo>/docs
```

Everything else in this repo is the site itself — `src/` (React components and landing pages),
`static/` (assets, the `rhino-init` skill, and `/server/*` redirect stubs), `sidebars.ts`,
`docusaurus.config.ts`.

## Rule: getting-started is always current

**Whenever any feature changes, add, or is removed, update that stack's `getting-started.md` in the
same change.**

The `getting-started.md` of each stack is the entry point for both humans and AI agents. Its
**Feature Map** section is a complete summary of the library, so it goes stale the moment a feature
page changes without it.

How to update it:

- Update the **summary** so it describes the library as it is now.
- Do **not** turn it into a changelog. It never says "new in 4.7" or "this changed" — that belongs in
  `release-notes.md`. It only ever describes the current state.
- Keep the corresponding rows in the Feature Map tables, the "Which tool for which problem" table and
  the documentation map in sync — a new feature needs a row, a removed one loses its row.
- Keep the summary short and link-out to the deep page; the detail lives there, not here.

Also update `docs/intro.md` when a change affects the cross-stack feature list or the install
snippets.

## Conventions

- Feature parity is the goal: a feature documented for one server stack should be documented for the
  others (or explicitly noted as unavailable there).
- Cross-links are relative (`./models`, `../react/querying`). `onBrokenLinks` is set to `throw`, so a
  bad link fails the build.
- Django is **not** supported. Do not add `docs/django/` back or reference Django as a target.
- The Laravel docs live at `docs/laravel/` and are served at `/laravel/*`. The old `/server/*` URLs are
  kept alive by meta-refresh stubs in `static/server/` — if you add a Laravel page, add a matching stub
  only if the old URL was public.

## Working on the site

```bash
npm install
npm start       # local dev at http://localhost:3000
npm run build   # production build — also validates every internal link
```

Run `npm run build` before finishing a docs change; it is the only check that catches broken links.
