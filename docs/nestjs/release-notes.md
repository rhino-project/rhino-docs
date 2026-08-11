---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for NestJS, newest first.

## 4.6.0

**Configurable route key.** Member routes (`show`, `update`, `destroy`, `restore`, force-delete) can now match the `:id` URL segment against any unique column instead of the primary key — set `routeKey` on the `ModelRegistration` (also available via the `@RouteKey('hashId')` decorator and `defineModel({ ..., routeKey })`), or the global `routeKey` on the root Rhino config:

```ts title="src/rhino.config.ts"
jobs: {
  model: 'job',
  routeKey: 'hashId', // GET /api/jobs/{hashId}
},
```

Resolution order is registration `routeKey` → global `routeKey` config → primary key. When a custom key is set, the URL parameter is always matched as a string — digit-only hashes are never coerced to numbers. Boot-time validation rejects empty strings. See [Models — Route Key](./models#route-key) for full details and caveats.

- The route-key column and `id` are now always kept in serialized output, regardless of policy whitelists, and `?fields[]` selection force-includes the route key so responses stay routable.
- [Blueprint](./blueprint) supports a per-model `options: { route_key: ... }` that threads the route key through generated registrations and tests.

**Fixed:** `restore` audit-trail entries now record the record's real primary key instead of the raw route parameter.

Fully backward compatible — defaults are unchanged; nothing changes unless a route key is configured.

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-nestjs/releases) for the history of earlier versions.
