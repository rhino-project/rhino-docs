---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for NestJS, newest first.

## 4.10.0

**Validation moves off the registration and into a request class that can see the whole request.** A
`validation` / `validationStore` / `validationUpdate` schema is static: it cannot see the current user,
the organization, the route group or the record being updated, so anything conditional had to go into a
role-keyed `Record<string, ZodSchema>` resolved behind your back. A model may now register a request
class per action, each owning the entire shape contract for that action.

```ts title="src/requests/post-store.request.ts"
import { z } from 'zod';
import {
  ResourceRequest,
  resolveUserRoleSlug,
  type ResourceRequestContext,
} from '@rhino-dev/rhino-nestjs';

export class PostStoreRequest extends ResourceRequest {
  override authorize(ctx: ResourceRequestContext): boolean {
    return ctx.routeGroup !== 'public';
  }

  override prepare(input: Record<string, any>): Record<string, any> {
    return { ...input, title: String(input.title ?? '').trim() };
  }

  rules(ctx: ResourceRequestContext) {
    const isAdmin = resolveUserRoleSlug(ctx.user, ctx.organization?.id) === 'admin';

    return z.object({
      title: z.string().max(255),
      status: isAdmin ? z.string() : z.literal('draft'),
      categoryId: z.number().int(),
    });
  }
}
```

```ts title="src/rhino.config.ts"
posts: { model: 'post', requests: { store: PostStoreRequest, update: PostUpdateRequest } },
```

```bash title="terminal"
curl -X POST '/api/acme/posts' -d '{"title":"","status":"published","categoryId":4}'
```

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": { "errors": { "status": ["Invalid literal value, expected \"draft\""] } }
}
```

- **Registration is explicit and per action** — `ModelRegistration.requests?: { store?, update? }`.
  There is no filesystem discovery, so nothing is ever picked up by accident, and a model may register
  only `store`. A non-class value is rejected at boot.
- **The context is a `ResourceRequestContext` argument** — `user`, `organization`, `routeGroup`,
  `action`, `record`, `input`. `action` is always `'store'` / `'update'`, never `'create'`, even inside
  `POST /nested`. `record` is the pre-update row from the organization-scoped query the update already
  performed.
- **`rules()` and `authorize()` may be async.** The request-class path is a separate async method;
  `ValidationService.validateForAction` stays synchronous, so nothing on the model-level path changed.
- **There is no `messages()` and no `after()` hook** — Zod carries messages in the schema, and
  `.superRefine()` covers cross-field checks.
- **`prepare()` runs after the policy's forbidden-field gate and before `authorize()`**, so it can never
  launder a denied field past the policy, and `authorize()` always sees normalized input.
- **`authorize()` returning false is a `403` byte-identical to a policy denial** —
  `{"code":"FORBIDDEN","message":"This action is unauthorized."}`, hard-coded.
- **The parse output is the write payload.** Zod object schemas strip unknown keys, so a field with no
  rule is dropped, not persisted. Rhino does **not** call `schema.pick()` with the policy's
  `permittedAttributesForCreate/Update`, and does **not** relax an update — an update class marks its
  own fields `.optional()`.
- **`verifyTenantFks` runs on the request class's output**, unchanged, and still answers
  `422 CROSS_TENANT`.
- **Nested operations use the same classes**, per operation. The operation's data is reference-resolved
  before the request class sees it, so `ctx.input` holds real values rather than `$N.field`
  placeholders, and `NestedExecContext` now carries `routeGroup` so a class sees the same group inside
  `POST /nested` as it does on the top-level endpoints.
- **A request class with constructor dependencies must be a provider.** Rhino resolves it through
  `ModuleRef` and falls back to `new Cls()`, which would leave injected services `undefined`; it now
  logs a warning when that happens to a class that declares constructor parameters.
- **The policy's forbidden-field gate was extracted** into `ValidationService.checkForbiddenFields` so
  both paths share it. `validateForAction` calls it first and is otherwise untouched.
- **`npx rhino generate` gained a fourth menu entry, `request`**, which asks for store, update or both,
  writes `src/requests/{name}-{action}.request.ts`, and prints the registration line to paste into
  `src/rhino.config.ts`.
- **Blueprint still generates `validation` schemas** into new resource definitions. Generated code keeps
  working because the model-level path is still supported.

Full documentation: [Validation](./validation).

### Fixes

Four bugs found while verifying the release against a live server, all of which predate 4.10.0:

- **An update whose validated payload is empty returned `404` instead of `200`.** `ResourceService.update`
  built an `updateMany` with empty `data`, which Prisma reports as `count: 0` — indistinguishable from a
  missing row. A request class makes this easy to hit, because every field the client sent can legitimately
  be dropped by the fail-closed write-payload rule. The row is now resolved with the same organization-scoped
  `where` and returned unchanged. A genuinely missing or cross-tenant row still resolves to `null`, so the
  `404` for those is unaffected.
- **`POST /nested` answered `UNKNOWN_RESOURCE: "Unknown resource: nested"`.** `GlobalController` owns the
  catch-all `/:modelSlug` routes, and Nest registers routes in the order the `controllers` array lists them,
  so `POST /:modelSlug` was shadowing the literal `POST /nested`. `GlobalController` is now registered last,
  behind `AuthController`, `InvitationController` and `NestedController`.
- **Every nested request against a real `PrismaClient` threw `Cannot read properties of undefined (reading '_engineConfig')`.**
  `PrismaService.$transaction` invoked the client's `$transaction` as a detached reference; a real client reads
  `this._engineConfig` inside it. It is now called on the client. The in-memory test double is a plain closure,
  which is why this only ever appeared over HTTP.
- **SECURITY — `POST /nested` did not tenant-scope indirectly owned models.** See below.

:::danger Security fix: cross-tenant writes through `POST /nested`
`NestedService` scoped its `update` and `delete` operations — and the request-class `record` lookup — only for
models with a direct `organizationId`. A model that reaches its organization through an `owner` chain
(`task → project → organization`) ran with **no tenant filter at all**, so an authenticated member of one
organization could update or delete another organization's records by id through `POST /nested`. The
single-record `PUT` and `DELETE` endpoints were never affected; `ResourceService` has always applied the full
filter.

Nested operations now build the same filter `ResourceService.orgFilter` does:

```ts
// ❌ Before — only the direct case, so an owner-chained model was unscoped
if (reg.belongsToOrganization && ctx.organization) where.organizationId = ctx.organization.id;

// ✅ After — the resolved owner path becomes a nested relation filter
//    task → project → organization  ⇒  { project: { organizationId } }
const where = { id: op.id, ...this.orgScope(op.model, ctx) };
```

**Upgrade if you expose `POST /nested` on any model that reaches its organization through `owner` rather than
a direct `organizationId` column.** A model with no tenant context, or an unresolvable chain, is still
unscoped — exactly as it is on the single-record endpoints.
:::

**Backward compatibility.** `validation`, `validationStore` and `validationUpdate`, including the
role-keyed form, are **deprecated but completely unchanged**, and are used for every model and action
with no request class. There is no runtime deprecation warning. No route, URL, query parameter, status
code or error envelope changed — `RhinoException`'s `{code, message, details}` envelope is exactly what
it was. `rhino-react` is unaffected and needs no upgrade. The deprecated path will be removed in **5.0**.

:::warning Upgrade action: none
`npm install @rhino-dev/rhino-nestjs@^4.10` and you are done. No config migration, no database change,
no route change. See [Upgrading — 4.9 → 4.10](./upgrading#4-9-4-10).
:::

## 4.9.0

**Computed attributes take arguments, the same way scopes do.** A computed attribute used to be a
name and nothing else, so anything the client needed to vary had to be baked into its own attribute --
`revenueLast30Days`, `revenueLast90Days`, `revenueYtd` -- or pushed out to the client as a filter over
a field you then had to expose. An attribute can now declare parameters, and read the bound values as
a named object:

```ts title="src/rhino.config.ts"
collectionComputedAttributes: {
  activeUsersCount: (ctx) => ctx.delegate.count({ where: { ...ctx.where, status: 'active' } }),
  revenue: {
    params: ['from', 'to'],
    using: (ctx) => ctx.delegate.aggregate({
      where: { ...ctx.where, createdAt: { gte: ctx.args!.from, lte: ctx.args!.to } },
      _sum: { total: true },
    }),
  },
},
```

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'
```

```json
{ "data": { "revenue": 48210.5 } }
```

The same three bracket forms work on `?computed_attributes=` (and its `?computedAttributes=` alias)
for per-record attributes on `index`, `show` and `trashed`. A record callable receives the arguments
as a third positional parameter, `(record, user, args)`; a collection callable reads `ctx.args`, the
same place a named scope reads them.

- Arguments bind **by name** into an object keyed by declared parameter name. A bare value binds to
  the single declared parameter; a positional list is refused; `"true"` / `"false"` arrive as real
  booleans.
- An optional parameter the client omitted is simply **absent** from the object -- check it with
  `=== undefined`. A callable that declares no parameters still receives `{}`, so existing entries are
  unaffected.
- Record callables remain **synchronous**. Declaring parameters does not change that: a parameterised
  per-row attribute still must not be `async`. Collection callables are awaited, as before.
- The declared check and the policy check run **before** any argument is bound, so an undeclared name
  and a policy-denied one keep returning the same `Computed attribute 'x' is not allowed`. Attribute
  and parameter names are both looked up as own properties, so a prototype member is never invoked:
  `attributes[constructor]=` is refused as undeclared, while `attributes[__proto__]=` is stripped by
  Express's query parser and simply yields an empty selection, `200 {"data": {}}`. Laravel and Rails
  keep that key and answer `403` -- a parser difference, not a behavioral one.
- Argument mistakes are `403`: `requires parameter 'to'`, `does not accept parameter 'nope'`,
  `requires named parameters`, `does not accept arguments`. A structurally impossible selection --
  `?attributes[]=x`, or the same key repeated -- is `Computed attributes are not allowed`.
- A bare `GET /{resource}/computed` returns every policy-allowed attribute **minus** any that declares
  a required parameter; those are skipped silently rather than erroring.
- The Postman export emits the bracket form for parameterised attributes, and leaves them out of the
  combined multi-attribute request, which would otherwise ship a guaranteed 403.

`RecordComputedAttributeSpec` and `CollectionComputedAttributeSpec` are exported alongside the other
config interfaces. Note that both registration maps stay loosely typed so legacy literal declarations
keep type-checking -- which means a misspelled spec key such as `optionalParam` will **not** be caught
by the compiler, and the parameter stays required at runtime.

Two things differ from named scopes on purpose: there is **no shorthand declaration form** -- only an
object carrying `params`, `optionalParams` or `using` is a spec, because a bare array is already a
valid *literal* declaration -- and there is **no per-request cap**.

**The React client** ships the matching form in `@rhino-dev/rhino-react` 4.6.0. `computedAttributes`
and `useModelComputedAttributes`'s `attributes` now accept an object as well as an array --
`{ revenue: { from, to }, activeUsersCount: null }` -- serialized to the bracket URL. `ScopeSelection`
is also now genuinely exported from the package entry point; 4.5.0 documented it but only exported it
from the types module.

Everything that worked before works unchanged: `?attributes=a,b` and `?computed_attributes=a,b` parse
exactly as they did, a declaration that is not a spec object keeps its existing meaning, the serializer
context gained a separate `computedAttributeArgs` channel rather than changing the meaning of
`computedAttributes`, and every scope error string is byte-identical -- scopes and computed attributes
now share one argument binder, with the noun injected.

No upgrade step beyond the dependency bump; routes are registered from inside the library.

## 4.8.1

**The named-scope cap is configurable.** How many scopes one request may combine is now the root
`maxScopesPerRequest` key, defaulting to the same 3 as before:

```ts title="src/rhino.config.ts"
RhinoModule.forRoot({
  maxScopesPerRequest: 3,
  models: { /* ... */ },
});
```

A value below 1 is ignored rather than locking every scope out of every request.

The [Combining scopes](./querying#combining-scopes) docs now also explain what the cap is protecting
you from, with a worked example: two `some` filters on the same relation, contributed by two
different scopes, are two independent existence checks -- so a row can satisfy them with two
different related records, which is rarely what the caller meant.

## 4.8.0

**Named scopes take arguments.** A scope used to be a name and nothing else, so anything the client
needed to vary had to be expressed as a filter -- which meant exposing the column and hoping the
client composed the predicate correctly. A scope class can now declare the parameters the client
fills in, and read the bound values from `ctx.args`:

```ts
export class WindowScope implements RhinoNamedScope {
  static params = ['from', 'to'];
  static optionalParams = ['to'];

  apply(ctx: ScopeContext) {
    return { createdAt: { gte: ctx.args!.from, lte: ctx.args!.to } };
  }
}
```

```bash
GET /api/routes?scope[since]=2026-01-01
GET /api/routes?scope[window][from]=2026-01-01&scope[window][to]=2026-02-01
```

Arguments bind by name. `?scope=name` still works exactly as before, and a scope that declares no
parameters still never receives client input: sending any is a 403.

Up to three scopes may be combined in the bracket form, applied in the order the URL lists them. The
two forms cannot be mixed in one request, since they share the `scope` query key -- write a
no-argument scope as `?scope[archived]=` when combining it with one that takes arguments.

**Policies choose which scopes a user may select.** The new `permittedScopes(user, org?)` returns
`['*']` by default, so nothing changes until you override it. A denied scope and an undeclared one
return the same message, so the endpoint never reveals which scopes a model has.

**Attribute permissions now gate filters, sorts and search.** This closes a real leak. Hiding an
attribute in a policy only affected serialization, so a hidden column stayed usable as a query
predicate: `?filter[salary]=300000` never printed a salary but told the caller whose salary it was,
and `?sort=-salary` leaked the whole ordering. Both now return 403. `?search=` names a term rather
than a column, so it simply skips the columns this user may not see, and returns nothing when all of
them are hidden. A column the model never allowlisted is still ignored rather than refused, and the
model's own `defaultSort` is unaffected. A dotted relation field (`author.name`) is not gated: the
related model's policy is not reachable from the query builder, so gate it in that model's
`allowedSearch`.

## 4.7.3

**The no-request path, pinned.** 4.7.2 made the tenant boundary a property of the route group. On
Laravel and Rails that left code with no request unable to reach a non-tenant group, and 4.7.3 adds an
explicit `inRouteGroup()` / `in_route_group` builder there.

NestJS needs no such API: `ResourceScopeService` has always taken its context explicitly, so a queued
job or a script already names the group in the context it builds — the same `routeGroup` field a
controller copies from `req.__routeGroup`:

```ts
// No request anywhere: this is the whole context.
await scope.count('tasks', { user: operator, routeGroup: 'admin' });
```

This release adds test coverage pinning that behavior — a hand-built job context spanning every
organization, and the same context naming a tenant group still failing closed — so what the docs
promise cannot regress. The version is bumped to keep the three stacks in lockstep; there is no
library change.

### How to update

```bash
npm install @rhino-dev/rhino-nestjs@^4.7.3
```

Nothing to change, and nothing behaves differently from 4.7.2. In a back-office job, build the context
with `routeGroup: '<group>'` for a group already declared `tenant: false` — see
[Route Groups — Tenant Boundary](./route-groups#tenant-boundary). Jobs scoped to one tenant keep
passing `ctx.organization`.

See [Multi-Tenancy — Naming the group where there is no request](./multi-tenancy#naming-the-group-where-there-is-no-request).

## 4.7.2

**A tenant boundary is a property of a route group, not of the app.** `ResourceScopeService` fails
closed: an org-scoped model queried with no `ctx.organization` throws `403 TENANT_CONTEXT_REQUIRED`
rather than returning every tenant's rows. That is right for a tenant app and wrong for a back office,
where operators are *meant* to see every organization — and until now there was no way to say so,
which pushed exactly the code that most needs scoping back onto raw Prisma queries.

The boundary is now declared per route group, reusing the `tenant` key `RouteGroupConfig` already
carried for membership:

```ts title="src/rhino.config.ts"
routeGroups: {
  tenant: { prefix: ':organization', middleware: [ResolveOrganizationMiddleware], models: '*' },
  admin:  { prefix: 'admin', tenant: false, models: [] }, // spans every organization
},
```

`ResourceContext` gains a `routeGroup`. `RouteGroupMiddleware` already puts the group on every request
as `req.__routeGroup`, so a custom controller passes it straight through:

```ts title="src/admin/admin-dashboard.controller.ts"
@Get('dashboard')
async summary(@Req() req: any) {
  const ctx = { user: req.user, routeGroup: req.__routeGroup };
  return { tasks_total: await this.scope.count('tasks', ctx) }; // every organization
}
```

In a `tenant: false` group the resolver applies no organization filter and does not throw. The tenant
group in the same app is untouched and keeps failing closed.

**The predicate is deliberately strict.** Only a group that explicitly declares `tenant: false` opts
out — unlike `isTenantGroup`, which answers a membership question and treats the conventional `public`
group as org-less. An unknown group, a context with no `routeGroup`, a `public` group, and any code
with no request at all all keep failing closed: an unauthenticated route must never silently read
every tenant's rows.

**`createTenantRouteRewrite` now reserves non-tenant prefixes.** The prefix of every group declared
`tenant: false` is added to the rewrite's reserved segments, so `/api/admin/dashboard` is never
mistaken for an organization slug and rejected as an unknown tenant. Declaring the group is enough;
no `reservedSegments` option is needed.

Nothing else is relaxed: model `scopes`, named scopes, policies, an explicit `ctx.organization`, and
CRUD through `GlobalController` all behave exactly as before. The 403 message now names both ways out.

### How to update

```bash
npm install @rhino-dev/rhino-nestjs@^4.7.3
```

Nothing else is required — a group with no `tenant` key keeps today's behavior, and the resolver still
fails closed everywhere it did before.

1. **For a back office**, add `tenant: false` to its route group and pass
   `routeGroup: req.__routeGroup` in the `ctx` your controllers build. Passing the context without it
   keeps the old fail-closed behavior, so this is opt-in per call site.
2. **If you asserted on the 403 message text**, it now continues past "requires an organization
   context" with the remedy. The `TENANT_CONTEXT_REQUIRED` code is unchanged.
3. No Prisma migration, no config regeneration.

See [Multi-Tenancy — Route Groups Without a Tenant Boundary](./multi-tenancy#route-groups-without-a-tenant-boundary),
[Route Groups — Tenant Boundary](./route-groups#tenant-boundary), and
[Custom Controllers — Fail Closed](./custom-controllers#fail-closed).

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

### How to update

```bash
npm install @rhino-dev/rhino-nestjs@^4.7.3
```

Routes are registered from inside the library by `applyRhinoRouting()`, so `/computed` is served as
soon as a registration declares collection attributes — there is nothing to re-generate.

## 4.6.1

**Security — `owner` now enforces cross-tenant isolation.** Registrations that declare `owner` (models without a direct `organizationId`, e.g. `tasks: { owner: 'project' }`) are now organization-scoped at runtime on every query — index, show, update, destroy, trashed, restore, and force-delete. The ownership chain is resolved once at boot (single or multi-hop, e.g. comment → task → project → organization) and applied as a nested Prisma filter such as `{ project: { organizationId } }`. Previously `owner` was documentation-only and these models leaked across tenants. Upgrading is strongly recommended for multi-tenant apps.

Details:

- `owner` accepts the Prisma relation field name (`'project'`), a dot-notated chain (`'task.project'`), or the legacy FK-column form (`'projectId'`).
- Unresolvable values (unknown model, cycle, dead-end chain) log a clear warning at boot and leave the model unscoped — same behavior as before, so a stale `owner` value cannot break an upgrade.
- `Rhino.query()` / `ResourceScopeService` fail closed (403 `TENANT_CONTEXT_REQUIRED`) for owner-chain models queried without an organization context, matching `belongsToOrganization` models.

Fully backward compatible for single-tenant apps, models without `owner`, and requests without an organization context.

### How to update

```bash
npm install @rhino-dev/rhino-nestjs@^4.7.3
```

Nothing to configure — the chain is resolved at boot from the `owner` values already in your
registrations. Watch the boot log for `owner` warnings (unknown model, cycle, dead-end chain): those
models stay unscoped, exactly as before. Multi-tenant apps should upgrade promptly, and re-check any
test that asserted a cross-tenant lookup succeeded.

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

### How to update

```bash
npm install @rhino-dev/rhino-nestjs@^4.7.3
```

Then set `routeKey` on the registrations that need it, or the global `routeKey`. Clients must switch to
the new identifier in URLs at the same time — the `:id` segment stops matching the primary key for
those models. Add a `@unique` attribute to the chosen column in `schema.prisma` and migrate.

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-nestjs/releases) for the history of earlier versions.
