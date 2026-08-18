---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for NestJS, newest first.

## 4.7.0

**Computed attributes, without the per-row cost.** Two new registration options make derived values and aggregates first-class, so counts and expensive per-row values no longer need a hand-written controller.

**Collection-level aggregates.** Declare `collectionComputedAttributes` on a model registration and `GET /api/{resource}/computed` starts responding for it. Each callable is awaited **once per request** over the fully scoped where filter — not once per row:

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  collectionComputedAttributes: {
    activeUsersCount: (ctx) =>
      ctx.delegate.count({ where: { ...ctx.where, status: 'active' } }),
    blockedUsersCount: (ctx) =>
      ctx.delegate.count({ where: { ...ctx.where, status: 'blocked' } }),
  },
},
```

```bash
GET /api/users/computed?attributes=activeUsersCount,blockedUsersCount
# → { "data": { "activeUsersCount": 128, "blockedUsersCount": 4 } }
```

`ctx.where` already has the organization scope (including `owner` chains), model scopes, `?scope=`, `?filter[]=`, `?search=` and the soft-delete filter applied — so aggregates describe exactly the set `index` would have returned. `ctx` also carries `delegate`, `prisma`, `user`, `organization` and `modelSlug`. Omitting `?attributes=` returns every declared attribute the policy allows. The endpoint is gated by `viewAny()`.

**Opt-in record attributes.** Declare `recordComputedAttributes` for per-row values you don't want on every response. Nothing is evaluated unless the client asks for it by name:

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  recordComputedAttributes: {
    avatarUrl: (record, _user) => buildSignedUrl(record.avatarPath),
  },
},
```

```bash
GET /api/users?computed_attributes=avatarUrl
GET /api/users/42?computed_attributes=avatarUrl
GET /api/users/trashed?computed_attributes=avatarUrl
```

- Both kinds go through the **same policy gate as columns** — `permittedAttributesForShow()` whitelists, `hiddenAttributesForShow()` blacklists.
- An undeclared name, a policy-denied name and a prototype key (`constructor`) all return the same 403 — the endpoint never reveals which attributes a model declares, and never invokes an inherited property.
- `'computed'` is accepted in `exceptActions`; a model that declares no collection attributes returns 404 for `/computed`.
- The Postman export gains a **Computed Attributes** folder plus `?computed_attributes=` examples on Index and Show.

See [Computed Attributes](./computed-attributes) for the full reference.

Fully backward compatible — existing `computedAttributes` behaves exactly as before, and read responses are unchanged unless a client sends `?computed_attributes=`.

## 4.6.1

**Security — `owner` now enforces cross-tenant isolation.** Registrations that declare `owner` (models without a direct `organizationId`, e.g. `tasks: { owner: 'project' }`) are now organization-scoped at runtime on every query — index, show, update, destroy, trashed, restore, and force-delete. The ownership chain is resolved once at boot (single or multi-hop, e.g. comment → task → project → organization) and applied as a nested Prisma filter such as `{ project: { organizationId } }`. Previously `owner` was documentation-only and these models leaked across tenants. Upgrading is strongly recommended for multi-tenant apps.

Details:

- `owner` accepts the Prisma relation field name (`'project'`), a dot-notated chain (`'task.project'`), or the legacy FK-column form (`'projectId'`).
- Unresolvable values (unknown model, cycle, dead-end chain) log a clear warning at boot and leave the model unscoped — same behavior as before, so a stale `owner` value cannot break an upgrade.
- `Rhino.query()` / `ResourceScopeService` fail closed (403 `TENANT_CONTEXT_REQUIRED`) for owner-chain models queried without an organization context, matching `belongsToOrganization` models.

Fully backward compatible for single-tenant apps, models without `owner`, and requests without an organization context.

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
