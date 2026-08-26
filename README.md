# Rhino Docs

**The right way AI agents write code.** Documentation for Rhino — automatic REST APIs for Laravel, Rails, and NestJS.

---

[**Read the documentation**](https://rhino-project.org)

---

## Repositories

| Package | Description |
|--------|-------------|
| [**server-laravel**](https://github.com/rhino-project/rhino-laravel) | Laravel package — `rhino-project/rhino-laravel` |
| [**server-rails**](https://github.com/rhino-project/rhino-rails) | Rails gem — `rhino` |
| [**server-nestjs**](https://github.com/rhino-project/rhino-nestjs) | NestJS package — `@rhino-dev/rhino-nestjs` |
| [**client-react**](https://github.com/rhino-project/rhino-react) | React / React Native client — `@rhino-dev/rhino-react` |
| [**docs**](https://github.com/rhino-project/rhino-docs) | This documentation site |

---

## Where the docs live

Markdown sources are in `docs/`, one directory per stack:

| Stack | Path |
|---|---|
| Laravel server | `docs/laravel/` |
| Rails server | `docs/rails/` |
| NestJS server | `docs/nestjs/` |
| React client | `docs/react/` |
| React Native client | `docs/react-native/` |

Each stack's `getting-started.md` is the entry point and carries a complete feature summary — start
there. See [CLAUDE.md](./CLAUDE.md) for the conventions, including the rule that getting-started is
updated with every feature change.

---

Built with [Docusaurus](https://docusaurus.io/).

```bash
npm install
npm start       # local dev
npm run build   # production build
```
