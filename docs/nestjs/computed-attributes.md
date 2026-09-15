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

All three are declared on the model's registration in `rhino.config.ts`, and all three are subject to the same policy filtering as database columns. None of them require a custom controller. The two opt-in kinds can also declare [parameters the client fills in](#attributes-with-parameters), so one declaration covers a date window, a status or a currency rather than a family of near-identical attributes.

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

An entry can also declare [parameters](#attributes-with-parameters), so `ticketsSince` takes the date from the client instead of being frozen into the declaration.

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

Omitting `?attributes=` returns **every declared attribute the policy allows**, minus any that [declares a required parameter](#attributes-with-parameters) and so cannot be evaluated without one:

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

## Attributes with parameters

Both opt-in kinds take arguments the client fills in. Without them, anything that needs to vary has to be baked into its own attribute — `revenueLast30Days`, `revenueLast90Days`, `revenueYtd` — or pushed out to the client as a filter over a field you then have to expose. Declare the parameter names next to the callable, and the bound values arrive as a **named object**:

```ts title="src/rhino.config.ts"
users: {
  model: 'user',

  recordComputedAttributes: {
    // No parameters — unchanged
    avatarUrl: (record, _user) => buildSignedUrl(record.avatarPath),

    ticketsSince: {
      params: ['since', 'status'],
      optionalParams: ['status'],
      using: (record, _user, args) => countTickets(record, args!.since, args!.status),
    },
  },

  collectionComputedAttributes: {
    activeUsersCount: (ctx) =>
      ctx.delegate.count({ where: { ...ctx.where, status: 'active' } }),

    // One parameter
    signupsSince: {
      params: ['since'],
      using: (ctx) =>
        ctx.delegate.count({ where: { ...ctx.where, createdAt: { gte: ctx.args!.since } } }),
    },

    // Two, both required
    revenue: {
      params: ['from', 'to'],
      using: async (ctx) => {
        const result = await ctx.delegate.aggregate({
          where: { ...ctx.where, createdAt: { gte: ctx.args!.from, lte: ctx.args!.to } },
          _sum: { total: true },
        });
        return result._sum.total;
      },
    },
  },
},
```

A **record** callable receives the arguments as its third parameter, `(record, user, args)`. A **collection** callable reads them from `ctx.args`, alongside `ctx.where` and `ctx.delegate` — the same place a named scope reads them. Both carry the same shape, so the mental model is one thing: your arguments arrive as a named object.

Arguments travel in the bracket form — `?attributes[...]` on `/computed`, `?computed_attributes[...]` (or the `?computedAttributes[...]` alias) on `index`, `show` and `trashed`. The three shapes are identical on every one of them:

```bash title="terminal"
# One parameter: a bare value binds to the single declared name
curl -g '/api/users/computed?attributes[signupsSince]=2026-01-01'

# Several: every argument is named
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'

# An optional parameter may simply be left out
curl -g '/api/users?computed_attributes[ticketsSince][since]=2026-01-01'

# A no-argument attribute joins the request with an empty value
curl -g '/api/users/computed?attributes[activeUsersCount]=&attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'
```

```json
{
  "data": {
    "activeUsersCount": 128,
    "revenue": 48210.5
  }
}
```

:::tip `curl` needs `-g`
`curl` treats `[` and `]` as glob characters. Pass `-g` (or `--globoff`) for any URL carrying the bracket form.
:::

The comma list and the bracket form cannot be mixed in one request, because they share a single query key. That is what the empty value on `activeUsersCount` above is for: it is how an attribute that takes no arguments joins a request that also carries one that does. On its own, `?attributes=activeUsersCount` is still the way to write it.

:::info Bracket syntax needs the extended query parser
`?attributes[revenue][from]=a` relies on Express parsing bracket syntax into a nested object, exactly as `?filter[status]=draft` and `?scope[window][from]=a` do. Express 4, which `@nestjs/platform-express` 10 ships, does that by default. On the **simple** parser (Express 5's default), turn the extended one back on:

```ts title="src/main.ts"
const app = await NestFactory.create(AppModule);
app.set('query parser', 'extended');
```
:::

### How arguments bind

Arguments bind **by name**, never by position, so the order of the keys in the URL does not matter. A positional list (`?attributes[revenue][]=a`) is refused, and so is a bare value for an attribute with more than one parameter: two arguments are never guessed at from one value.

The object your callable receives is keyed by **declared parameter name**. An optional parameter the client omitted is simply **absent** — check it with `args.status === undefined`, not against `null`. `args` is typed optional, so a parameterised callable reads it as `args!.since` / `ctx.args!.from`.

A collection callable **always** receives an object on `ctx.args`, `{}` when nothing was bound, so a legacy `(ctx) => …` entry is unaffected. A record callable likewise receives `{}` rather than `undefined` when it declares no parameters.

The value `true` or `false` (in any case) arrives as a real boolean, so a check inside the callable cannot be fooled by the string `"false"`. Nothing else is coerced: `"5"` arrives as the string `"5"`.

An attribute that declares no parameters never receives client input. Sending any is a `403`, which means an attribute written without arguments can never be handed some later by a URL.

Unlike [named scopes](./querying#combining-scopes), there is **no cap** on how many attributes one request may name. Arguments change what each attribute computes, never how many rows the request touches.

:::note Record callables stay synchronous
Declaring parameters does not change this. `using` on a `recordComputedAttributes` entry still runs inside synchronous serialization and is **not awaited** — a parameterised per-row attribute must still do in-memory work only. Collection callables **are** awaited, so those may be `async`.
:::

### What counts as a parameter spec

A declared value is a parameter spec **only** when it is a plain object carrying at least one of `params`, `optionalParams` or `using`. Everything else keeps the meaning it has always had — a function is invoked, and every other value is serialized as a literal:

```ts
version: 3,                               // literal — serialized as 3
tags: ['billing', 'beta'],                // literal — serialized as the list
fullName: (record, _user) => record.name, // function, no parameters
revenue: { params: ['from', 'to'], using: (ctx) => … },  // a spec
```

There is deliberately no string or array shorthand here, unlike `namedScopes` — an array is already a valid literal declaration, and reading it as a parameter list would silently change what an existing registration returns.

An `optionalParams` entry that is not also in `params` is ignored. A spec with no `using` resolves to `null`.

:::warning `params`, `optionalParams` and `using` are reserved
Inside a computed-attribute declaration, an object carrying any of those three keys is read as a parameter spec. A literal object of your own that happens to use one of them as a data key changes meaning — rename the key, or return the value from a function instead.

Both registration maps are typed loosely enough to accept legacy literal declarations, so TypeScript will **not** catch a misspelled spec key. `optionalParam` (singular) type-checks and is silently ignored at runtime — the parameter stays required.
:::

Attribute names and parameter names are both looked up as **own properties**, so a prototype member is never reached and never invoked. What you observe depends on the key, because Express's query parser strips `__proto__` before the request arrives:

```bash title="terminal"
# 'constructor' reaches the lookup and is refused as undeclared
curl -g '/api/users/computed?attributes[constructor]='
# 403 { "code": "FORBIDDEN", "message": "Computed attribute 'constructor' is not allowed" }

# '__proto__' is stripped by the parser, leaving an empty selection
curl -g '/api/users/computed?attributes[__proto__]='
# 200 { "data": {} }
```

The same stripping applies one level down: `?attributes[revenue][__proto__]=1` loses the inner key and so reports the parameter that is actually missing — `Computed attribute 'revenue' requires parameter 'from'` — rather than naming `__proto__`.

:::note A documented divergence from Laravel and Rails
PHP and Ruby keep `__proto__` as an ordinary key, so those stacks answer the same URL with `403 Computed attribute '__proto__' is not allowed`. NestJS returns `200 {"data": {}}`. Neither invokes anything; the difference is only in what the parser hands the framework.
:::

### Arguments are client input

:::danger Bind arguments into the filter — never into raw SQL or field names
A parameter value comes from the URL. Treat it exactly as you would a request body: as a **value** inside a Prisma filter, never as an identifier or a fragment of a statement.

```ts
// ❌ Bad — the argument names the field. The client now chooses what the
//          query reads, including fields the policy hides from them.
total: {
  params: ['field'],
  using: (ctx) => ctx.delegate.aggregate({ where: ctx.where, _sum: { [ctx.args!.field]: true } }),
},

// ❌ Bad — the argument is interpolated into raw SQL. This is an injection point.
revenue: {
  params: ['from'],
  using: (ctx) => ctx.prisma.$queryRawUnsafe(
    `SELECT SUM(total) FROM "User" WHERE "createdAt" >= '${ctx.args!.from}'`,
  ),
},

// ✅ Good — the argument is a value inside the scoped filter, and nothing else
revenue: {
  params: ['from', 'to'],
  using: (ctx) => ctx.delegate.aggregate({
    where: { ...ctx.where, createdAt: { gte: ctx.args!.from, lte: ctx.args!.to } },
    _sum: { total: true },
  }),
},
```

Arguments reach your callable **after** the organization scope, the model's scopes, `?scope=`, `?filter[]=` and `?search=` have narrowed `ctx.where`, so spreading it and adding a predicate can only narrow further. A raw query or a client-chosen field steps outside that guarantee.
:::

### The 403 contract

An undeclared name and a name the policy denies produce the **same** message, so the endpoint never reveals which attributes a model declares:

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenu][from]=2026-01-01'
# 403 { "code": "FORBIDDEN", "message": "Computed attribute 'revenu' is not allowed" }
```

Argument mistakes are refused the same way, and these messages **do** name the parameter, because they are only ever reached after the attribute itself was allowed for this user:

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01'
# 403 "Computed attribute 'revenue' requires parameter 'to'"

curl -g '/api/users/computed?attributes[revenue][nope]=1'
# 403 "Computed attribute 'revenue' does not accept parameter 'nope'"

curl -g '/api/users/computed?attributes[revenue]=a,b'
# 403 "Computed attribute 'revenue' requires named parameters"

curl -g '/api/users/computed?attributes[activeUsersCount]=2026-01-01'
# 403 "Computed attribute 'activeUsersCount' does not accept arguments"
```

A parameter that is structurally impossible to read as a selection at all — a positional list such as `?attributes[]=x`, or the same key repeated — is refused before any name is looked at:

```bash title="terminal"
curl -g '/api/users/computed?attributes[]=revenue'
# 403 { "code": "FORBIDDEN", "message": "Computed attributes are not allowed" }
```

The declared-name check and the policy check both run **before** any argument is bound. An argument error is therefore only ever visible for an attribute the caller was already allowed to name, and the specific messages leak nothing about the ones they were not.

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
- The comma list — `?attributes=a,b` and `?computed_attributes=a,b` — is unchanged. Each name is read as "no arguments", which is exactly what an attribute without parameters expects.
- A declaration that is not an object carrying `params`, `optionalParams` or `using` keeps its existing meaning: functions are invoked with the signature they already had, and every other value is serialized as a literal.

A bare `GET /{resource}/computed` returns every attribute the policy allows, **minus any that declares a required parameter** — those are skipped silently rather than returning a 403:

```bash title="terminal"
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

`revenue` and `signupsSince` are absent because neither can be evaluated without arguments. An attribute whose parameters are **all** optional is still evaluated, with none supplied. This is what keeps a client that asks for everything working after you add a parameterised attribute to a model.

## Related

- [Models](./models) — model registration options
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Custom Controllers](./custom-controllers) — when you genuinely need one
