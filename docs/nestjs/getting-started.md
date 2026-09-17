---
sidebar_position: 1
title: Getting Started
---

# NestJS Server -- Getting Started

Install Rhino for NestJS and go from zero to a full REST API in under 5 minutes.

:::info Start here — this page summarizes the whole library
This is the entry point for the NestJS docs. The [Feature Map](#feature-map) below is a complete
summary of every feature Rhino ships, each with its canonical declaration and a link to its deep-dive
page. If you are an AI agent picking up this codebase, read this page first — it tells you what exists
so you never hand-write something Rhino already generates.
:::

## Requirements

- Node.js 18+
- NestJS v10+ application
- Prisma (`@prisma/client`)
- npm or yarn

## Installation

```bash title="terminal"
npm install @rhino-dev/rhino-nestjs
```

Then run the interactive installer:

```bash title="terminal"
npx rhino install
```

The installer will:

- Publish the `src/rhino.config.ts` configuration helper
- Wire `RhinoModule` into your `AppModule`
- Connect your Prisma client
- Optionally enable multi-tenant support (organizations, roles)
- Optionally enable audit trail (change logging)
- Optionally set up the Claude Code skills

## The mental model

Rhino **derives your API from declarations**, not from controllers. You register a Prisma model with a
`ModelRegistration`, declare what is queryable on it, and declare who may do what in a policy. Rhino
generates the routes, applies tenant scoping, authorizes the action, builds the query, serializes the
response, and strips fields the user may not see — the same way for every model.

```
Declare (rhino.config.ts + policy)  →  Rhino generates and enforces  →  REST API
```

The practical consequence: **if you are writing a controller, check the [Feature Map](#feature-map)
first.** Counts, filters, per-role field visibility, batch writes and trash/restore all have
declarative answers already.

## Configuration

Register `RhinoModule` in your application's root module. The typical setup keeps the config in a helper (`buildRhinoConfig`) and wires it into `AppModule`:

```ts title="src/rhino.config.ts"
import { PrismaClient } from '@prisma/client';
import type { RhinoConfig } from '@rhino-dev/rhino-nestjs';

export function buildRhinoConfig(prisma: PrismaClient): RhinoConfig {
  return {
    // The consuming app's PrismaClient instance
    prismaClient: prisma as any,

    // Model registration -- slug => ModelRegistration ({ model: 'prismaDelegate', ... })
    models: {
      posts:    { model: 'post' },
      comments: { model: 'comment' },
    },

    // Route groups -- control URL prefixes, middleware, and model access
    routeGroups: {
      tenant: {
        prefix: ':organization', // Routes at /api/:organization/{slug}
        models: '*',             // All registered models
      },
    },

    // Multi-tenancy settings
    multiTenant: {
      enabled: true,
      organizationIdentifierColumn: 'slug', // 'id', 'slug', or 'uuid'
      organizationModel: 'organization',
      userOrganizationModel: 'userRole',
    },

    // Column matched by :id on member routes (default: each model's primary key)
    // routeKey: 'hashId',

    // Authentication
    auth: {
      jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
      jwtExpiresIn: '7d',
      userModel: 'user',
    },

    // Invitation system
    invitations: {
      expiresDays: 7,
      allowedRoles: null, // null = all roles, or ['admin', 'editor']
    },

    // Nested operations
    nested: {
      path: 'nested',         // Route path
      maxOperations: 50,      // Max ops per request
      allowedModels: null,    // null = all registered models
    },
  };
}
```

```ts title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import {
  RhinoModule,
  JwtAuthGuard,
  ResponseInterceptor,
} from '@rhino-dev/rhino-nestjs';
import { buildRhinoConfig } from './rhino.config';

const prisma = new PrismaClient();

@Module({
  imports: [
    RhinoModule.forRoot(buildRhinoConfig(prisma), {
      registerControllers: true,
      autoPolicyGuard: true,
      autoRouteGroupMiddleware: true,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
```

`RhinoModule.forRoot()` merges your values with sensible defaults, so you only need to specify properties you want to override. Use `RhinoModule.forRootAsync()` if the config has to be resolved via DI.

## Bootstrap

Call `applyRhinoRouting()` in `main.ts` after creating the Nest application. This registers the generated routes under the `/api` prefix:

```ts title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { applyRhinoRouting } from '@rhino-dev/rhino-nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  applyRhinoRouting(app, { prefix: 'api' });
  await app.listen(3000);
}
bootstrap();
```

## Environment Variables

Add these to your `.env` file as needed:

```env title=".env"
DATABASE_URL="postgresql://user:pass@localhost:5432/app"
JWT_SECRET="change-me-in-production"
```

## Register Your First Model

Rhino models are plain **Prisma** models. Define them in `prisma/schema.prisma` — there is no base class to extend and no decorators to add:

```prisma title="prisma/schema.prisma"
model Post {
  id             Int       @id @default(autoincrement())
  title          String
  content        String?
  status         String    @default("draft")
  userId         Int
  organizationId Int?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  author       User          @relation(fields: [userId], references: [id])
  comments     Comment[]
  organization Organization? @relation(fields: [organizationId], references: [id])

  @@map("posts")
}
```

Register it in `src/rhino.config.ts`. The slug (`posts`) becomes the URL segment and permission prefix; `model` is the Prisma client delegate name (camelCase):

```ts title="src/rhino.config.ts"
import { PostStoreRequest } from './requests/post-store.request';
import { PostUpdateRequest } from './requests/post-update.request';

models: {
  posts: {
    model: 'post',
    softDeletes: true,
    allowedFilters: ['status', 'userId'],
    allowedSorts: ['createdAt', 'title', 'updatedAt'],
    defaultSort: '-createdAt',
    allowedIncludes: ['author', 'comments'],
    allowedSearch: ['title', 'content'],
    // Validation lives in request classes — see Validation.
    requests: { store: PostStoreRequest, update: PostUpdateRequest },
  },
},
```

:::tip ModelRegistration
The object you pass per slug is a `ModelRegistration`. Every behavior — validation, soft deletes, audit trail, organization scoping, query configuration, policies, scopes — is declared here as plain fields. See [Model Configuration](./models) for the full reference.
:::

That is all you need. You now have a full REST API for posts:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/:id` | Show single record with relationships |
| `PUT` | `/api/posts/:id` | Update with validation |
| `DELETE` | `/api/posts/:id` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/:id/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/:id/force-delete` | Permanent delete |

:::tip Multi-Tenant Routes
When using a `tenant` route group with a parameterized prefix, all tenant routes are prefixed with `:organization`:

```
GET /api/:organization/posts
POST /api/:organization/posts
```

See [Route Groups](./route-groups) for configuration details.
:::

## Authentication Endpoints

Rhino also provides auth routes out of the box:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/auth/logout` | Log out |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

## Run Migrations

```bash title="terminal"
npx prisma migrate deploy
```

This applies your Prisma migrations, creating the tables for audit logs, invitations, and any model tables you have defined.

---

## Feature Map

Everything Rhino for NestJS does, in one place. Each row names the declaration you write and links to
the page that explains it in full.

### 1. The `ModelRegistration` surface

Every behavior is a plain field on the object you register per slug in `src/rhino.config.ts` — there is
no base class and no decorators. Full reference: [Models](./models).

| Field | Purpose |
|---|---|
| `model` | **Required.** The Prisma delegate name (e.g. `'post'`) |
| `policy` | A `ResourcePolicy` subclass for authorization ([Policies](./policies)) |
| `requests` | `{ store?, update? }` — the request class that validates each write action ([Validation](./validation)) |
| `validation` / `validationStore` / `validationUpdate` | **Deprecated**, removed in 5.0 — validation belongs in a request class ([Validation](./validation)) |
| `allowedFilters` | Fields usable with `?filter[field]=value` |
| `allowedSorts` / `defaultSort` | Fields usable with `?sort=`, plus the fallback sort |
| `allowedSearch` | Fields swept by `?search=` (relation dot notation allowed) |
| `allowedIncludes` | Prisma relations loadable with `?include=` |
| `allowedFields` | Fields selectable with `?fields[model]=` |
| `namedScopes` / `defaultScope` | Scopes selectable with `?scope=` (with optional declared parameters), and the one applied by default ([Querying](./querying#named-scopes)) |
| `scopes` | Always-on scope classes applied to **every** query |
| `paginationEnabled` / `perPage` | Pagination toggle (default `true`) and page size (default 25) |
| `softDeletes` | Enables trashed/restore/force-delete; requires a `deletedAt` column |
| `belongsToOrganization` / `owner` / `fkConstraints` | Tenant scoping, directly or through a parent relation |
| `hasAuditTrail` / `auditExclude` | Change logging and field exclusions |
| `hasUuid` | Treats the primary key as a string UUID |
| `additionalHiddenColumns` | Columns always stripped from responses |
| `middleware` / `actionMiddleware` | NestJS middleware for all routes, or per action |
| `exceptActions` | CRUD actions to *not* generate |
| `routeKey` | Column matched by the `:id` segment on member routes ([Route Key](./models#route-key)) |
| `computedAttributes` / `recordComputedAttributes` / `collectionComputedAttributes` | Derived values ([Computed Attributes](./computed-attributes)) |

:::warning Whitelists are the security boundary
A field not listed in an `allowed*` array is silently ignored — clients cannot filter, sort or select
by fields you didn't opt in. Adding a field to a whitelist is an authorization decision.
:::

### 2. Generated endpoints

| Method | Endpoint | Policy method | Notes |
|---|---|---|---|
| `GET` | `/api/{resource}` | `viewAny()` | Filters, sorts, search, includes, fields, pagination |
| `POST` | `/api/{resource}` | `create()` | Validated by Zod; field permissions enforced |
| `GET` | `/api/{resource}/:id` | `view()` | Not narrowed by `?scope=` |
| `PUT` | `/api/{resource}/:id` | `update()` | |
| `DELETE` | `/api/{resource}/:id` | `delete()` | Soft delete when `softDeletes: true` |
| `GET` | `/api/{resource}/trashed` | `viewTrashed()` | [Soft Deletes](./soft-deletes) |
| `POST` | `/api/{resource}/:id/restore` | `restore()` | |
| `DELETE` | `/api/{resource}/:id/force-delete` | `forceDelete()` | Permanent |
| `GET` | `/api/{resource}/computed` | `viewAny()` | Only when `collectionComputedAttributes` is declared ([Computed Attributes](./computed-attributes)) |
| `POST` | `/api/nested` | per-operation | Atomic multi-model writes ([Nested Operations](./nested-operations)) |

Auth routes ship out of the box: `POST /api/auth/login`, `…/logout`, `…/password/recover`,
`…/password/reset`, `…/register`. Invitation routes (`/api/:organization/invitations`,
`…/:id/resend`, `/api/invitations/accept`) are registered under the `tenant` route group — see
[Invitations](./invitations). `applyRhinoRouting()` in `main.ts` is what registers all of it.

Audit entries are written automatically for `hasAuditTrail` models and read from the `audit_logs`
table via Prisma — see [Audit Trail](./audit-trail).

### 3. Query parameters

All of these compose in a single request. Full reference: [Querying](./querying).

| Parameter | Example | Behavior on an unknown value |
|---|---|---|
| `?filter[field]=` | `?filter[status]=draft,published` (comma = OR) | Ignored; **403** if the policy hides the attribute |
| `?sort=` | `?sort=status,-createdAt` | Ignored; **403** if the policy hides the attribute |
| `?search=` | `?search=nest` | — |
| `?include=` | `?include=author,comments` | **403** if the user lacks index permission on the included resource |
| `?fields[model]=` | `?fields[posts]=id,title` | Ignored |
| `?page=` / `?per_page=` | `?page=2&per_page=25` | — |
| `?scope=` | `?scope=availableForDrivers`, `?scope[window][from]=a&scope[window][to]=b` | **403** if not whitelisted, not permitted by the policy, or the arguments do not match the declared parameters |
| `?computed_attributes=` | `?computed_attributes=avatarUrl` (`?computedAttributes=` is an alias), `?computed_attributes[ticketsSince][since]=a` | **403** if undeclared, denied, or the arguments do not match the declared parameters |

Pagination metadata comes back in **headers**: `X-Current-Page`, `X-Last-Page`, `X-Per-Page`,
`X-Total`.

### 4. Validation

Each model validates `store` and `update` with a **request class**, registered per action on the model:

```ts title="src/requests/post-store.request.ts"
export class PostStoreRequest extends ResourceRequest {
  override authorize(ctx: ResourceRequestContext) { return ctx.routeGroup !== 'public'; }

  // prepare() runs before the rules, so guard the type and leave anything
  // malformed for them to reject.
  override prepare(input: Record<string, any>) {
    return {
      ...input,
      title: typeof input.title === 'string' ? input.title.trim() : input.title,
    };
  }

  rules(ctx: ResourceRequestContext) {
    return z.object({
      title: z.string().max(255),
      categoryId: z.number().int(),
    });
  }
}

// src/rhino.config.ts
posts: { model: 'post', requests: { store: PostStoreRequest, update: PostUpdateRequest } },
```

`rules()` (which may be async) and `authorize()` receive the full context — `user`, `organization`,
`routeGroup`, `action`, `record` (the pre-update row) and `input`. `authorize()` returning false is a
`403` indistinguishable from a policy denial; a failed parse is a `422` with field-level errors.

**The parse output is the write payload**: a field with no rule is silently dropped, not saved. **Which
fields a role may write** still lives on the policy, and a forbidden field is a `403` before the request
class runs. See [Validation](./validation).

### 5. Authorization

Policies extend `ResourcePolicy`, which maps each action to a `{resourceSlug}.{action}` permission
(`posts.index`, `posts.store`, `posts.forceDelete`…). Wildcards: `posts.*` and `*`.

Effective permissions resolve from **three layers**, with deny always winning:

```
effective = (role ∪ granted) − denied
```

- **role** — the `OrgRolePermission` model, shared by everyone with that role in that org
- **granted** / **denied** — `userRoles.grantedPermissions` / `userRoles.deniedPermissions`
- **legacy** — the per-user list, still honored as an allow layer

`JwtAuthGuard` eager-loads `role.orgRolePermissions`, with a fallback for apps that haven't added the
relation. Run `npx rhino permissions-migrate` (`--apply` to write) to lift per-user sets into the role
layer. Full detail: [Policies](./policies).

**Attribute-level permissions** are part of the same policy:

| Policy method | Controls |
|---|---|
| `permittedAttributesForShow(user, org?)` | Read whitelist (`['*']` = all) |
| `hiddenAttributesForShow(user, org?)` | Read blacklist — always wins |
| `permittedAttributesForCreate(user, org?)` | Writable fields on create |
| `permittedAttributesForUpdate(user, org?)` | Writable fields on update |
| `permittedScopes(user, org?)` | Named scopes this user may select with `?scope=` (`['*']` = all declared) |

A hidden attribute is hidden from **queries** too: it cannot be used as a `?filter[]` or a `?sort`,
and `?search=` skips it.

### 6. Multi-tenancy

`belongsToOrganization: true` scopes every query to the current organization and sets `organizationId`
on create. A nested model instead declares `owner` — the parent relation Rhino walks to reach the
organization (enforced on all queries since 4.6.1) — and `fkConstraints` to verify foreign keys against
the current org. `ResolveOrganizationMiddleware` sets `req.organization` from the `:organization` URL
segment, matched on `id`, `slug` or `uuid`. See [Multi-Tenancy](./multi-tenancy).

### 7. Route groups

One set of models, several URL contexts — each with its own `prefix`, optional `domain`, `middleware`,
model subset, `skipAuth`, `auth` route set, lifecycle `hooks`, and `tenant` flag. `tenant` and `public`
are reserved names. See [Route Groups](./route-groups).

### 8. Data lifecycle

- **Soft deletes** — `softDeletes: true` + a `deletedAt` column; trash, restore and force-delete are
  separate endpoints with separate permissions ([Soft Deletes](./soft-deletes))
- **Audit trail** — create/update/delete/restore/force-delete logged with before/after snapshots (only
  dirty fields on update), actor and request metadata ([Audit Trail](./audit-trail))
- **Nested operations** — up to 50 create/update/delete operations in one transaction, with `$N.field`
  references between them; any failure rolls the whole batch back
  ([Nested Operations](./nested-operations))
- **Invitations** — list, create, resend, revoke and accept, with role assignment and a pluggable
  `notificationHandler` ([Invitations](./invitations))

### 9. Computed attributes

Three kinds, chosen by cost — none of them needs a controller
([Computed Attributes](./computed-attributes)):

| Kind | Field | Evaluated |
|---|---|---|
| Always-on, per record | `computedAttributes` | Every row of every read |
| Opt-in, per record | `recordComputedAttributes` | Only when the client sends `?computed_attributes=` |
| Collection-level aggregate | `collectionComputedAttributes` | Once per request, via `GET /{resource}/computed` |

All three pass through the same policy gate as database columns. Per-record entries are **not awaited** —
keep them to in-memory work and put anything that hits Prisma in a collection-level attribute.

Either opt-in kind can declare **parameters** the client fills in, so one `revenue` replaces a family
of fixed-window attributes. The bound values arrive as a named object — `ctx.args` for a collection
attribute, a third `args` parameter for a record one:

```ts
revenue: {
  params: ['from', 'to'],
  using: (ctx) => ctx.delegate.aggregate({
    where: { ...ctx.where, createdAt: { gte: ctx.args!.from, lte: ctx.args!.to } },
    _sum: { total: true },
  }),
},
```

```bash
GET /api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01
```

Arguments bind by name, `"true"`/`"false"` arrive as real booleans, and a mismatch is a `403`. A bare
`GET /{resource}/computed` skips attributes with a required parameter rather than erroring.

### 10. Custom controllers

When the shape genuinely isn't "attributes of one resource" — cross-model reports, workflows, bulk
actions — write a controller, but build its queries through `ResourceScopeService` so tenant isolation
and your global scopes still apply:

```ts
constructor(private readonly scope: ResourceScopeService) {}

const openTasks = await this.scope.count('task', ctx, { status: 'open' });
```

The context (`{ user, organization, routeGroup }`) is always **explicit** in NestJS — build it from the
request in a controller, or by hand in a job. A raw `prisma.task.count()` has no org filter and leaks
across tenants. Omitting the organization throws `403 TENANT_CONTEXT_REQUIRED` rather than leaking —
unless `ctx.routeGroup` names a route group declared `tenant: false`, where queries span every
organization on purpose. See [Custom Controllers](./custom-controllers).

### 11. Code generation & tooling

| Command | What it does |
|---|---|
| `npx rhino install` | Interactive setup: config helper, `RhinoModule` wiring, Prisma client, multi-tenancy, audit trail |
| `npx rhino generate` | Scaffold a model registration, a policy, or a scope ([Generator](./generator)) |
| `npx rhino blueprint` | Generate registrations, policies, tests and seeders from YAML specs — deterministic, no AI tokens ([Blueprint](./blueprint)) |
| `npx rhino export-types` | TypeScript interfaces for the client and mobile apps ([Export Types](./export-types)) |
| `npx rhino export-postman` | Postman collection covering every endpoint ([Postman Export](./postman-export)) |
| `npx rhino permissions-migrate` | Lift per-user permissions into the role layer (`--apply` to write) |

### 12. Request pipeline

```
Request → Middleware → Guard/Policy → Scope → Query Builder → Serialize → Attribute permissions → Response
```

Knowing which layer you're debugging is usually the whole fix. See
[Request Lifecycle](./request-lifecycle).

---

## Which tool for which problem

| You want to… | Do this — not a controller |
|---|---|
| Return a count or a sum | `collectionComputedAttributes` → `GET /{resource}/computed` |
| Add a derived field to each row | `computedAttributes`, or `recordComputedAttributes` if the client should opt in |
| Hide a field from some roles | `hiddenAttributesForShow` on the policy |
| Let clients pick a complex predefined query | `namedScopes` + a `RhinoNamedScope` class |
| Always restrict rows (tenancy, visibility) | `scopes` / `belongsToOrganization` — never `defaultScope` |
| Create related records atomically | `POST /api/nested` with `$N.id` references |
| Expose the same models to a second app | A [route group](./route-groups) |
| Serve records at a non-`id` URL | `routeKey` |
| Restrict who can write a field | `permittedAttributesForCreate` / `…ForUpdate` |

## Documentation map

| Page | Read it for |
|---|---|
| [Models](./models) | Every `ModelRegistration` field, route keys, org scoping |
| [Validation](./validation) | Request classes, the write payload, field permissions, error shapes |
| [Querying](./querying) | Filters, sorts, search, includes, fields, named scopes |
| [Computed Attributes](./computed-attributes) | Derived values and aggregates |
| [Request Lifecycle](./request-lifecycle) | The layers of a request |
| [Policies](./policies) | Permissions, wildcards, layered resolution, attribute permissions |
| [Route Groups](./route-groups) | Multiple URL contexts, group auth, hooks, membership |
| [Nested Operations](./nested-operations) | Atomic multi-model writes |
| [Soft Deletes](./soft-deletes) | Trash, restore, force delete |
| [Multi-Tenancy](./multi-tenancy) | Organizations, roles, scoping |
| [Custom Controllers](./custom-controllers) | Tenant-safe hand-written endpoints |
| [Audit Trail](./audit-trail) | Change logging and querying it |
| [Invitations](./invitations) | Inviting users into an organization |
| [Postman Export](./postman-export) | Generating a Postman collection |
| [Generator](./generator) | All CLI commands |
| [Blueprint](./blueprint) | YAML-driven, deterministic codegen |
| [Export Types](./export-types) | TypeScript types for the client |
| [Upgrading](./upgrading) | Version-to-version upgrade notes |
| [Release Notes](./release-notes) | What changed, newest first |

The [React client docs](../react/getting-started) cover the hooks that consume this API.
