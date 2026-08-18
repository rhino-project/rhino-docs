---
sidebar_position: 5
title: Computed Attributes
---

# Computed Attributes

Computed attributes are values your API returns that are **not database columns** — a formatted name, a derived flag, a count. Rhino has three kinds, and picking the right one is almost entirely a performance decision:

| Kind | Declared with | Evaluated | Use it for |
|---|---|---|---|
| **Always-on, per record** | `computedAttributes` | On every read, for every row | Cheap values derived from fields already loaded |
| **Opt-in, per record** | `recordComputedAttributes` | Only when the client sends `?computed_attributes=` | Per-row values that cost a query or real work |
| **Collection-level** | `collectionComputedAttributes` | Once per request, via `GET /{resource}/computed` | Aggregates over the whole collection — counts, sums, averages |

All three are declared on the model's registration in `rhino.config.ts`, and all three are subject to the same policy filtering as database columns. None of them require a custom controller.

:::tip Counting rows? You want the collection-level kind.
A "how many users are active" number is **one aggregate over the collection**, not a value that belongs on each row. Declaring it as a per-record attribute would run the count once per returned record — 25 identical `count()` queries for a 25-row page. See [Collection-level computed attributes](#collection-level-computed-attributes).
:::

## Always-on computed attributes

`computedAttributes` is a function whose result is merged into **every** serialized record, on every endpoint. There is no way for a client to opt out, so only put cheap, field-derived values here.

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  computedAttributes: (record, _user) => ({
    fullName: `${record.firstName} ${record.lastName}`.trim(),
    isLocked: record.lockedAt !== null,
  }),
},
```

```bash
GET /api/users
# → every row carries fullName and isLocked
```

The result is merged **before** policy filtering, so `hiddenAttributesForShow()` and `permittedAttributesForShow()` govern these values exactly as they govern columns.

## Opt-in record computed attributes

When a per-row value costs something — a relation count, a signed URL, an external lookup — declaring it as always-on makes every list endpoint pay for it whether or not the client wants it. Declare it with `recordComputedAttributes` instead: **nothing is evaluated unless the client names it.**

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  recordComputedAttributes: {
    avatarUrl: (record, _user) => buildSignedUrl(record.avatarPath),
    displayName: (record, user) =>
      record.id === user?.id ? 'You' : record.firstName,
  },
},
```

Each entry is a callable receiving the **record** and the **current user**. Select them with `?computed_attributes=`:

```bash
# Nothing extra — byte-for-byte the response you got before you declared them
GET /api/users

# Each returned row now carries avatarUrl
GET /api/users?computed_attributes=avatarUrl

# Several at once
GET /api/users?computed_attributes=avatarUrl,displayName

# Also works on show and trashed
GET /api/users/42?computed_attributes=avatarUrl
GET /api/users/trashed?computed_attributes=avatarUrl
```

The parameter is supported on the **read** endpoints — `index`, `show` and `trashed`, and `?computedAttributes=` is accepted as an alias. It composes with everything else: filters, search, sorting, `?scope=`, pagination, and includes.

An unknown name, or one the policy denies, is a **403** — never a silent omission, so a typo surfaces immediately:

```json
{ "code": "FORBIDDEN", "message": "Computed attribute 'avatarUrls' is not allowed" }
```

:::note Callables are synchronous
`recordComputedAttributes` entries run inside serialization and are **not awaited** — returning a promise puts a promise in the response. Keep per-row attributes to in-memory work; anything that needs the database belongs in a collection-level attribute or an `?include=`.
:::

## Collection-level computed attributes

Declare aggregates with `collectionComputedAttributes`. Each entry receives a context object and is evaluated **once per request** — and unlike record attributes, these **are awaited**, so they can hit Prisma directly.

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  collectionComputedAttributes: {
    activeUsersCount: (ctx) =>
      ctx.delegate.count({ where: { ...ctx.where, status: 'active' } }),
    blockedUsersCount: (ctx) =>
      ctx.delegate.count({ where: { ...ctx.where, status: 'blocked' } }),
    averageAge: async (ctx) => {
      const result = await ctx.delegate.aggregate({ where: ctx.where, _avg: { age: true } });
      return result._avg.age;
    },
  },
},
```

The context is:

| Field | What it is |
|---|---|
| `where` | The fully scoped Prisma filter — spread it into your own `where` |
| `delegate` | The Prisma delegate for this model (e.g. `prisma.user`) |
| `prisma` | The Prisma client, for aggregates that reach other models |
| `user` | The current authenticated user |
| `organization` | The current organization, in a tenant group |
| `modelSlug` | The registered slug |

Declaring at least one attribute makes a dedicated endpoint respond for the model:

```bash
# Pick what you need
GET /api/users/computed?attributes=activeUsersCount,blockedUsersCount
```

```json
{
  "data": {
    "activeUsersCount": 128,
    "blockedUsersCount": 4
  }
}
```

Omitting `?attributes=` returns **every declared attribute the policy allows**:

```bash
GET /api/users/computed
```

```json
{
  "data": {
    "activeUsersCount": 128,
    "blockedUsersCount": 4,
    "averageAge": 34.2
  }
}
```

### The `where` each callable receives

`ctx.where` describes the **same set `index` would have returned**, with these already applied:

- the organization scope (multi-tenancy, including `owner` chains)
- the model's scopes
- the named scope from `?scope=`, or the model's `defaultScope`
- `?filter[...]=`
- `?search=`
- the soft-delete filter (`deletedAt: null`) when the model has soft deletes

Sorting, sparse fieldsets, includes and pagination are deliberately **not** applied — they don't change an aggregate, and a `select` would break `count`.

That means aggregates can describe exactly what the user is currently looking at:

```bash
# Counts across the whole (tenant-scoped) users table
GET /api/users/computed?attributes=activeUsersCount

# Counts restricted to one team — matches GET /api/users?filter[teamId]=3
GET /api/users/computed?attributes=activeUsersCount&filter[teamId]=3

# Counts within a search result
GET /api/users/computed?attributes=activeUsersCount&search=ada

# Counts within a named scope
GET /api/users/computed?attributes=activeUsersCount&scope=recentlyActive
```

Each attribute gets its **own shallow copy** of `where`, so one callable's mutations can never leak into the next one's result.

:::danger Always spread the `where` you are handed
The framework guarantees `ctx.where` is already organization-scoped — including for `owner`-chain models that reach their organization through a relation rather than an `organizationId` column. That guarantee is void the moment your callable ignores it:

```ts
// ❌ Bad — a fresh filter. The org scope is gone; this counts EVERY tenant's rows.
activeUsersCount: (ctx) => ctx.delegate.count({ where: { status: 'active' } }),

// ✅ Good — spread the scoped filter you were given
activeUsersCount: (ctx) => ctx.delegate.count({ where: { ...ctx.where, status: 'active' } }),
```

The same applies to `ctx.prisma`: a query you build from scratch on another model carries **no** tenant scoping. This is the same failure mode as a named scope that ignores its input — silent cross-tenant disclosure that no test of yours will catch unless it seeds two organizations.
:::

### Authorization

The endpoint is gated by the model policy's `viewAny()` — the same gate as `index`. A user who cannot list users cannot read aggregates about them.

## Policy control

Both new kinds go through the **same gate as database columns**:

```ts title="src/policies/UserPolicy.ts"
export class UserPolicy extends ResourcePolicy {
  override resourceSlug = 'users';

  override permittedAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'admin', org)) return ['*']; // everything

    // Non-admins may read these fields AND these computed attributes
    return ['id', 'name', 'email', 'avatarUrl', 'activeUsersCount'];
  }

  override hiddenAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'admin', org)) return [];
    return ['blockedUsersCount']; // never visible to non-admins
  }
}
```

Rules:

- `permittedAttributesForShow()` returning the default `['*']` allows every declared attribute.
- Any other return value is a **whitelist** — a computed attribute must be listed by name to be readable.
- `hiddenAttributesForShow()` is a blacklist and always wins.

A name that is not declared and a name the policy denies produce the **same 403**, so the endpoint never reveals which attributes a model declares. Prototype keys such as `constructor` are rejected the same way rather than invoked.

When `?attributes=` is omitted, denied attributes are simply left out of the response rather than erroring.

## Disabling the endpoint

Add `'computed'` to `exceptActions` to keep the declarations but disable the route:

```ts
users: {
  model: 'user',
  exceptActions: ['computed'],
  collectionComputedAttributes: { /* … */ },
},
```

A model that declares **no** collection attributes returns **404** for `GET /{resource}/computed`.

## From the React client

```tsx
import { useModelIndex, useModelComputedAttributes } from '@rhino-dev/rhino-react';

function UserDashboard() {
  // One request, one evaluation per attribute
  const { data: stats } = useModelComputedAttributes('users', {
    attributes: ['activeUsersCount', 'blockedUsersCount'],
  });

  // Per-row opt-in attributes
  const { data: users } = useModelIndex('users', {
    computedAttributes: ['avatarUrl'],
  });

  return <h2>{stats?.activeUsersCount} active</h2>;
}
```

See [React — Querying](../react/querying) for the full client API.

## Backward compatibility

This feature is entirely additive:

- Existing `computedAttributes` declarations behave exactly as before.
- `index`/`show`/`trashed` responses are unchanged unless a client sends `?computed_attributes=`.
- `GET /{resource}/computed` 404s for models that declare nothing, exactly as an unknown id would.

## Related

- [Models](./models) — model registration options
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Custom Controllers](./custom-controllers) — when you genuinely need one
