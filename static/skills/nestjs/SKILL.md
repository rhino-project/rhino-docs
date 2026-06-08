# Rhino NestJS Server -- Comprehensive Reference

You are a senior software engineer specialized in **Rhino**, a NestJS package that generates fully-featured REST APIs from model registrations. You are friendly, practical, and always provide code snippets. When answering, assume the developer is working with the **NestJS + Prisma (TypeScript)** version of Rhino.

**CRITICAL RULE: Every code change MUST include tests (Jest). No exceptions.**

In Rhino for NestJS:

- **Models** are plain **Prisma** models in `prisma/schema.prisma` plus a **`ModelRegistration`** object in `src/rhino.config.ts`. There is no base class, no decorators on entities, and no mixins.
- **Validation** uses **Zod** schemas (`validation` / `validationStore` / `validationUpdate`), not VineJS.
- **Policies** are classes extending `ResourcePolicy` from `@rhino-dev/rhino-nestjs`, attached via the registration's `policy` field.
- **Middleware** entries are NestJS middleware **classes** (`Type<NestMiddleware>`), not string names.
- The **CLI** is `npx rhino <command>` (`install`, `generate`, `blueprint`, `export-postman`, `export-types`).
- Routes are registered by `applyRhinoRouting(app, { prefix: 'api' })` in `main.ts`.

---

## Feature Summary

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Automatic CRUD Endpoints** | Generates `index`, `show`, `store`, `update`, `destroy` for every registered model — zero controller code. |
| 2 | **Authentication** | Built-in login, logout, password recovery/reset, and invitation-based registration via JWT. |
| 3 | **Authorization & Policies** | `ResourcePolicy` base class with convention-based permission checks (`{slug}.{action}`). Wildcards (`*`, `posts.*`). |
| 4 | **Role-Based Access Control (layered)** | `effective = (role ∪ granted) − denied`, deny always wins. Role layer in `OrgRolePermission(org, role)` (shared, defined once); per-user `userRoles.grantedPermissions` / `deniedPermissions` deltas; legacy `userRoles.permissions` still honored. Wildcards on every layer; `userHasPermission()` enforces deny-overrides in one place. `JwtAuthGuard` deep-includes `role.orgRolePermissions` with graceful fallback. Backward-compatible. Migrate with `npx rhino permissions-migrate --apply`. |
| 5 | **Attribute-Level Permissions** | Control which fields each role can read (`permittedAttributesForShow`, `hiddenAttributesForShow`) and write (`permittedAttributesForCreate`, `permittedAttributesForUpdate`). |
| 6 | **Validation** | Two-layer: policy-driven field permissions (403 for forbidden fields) + Zod schemas for type/format (422). Role-keyed schemas supported. |
| 7 | **Cross-Tenant FK Validation** | Client-supplied `organizationId` is stripped; FK references can be verified against the current org via `fkConstraints`. |
| 8 | **Filtering** | `?filter[field]=value` (AND). Comma-separated values for OR (`?filter[status]=draft,published`). |
| 9 | **Sorting** | `?sort=field` (asc) or `?sort=-field` (desc). Multiple: `?sort=-createdAt,title`. |
| 10 | **Full-Text Search** | `?search=term` across `allowedSearch` fields. Relation dot notation (`author.name`). |
| 11 | **Pagination** | `?page=N&per_page=N`. Metadata in headers (`X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`). `per_page` clamped 1–100. |
| 12 | **Field Selection** | `?fields[posts]=id,title,status`. |
| 13 | **Eager Loading** | `?include=author,comments` with nested support (`comments.user`). `commentsCount` / `commentsExists` suffixes. Per-include authorization. |
| 14 | **Multi-Tenancy** | Organization isolation via `belongsToOrganization: true`. Auto-sets `organizationId`, scopes queries. Route-prefix or subdomain resolution. |
| 15 | **Nested Ownership** | Models without a direct `organizationId` are scoped by walking the `owner` relation chain (e.g., Comment → Post → Organization). |
| 16 | **Route Groups** | Multiple URL prefixes with different middleware/auth, optionally constrained to a host via per-group `domain` (literal or `{organization}.example.com`). Reserved names: `tenant` and `public`. Opt-in per-group `auth` and `hooks`. |
| 16b | **Group Membership & Auth** (opt-in via `auth.enforceGroupMembership`) | `user_roles.route_group` column (NULL/absent = wildcard) makes the group an access boundary: mismatch → 403, permissions resolve from the matched row. Per-group `auth: true` registers group-tagged auth routes; per-group `hooks` run `afterLogin/Logout/Register/PasswordRecover/PasswordReset` and may reject (revokes token). Invitations carry `route_group`. |
| 17 | **Soft Deletes** | `DELETE` soft-deletes, plus `GET /trashed`, `POST /:id/restore`, `DELETE /:id/force-delete`. Each with its own permission. |
| 18 | **Audit Trail** | `hasAuditTrail: true` logs CRUD events with old/new values, user, IP, user-agent, org context. Fail-safe. |
| 19 | **Nested Operations** | `POST /nested` for atomic multi-model transactions. All-or-nothing rollback. |
| 20 | **Invitations** | Token-based invite system with create, resend, cancel, accept. Configurable expiration and role assignment. |
| 21 | **Hidden Columns** | Base (password, timestamps) + model-level (`additionalHiddenColumns`) + policy-level dynamic hiding per role. |
| 22 | **Auto-Scope Discovery** | Custom `scopes: [Class]` per registration; each `RhinoScope.apply(where, ctx)` augments the Prisma `where`. |
| 23 | **UUID Primary Keys** | `hasUuid: true` for string UUID primary keys (`@default(uuid())` in Prisma). |
| 24 | **Middleware Support** | Per-model `middleware` and per-action `actionMiddleware` (arrays of NestJS middleware classes). |
| 25 | **Action Exclusion** | `exceptActions` disables specific CRUD routes per model. |
| 26 | **Generator CLI** | `npx rhino install` (setup), `npx rhino generate` (scaffold model/policy/scope stub), `npx rhino blueprint`, `npx rhino export-postman`, `npx rhino export-types`. |
| 27 | **Postman Export** | Auto-generated Postman Collection v2.1 with auth, example bodies, and filter/sort/include variants. |
| 28 | **Blueprint (YAML Code Generation)** | Define models, columns, relationships, and role-based permissions in YAML. `npx rhino blueprint` generates Prisma fragments, registrations, policies, tests, and seeders. Incremental via manifest tracking. |

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Models & ModelRegistration](#2-models--modelregistration)
3. [Policies & Permissions](#3-policies--permissions)
4. [Validation](#4-validation)
5. [Query Builder](#5-query-builder)
6. [Multi-Tenancy](#6-multi-tenancy)
7. [Route Groups](#7-route-groups)
8. [Soft Deletes](#8-soft-deletes)
9. [Audit Trail](#9-audit-trail)
10. [Nested Operations](#10-nested-operations)
11. [Invitations](#11-invitations)
12. [Request Lifecycle](#12-request-lifecycle)
13. [Generator Commands](#13-generator-commands)
14. [Blueprint (YAML Code Generation)](#14-blueprint-yaml-code-generation)
15. [Public Route Groups](#15-public-route-groups)
16. [Hybrid Multi-Tenant Architecture](#16-hybrid-multi-tenant-architecture)
17. [Nested Filtering & Including](#17-nested-filtering--including)
18. [Security: Organization ID Protection](#18-security-organization-id-protection)
19. [Testing with Jest](#19-testing-with-jest)
20. [Comprehensive Q&A](#20-comprehensive-qa)

---

## 1. Getting Started

### Requirements

- Node.js 18+
- NestJS v10+ application
- Prisma (`@prisma/client`)

### Installation

```bash
npm install @rhino-dev/rhino-nestjs
npx rhino install
```

The installer:

- Publishes the `src/rhino.config.ts` configuration helper
- Wires `RhinoModule` into your `AppModule`
- Connects your Prisma client
- Optionally enables multi-tenant support and audit trail
- Optionally sets up the Claude Code skills

Then apply migrations:

```bash
npx prisma migrate deploy
```

### Configuration

The config is a `RhinoConfig` object passed to `RhinoModule.forRoot()`:

```ts
// src/rhino.config.ts
import { PrismaClient } from '@prisma/client';
import type { RhinoConfig } from '@rhino-dev/rhino-nestjs';

export function buildRhinoConfig(prisma: PrismaClient): RhinoConfig {
  return {
    prismaClient: prisma as any,

    // Model registration -- slug => ModelRegistration
    models: {
      posts:    { model: 'post' },
      comments: { model: 'comment' },
    },

    // Route groups -- control URL prefixes, middleware, and model access
    routeGroups: {
      tenant: {
        prefix: ':organization',
        models: '*',
      },
    },

    // Multi-tenancy
    multiTenant: {
      enabled: true,
      organizationIdentifierColumn: 'slug', // 'id', 'slug', or 'uuid'
      organizationModel: 'organization',
      userOrganizationModel: 'userRole',
    },

    // Authentication
    auth: {
      jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
      jwtExpiresIn: '7d',
      userModel: 'user',
    },

    // Invitations
    invitations: {
      expiresDays: 7,
      allowedRoles: null, // null = all roles, or ['admin', 'editor']
    },

    // Nested operations
    nested: {
      path: 'nested',
      maxOperations: 50,
      allowedModels: null, // null = all registered models
    },
  };
}
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { RhinoModule, JwtAuthGuard, ResponseInterceptor } from '@rhino-dev/rhino-nestjs';
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

`RhinoModule.forRoot()` merges your values with sensible defaults. Use `RhinoModule.forRootAsync({ useFactory, inject })` if config must be resolved via DI.

### Bootstrap

```ts
// src/main.ts
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

### Registering a Model

Define a Prisma model, then register it. The slug (`posts`) is the URL segment and permission prefix; `model` is the Prisma delegate name (camelCase).

```prisma
// prisma/schema.prisma
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

```ts
// src/rhino.config.ts
import { z } from 'zod';

models: {
  posts: {
    model: 'post',
    softDeletes: true,
    allowedFilters: ['status', 'userId'],
    allowedSorts: ['createdAt', 'title', 'updatedAt'],
    defaultSort: '-createdAt',
    allowedIncludes: ['author', 'comments'],
    allowedSearch: ['title', 'content'],
    validation: z.object({
      title: z.string().max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
    }),
  },
},
```

### Generated REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/:id` | Show single record |
| `PUT` | `/api/posts/:id` | Update with validation |
| `DELETE` | `/api/posts/:id` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/:id/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/:id/force-delete` | Permanent delete |

With a `tenant` route group, routes are prefixed with `:organization` (e.g., `GET /api/:organization/posts`).

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/auth/logout` | Log out |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

---

## 2. Models & ModelRegistration

A model = a Prisma model + a `ModelRegistration`. Define behaviors as plain fields on the registration.

### ModelRegistration Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | — | **Required.** Prisma delegate name (e.g., `'post'`). |
| `policy` | `Type<ResourcePolicy>` | — | `ResourcePolicy` subclass for authorization. |
| `validation` | `ZodSchema` | — | Zod schema for store + update. |
| `validationStore` | `ZodSchema \| Record<string, ZodSchema>` | — | Override for create. Role-keyed when a record. |
| `validationUpdate` | `ZodSchema \| Record<string, ZodSchema>` | — | Override for update. Role-keyed when a record. |
| `allowedFilters` | `string[]` | `[]` | Fields for `?filter[field]=value`. |
| `allowedSorts` | `string[]` | `[]` | Fields for `?sort=field`. |
| `defaultSort` | `string` | — | Sort when no `?sort` (e.g., `'-createdAt'`). |
| `allowedFields` | `string[]` | `[]` | Fields selectable via `?fields[model]=...`. |
| `allowedIncludes` | `string[]` | `[]` | Prisma relations eager-loadable via `?include=`. |
| `allowedSearch` | `string[]` | `[]` | Fields searched by `?search=`. Dot notation for relations. |
| `paginationEnabled` | `boolean` | `true` | Enable pagination on index. |
| `perPage` | `number` | `25` | Records per page. |
| `softDeletes` | `boolean` | `false` | Enable trashed/restore/force-delete. Requires `deletedAt`. |
| `belongsToOrganization` | `boolean` | `false` | Scope to current org; auto-set `organizationId` on create. |
| `hasAuditTrail` | `boolean` | `false` | Log CRUD to `audit_logs`. |
| `hasUuid` | `boolean` | `false` | String UUID primary key. |
| `additionalHiddenColumns` | `string[]` | `[]` | Extra columns always hidden. |
| `auditExclude` | `string[]` | `[]` | Fields excluded from audit snapshots. |
| `computedAttributes` | `(record, user) => Record<string, any>` | — | Virtual attributes (merged before policy filtering). |
| `scopes` | `Type<RhinoScope>[]` | `[]` | Custom scope classes. |
| `owner` | `string` | — | Parent relation for nested-ownership scoping. |
| `fkConstraints` | `Array<{ field, model }>` | — | FKs verified against the current org. |
| `middleware` | `Type<NestMiddleware>[]` | `[]` | Middleware for all routes of this model. |
| `actionMiddleware` | `Record<string, Type<NestMiddleware>[]>` | `{}` | Middleware per action. |
| `exceptActions` | `string[]` | `[]` | CRUD actions to exclude. |

### Complete Example

```ts
import { z } from 'zod';
import { PostPolicy } from './policies/PostPolicy';
import { PublishedScope } from './scopes/PublishedScope';

models: {
  posts: {
    model: 'post',
    policy: PostPolicy,
    validation: z.object({
      title: z.string().max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
    }),
    allowedFilters: ['status', 'userId', 'categoryId'],
    allowedSorts: ['createdAt', 'title', 'updatedAt'],
    defaultSort: '-createdAt',
    allowedFields: ['id', 'title', 'content', 'status'],
    allowedIncludes: ['author', 'comments'],
    allowedSearch: ['title', 'content'],
    paginationEnabled: true,
    perPage: 25,
    softDeletes: true,
    belongsToOrganization: true,
    hasAuditTrail: true,
    scopes: [PublishedScope],
    actionMiddleware: { store: [VerifiedMiddleware] },
    exceptActions: ['forceDelete'],
  },
},
```

### Hidden Columns & Computed Attributes

Hidden columns are layered:

1. **Base** (always hidden): `password`, `rememberToken`, `createdAt`, `updatedAt`, `deletedAt`
2. **Model-level** via `additionalHiddenColumns`
3. **Policy-level blacklist** via `hiddenAttributesForShow()`
4. **Policy-level whitelist** via `permittedAttributesForShow()`

```ts
users: { model: 'user', additionalHiddenColumns: ['apiToken', 'stripeId'] },
```

Add virtual attributes with `computedAttributes` — merged BEFORE policy filtering, so they respect blacklist/whitelist:

```ts
import { differenceInDays } from 'date-fns';

contracts: {
  model: 'contract',
  computedAttributes: (record, _user) => ({
    days_until_expiry: record.expiryDate
      ? differenceInDays(new Date(record.expiryDate), new Date())
      : null,
  }),
},
```

### Custom Scopes

```ts
// src/scopes/PublishedScope.ts
import type { RhinoScope } from '@rhino-dev/rhino-nestjs';

export class PublishedScope implements RhinoScope {
  apply(where: Record<string, any>, ctx: { user?: any; userRole?: string | null }) {
    if (ctx.userRole !== 'admin') return { ...where, status: 'published' };
    return where;
  }
}
```

### Relationships

Relationships are defined in `prisma/schema.prisma` as Prisma relations. To eager-load a relation via `?include=`, list it in `allowedIncludes`.

---

## 3. Policies & Permissions

### ResourcePolicy Base Class

```ts
// src/policies/PostPolicy.ts
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';
}
```

`resourceSlug` is an instance property (use `override`). With this minimal setup, Rhino checks:

| Action | Policy Method | Permission |
|--------|--------------|------------|
| Index | `viewAny(user, org?)` | `posts.index` |
| Show | `view(user, record, org?)` | `posts.show` |
| Store | `create(user, org?)` | `posts.store` |
| Update | `update(user, record, org?)` | `posts.update` |
| Destroy | `delete(user, record, org?)` | `posts.destroy` |
| Trashed | `viewTrashed(user, org?)` | `posts.trashed` |
| Restore | `restore(user, record, org?)` | `posts.restore` |
| Force Delete | `forceDelete(user, record, org?)` | `posts.forceDelete` |

### Permission Format

`{resourceSlug}.{action}` — e.g., `posts.index`, `posts.store`, `comments.destroy`. The slug matches the key in `models`.

### Wildcard Permissions

- `*` — everything across all resources
- `posts.*` — all actions on `posts`

```ts
import { userHasPermission } from '@rhino-dev/rhino-nestjs';

userHasPermission(user, '*', organization);
userHasPermission(user, 'posts.*', organization);
userHasPermission(user, 'posts.store', organization);
```

### Permission Storage

**User-level** (non-tenant routes) — JSON on `users.permissions`:

```
id | name  | permissions (JSON)
1  | Alice | ["trips.index", "trips.show", "trucks.*"]
2  | Bob   | ["*"]
```

**Organization-scoped** (tenant routes) — on the `user_roles` join table:

```
id | userId | organizationId | permissions (JSON)
1  | 1      | 1              | ["*"]
2  | 2      | 1              | ["posts.index", "posts.show"]
```

**Resolution:** organization present (tenant route) → `user_roles.permissions`. No organization → `users.permissions`. Deterministic, no fallback chain.

Utilities: `userHasPermission(user, permission, organization?)` and `resolveUserRoleSlug(user, organizationId)`.

### Custom Policies

```ts
import { ResourcePolicy, userHasPermission } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  override update(user: any, record: any, org?: any): boolean {
    if (record.userId === user?.id) return true;
    return super.update(user, record, org);
  }

  override delete(user: any, _record: any, _org?: any): boolean {
    return userHasPermission(user, '*');
  }
}
```

### Registering a Policy

```ts
import { PostPolicy } from './policies/PostPolicy';

models: { posts: { model: 'post', policy: PostPolicy } },
```

### Attribute Permissions

Each method receives `(user, org?)`.

```ts
override hiddenAttributesForShow(user: any, org?: any): string[] {
  if (!user) return ['email', 'phone', 'apiToken'];
  return this.hasRole(user, 'admin', org) ? [] : ['apiToken'];
}

override permittedAttributesForShow(user: any, org?: any): string[] {
  if (!user) return ['title', 'body'];
  return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'body', 'status'];
}

override permittedAttributesForCreate(user: any, org?: any): string[] {
  if (!user) return [];
  return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'body'];
}

override permittedAttributesForUpdate(user: any, org?: any): string[] {
  if (!user) return [];
  return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'body'];
}
```

`hasRole(user, roleSlug, org?)` is available in all policies. When `permittedAttributesForShow` and `hiddenAttributesForShow` overlap, the **blacklist wins**.

### No Policy Behavior

If a registration has no `policy`, **all actions are allowed**.

### Slug Resolution

Always set `resourceSlug` explicitly. If omitted, the guard injects it from the model registry at runtime.

---

## 4. Validation

### Two-Layer Validation System

1. **Policy-driven field permissions** — which fields a user may submit
2. **Zod schemas** (`validation` / `validationStore` / `validationUpdate`) — type and format

### Flow

1. Resolve permitted fields from policy
2. Forbidden field present → **403**
3. Run Zod validation → **422** on failure
4. Return result

### Zod Schemas

```ts
import { z } from 'zod';

posts: {
  model: 'post',
  validation: z.object({
    title: z.string().max(255),
    content: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
    email: z.string().email(),
    score: z.number().min(0).max(100),
    isActive: z.boolean(),
    startsAt: z.string().datetime({ offset: true }).or(z.date()),
  }),
},
```

### Store vs Update

`validation` applies to both. Override per action with `validationStore` / `validationUpdate`:

```ts
posts: {
  model: 'post',
  validationStore: z.object({ title: z.string(), content: z.string() }),
  validationUpdate: z.object({ title: z.string().optional(), content: z.string().optional() }),
},
```

### Role-Keyed Schemas

`validationStore` / `validationUpdate` can be `Record<string, ZodSchema>` keyed by role slug; `'*'` is the fallback:

```ts
const validationStore: Record<string, z.ZodTypeAny> = {
  admin:  z.object({ title: z.string(), budget: z.number().nullable().optional() }),
  member: z.object({ title: z.string() }),
  '*':    z.object({}),
};

projects: { model: 'project', validationStore },
```

### Common Zod Types

| Type | Example |
|---|---|
| string | `z.string().max(255)` |
| number | `z.number().min(0).max(100)` |
| boolean | `z.boolean()` |
| enum | `z.enum(['a', 'b', 'c'])` |
| email | `z.string().email()` |
| url | `z.string().url()` |
| date | `z.string().datetime().or(z.date())` |
| nullable/optional | `z.string().nullable().optional()` |

### Responses

Forbidden fields (403):

```json
{ "message": "Forbidden: you are not allowed to set the following fields: status, priority" }
```

Validation failure (422):

```json
{ "errors": { "title": ["String must contain at most 255 character(s)"] } }
```

---

## 5. Query Builder

### Registration Fields

```ts
posts: {
  model: 'post',
  allowedFilters: ['status', 'userId', 'categoryId'],
  allowedSorts: ['createdAt', 'title', 'updatedAt'],
  defaultSort: '-createdAt',
  allowedFields: ['id', 'title', 'content', 'status'],
  allowedIncludes: ['author', 'comments', 'tags', 'category'],
  allowedSearch: ['title', 'content', 'author.name'],
},
```

Fields not listed are silently ignored (security feature).

### Filtering

```bash
GET /api/posts?filter[status]=published
GET /api/posts?filter[status]=published&filter[userId]=1
GET /api/posts?filter[status]=draft,published      # IN clause
```

### Sorting

```bash
GET /api/posts?sort=title
GET /api/posts?sort=-createdAt
GET /api/posts?sort=status,-createdAt
```

### Search

```bash
GET /api/posts?search=nestjs
```

Produces an `OR` group of case-insensitive `contains` conditions across `allowedSearch`. Dot notation (`author.name`) resolves via a nested Prisma relation filter.

### Pagination

```bash
GET /api/posts?page=1&per_page=20
```

Headers (not body): `X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`. `per_page` clamped [1, 100]. Disable with `paginationEnabled: false`.

### Field Selection

```bash
GET /api/posts?fields[posts]=id,title,status
```

`id` is always included.

### Eager Loading

```bash
GET /api/posts?include=author,comments
GET /api/posts?include=comments.user        # nested
GET /api/posts?include=commentsCount        # count
GET /api/posts?include=commentsExists       # boolean
```

Include authorization: Rhino checks `viewAny` on each included resource (403 if denied).

### Combined

```bash
GET /api/posts?filter[status]=published&sort=-createdAt&include=author,comments&fields[posts]=id,title&search=nestjs&page=1&per_page=20
```

---

## 6. Multi-Tenancy

### Enabling

```ts
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

routeGroups: {
  tenant: {
    prefix: ':organization',
    middleware: [ResolveOrganizationMiddleware],
    models: '*',
  },
},
multiTenant: {
  enabled: true,
  organizationIdentifierColumn: 'slug', // 'id' | 'slug' | 'uuid'
  organizationModel: 'organization',
  userOrganizationModel: 'userRole',
},
```

### Routing Strategies

**URL Prefix Mode** — `prefix: ':organization'` + `ResolveOrganizationMiddleware`. Routes: `GET /api/:organization/posts`.

**Subdomain Mode** — give the group a parameterized `domain` and resolve at the Express layer:

```ts
routeGroups: { tenant: { prefix: '', domain: '{organization}.example.com', models: '*' } },
```

```ts
// main.ts
import { createDomainRouteResolver } from '@rhino-dev/rhino-nestjs';
app.use(createDomainRouteResolver({ prisma, config }));
applyRhinoRouting(app, { prefix: 'api' });
```

### `belongsToOrganization`

Set `belongsToOrganization: true`. The model should have an `organizationId` column and `organization` relation.

- **Auto-sets `organizationId` on create** from `req.organization.id`.
- **Scopes every query** to the current org (`WHERE organizationId = ?`) when an org is in the request context.
- Outside an HTTP request (scripts, tests, jobs), no org is set, so scoping is skipped.

Client-supplied `organizationId` is always stripped — the org comes only from the resolved request context.

### Nested Organization Scoping

For child models, set `owner` to the relation Rhino walks to find the org:

```ts
comments: { model: 'comment', owner: 'post' }, // Comment -> post -> organization
```

Equivalent SQL uses a nested relation condition (`EXISTS (SELECT 1 FROM posts WHERE ... AND posts.organization_id = ?)`). Deeper chains supported.

### Organization Scope Precedence

1. Resource IS the Organization model → restrict to current org's PK
2. Model has `organizationId` column → `WHERE organizationId = ?`
3. `owner` chain configured/auto-detected → nested relation condition
4. No relationship → global (no scope)

### Membership Verification

`ResolveOrganizationMiddleware` checks the membership model (`userOrganizationModel`, default `userRole`) for a row matching the user + org. No match → `404` (avoids leaking org existence).

---

## 7. Route Groups

### Route Registration

Define route groups in the config; `applyRhinoRouting(app, { prefix: 'api' })` in `main.ts` registers all CRUD, auth, invitation, and nested routes.

### Configuration

Middleware entries are NestJS middleware **classes**, not strings.

```ts
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

routeGroups: {
  tenant: { prefix: ':organization', middleware: [ResolveOrganizationMiddleware], models: '*' },
  admin:  { prefix: 'admin', tenant: false, models: '*' },
  public: { prefix: 'public', skipAuth: true, models: ['categories'] },
},
```

### Route Group Properties

| Property | Type | Description |
|----------|------|-------------|
| `prefix` | `string` | URL prefix (`':organization'`, `'admin'`, `''`) |
| `domain` | `string` | Optional host constraint (literal or `{organization}.example.com`) |
| `middleware` | `Type<NestMiddleware>[]` | Middleware classes for all routes in the group |
| `models` | `'*' \| string[]` | All models or specific slugs |
| `skipAuth` | `boolean` | Skip the JWT guard (reserved `public` implies this) |
| `auth` | `boolean` | Register a group-tagged auth route set |
| `hooks` | `Type<AuthLifecycleHooks> \| AuthLifecycleHooks` | Per-group lifecycle hooks |
| `tenant` | `boolean` | Org-scoped or not (inferred from multi-tenancy when omitted) |

### Reserved Group Names

- **`tenant`** — registers invitation + nested routes under the prefix; middleware (`ResolveOrganizationMiddleware`) sets `req.organization`.
- **`public`** — implies `skipAuth: true`.

### Route Naming

Pattern `rhino.{groupKey}.{modelSlug}.{action}` (e.g., `rhino.tenant.posts.index`).

### Registration Order

Literal prefixes (`admin`, `public`) register **before** parameterized prefixes (`:organization`) so they aren't shadowed.

### Permission Resolution by Group

| Route Group | Permission Source |
|-------------|------------------|
| `'tenant'` | `user_roles.permissions` (per-org) |
| Any other | `users.permissions` (user-level) |

### Domain Constraints

```ts
routeGroups: { admin: { prefix: '', domain: 'admin.example.com', models: '*' } },
```

- omitted → matches any host (default)
- `'admin.example.com'` → only that host; others 404
- `'{organization}.example.com'` → parameterized; captured `{organization}` feeds org resolution (use `createDomainRouteResolver` in `main.ts`)

### Group Membership & Auth (opt-in)

All opt-in and fully backward compatible — **with the flags off, behavior is byte-for-byte unchanged.**

**1. Membership on `user_roles`.** A migration adds a nullable `route_group` column (and makes `organizationId` nullable for non-tenant groups). A `NULL`/absent `route_group` is a **wildcard** (member of every group — the back-compat default); a concrete value scopes the membership. Gated by the master flag:

```ts
RhinoModule.forRoot({ auth: { enforceGroupMembership: false } /* default OFF */, /* ... */ });
```

- **Off:** no membership check; permission source is the org-presence heuristic.
- **On:** after auth, the user must hold a `user_roles` row matching the request's `route_group` (NULL/absent row = wildcard) **and**, for tenant groups, the resolved org — else **403**. Permissions then resolve from the matched row, not the heuristic. `public` skips both. The default/empty-prefix group is a first-class membership dimension. **The 403 membership denial takes precedence over the org-resolution 404**: an authenticated non-member of a real route group/org gets 403, not 404. With enforcement off, unknown/non-member orgs 404 as before.

Per-group `tenant?: boolean` controls org-scoping: omitted → tenant iff multi-tenancy enabled; set `tenant: false` for org-less groups (`admin`, `driver`) when multi-tenancy is on.

**2. Group-aware auth.** `auth: true` registers the full auth set (`login`, `logout`, `password/recover`, `password/reset`, `register`) under the group's prefix/domain, tagged with its name. The legacy unprefixed `/api/auth/*` always remains for the default/no-group case. `public` is never auth-enabled. An `auth: true` group with **empty prefix + no domain IS the default auth** — the default `/api/auth/*` resolves to that group (keeping `skipAuth`) and adopts its `hooks`, even when a host-claiming empty-prefix domain group also exists (no second route registered). **Two+** indistinguishable empty-prefix + no-domain auth groups → boot-time `RouteGroupConflictError`.

```ts
routeGroups: {
  driver: { prefix: 'driver', auth: true, hooks: DriverAuthHooks, tenant: false, models: ['trips'] },
}
// adds POST /api/driver/auth/login, …/logout, …/register, …/password/*
```

**3. Lifecycle hooks.** A group's `hooks` provider implements `AuthLifecycleHooks` (class via Nest DI, or plain object). Each method runs **after** its action succeeds, receiving `AuthHookContext` (`{ user, routeGroup, organization?, token?, request }`):

```ts
import { Injectable } from '@nestjs/common';
import { AuthLifecycleHooks, AuthHookContext, RhinoAuthRejected } from '@rhino-dev/rhino-nestjs';

@Injectable()
export class DriverAuthHooks implements AuthLifecycleHooks {
  async afterLogin(ctx: AuthHookContext): Promise<void> {
    if (!ctx.user.driver?.active)
      throw new RhinoAuthRejected(403, 'Driver suspended.'); // revokes token, returns 403
  }
}
```

| Event | Fires after | Reject? |
|-------|-------------|---------|
| `afterLogin` | login (token issued) | yes — revokes token |
| `afterRegister` | invitation-accept registration | yes — revokes token |
| `afterLogout` | logout | yes (token already gone) |
| `afterPasswordReset` | password reset | yes |
| `afterPasswordRecover` | recovery email requested | runs, but reject is **swallowed** (anti-enumeration) |

Reject by throwing `RhinoAuthRejected(status = 403, message)` (or any `HttpException`; a plain `Error` → 500 after revoke). Default 403. **Token revocation needs a `RevokedToken` Prisma model** (`token`, `createdAt`) + short-TTL JWTs (`auth.jwtExpiresIn`); without it, revocation is logged and skipped (the token is still dropped from the response).

**4. Invitations carry the group.** Invite stores `route_group` (NULL org for non-tenant groups); accept populates the membership then fires `afterRegister`. Cannot invite into `public`; a forged/unknown `routeGroup` (not configured, not `public`) → **422** regardless of enforcement. With enforcement on, a coarse membership gate runs first (inviter must be a member of the target group — **403** on denial, NULL row = wildcard), then the normal permission check.

---

## 8. Soft Deletes

### Enabling

Set `softDeletes: true`; the Prisma model needs a nullable `deletedAt`:

```prisma
model Post {
  id        Int       @id @default(autoincrement())
  deletedAt DateTime?
  // ...
  @@map("posts")
}
```

```ts
posts: { model: 'post', softDeletes: true },
```

### Endpoints

| Method | Endpoint | Policy | Permission |
|--------|----------|--------|------------|
| `GET` | `/api/posts/trashed` | `viewTrashed` | `posts.trashed` |
| `POST` | `/api/posts/:id/restore` | `restore` | `posts.restore` |
| `DELETE` | `/api/posts/:id/force-delete` | `forceDelete` | `posts.forceDelete` |

Standard `DELETE /api/posts/:id` sets `deletedAt`. Force-delete performs a hard Prisma `delete`.

### Excluding Endpoints

```ts
posts: { model: 'post', softDeletes: true, exceptActions: ['forceDelete'] },
```

### Audit Trail Integration

`DELETE` → `deleted`, restore → `restored`, force-delete → `force_deleted`.

---

## 9. Audit Trail

### Enabling

```ts
posts: { model: 'post', hasAuditTrail: true, auditExclude: ['password', 'rememberToken'] },
```

### Tracked Events

| Operation | Action | Old | New |
|-------|--------|-----|-----|
| Create | `created` | `null` | All attributes |
| Update | `updated` | Changed (original) | Changed (new) |
| Soft delete | `deleted` | All attributes | `null` |
| Force delete | `force_deleted` | All attributes | `null` |
| Restore | `restored` | `null` | All attributes |

### AuditLog Model

Add to `prisma/schema.prisma`:

```prisma
model AuditLog {
  id             Int      @id @default(autoincrement())
  auditableType  String
  auditableId    String
  action         String
  oldValues      String?
  newValues      String?
  userId         Int?
  organizationId Int?
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())

  @@index([auditableType, auditableId])
  @@map("audit_logs")
}
```

`oldValues` / `newValues` are JSON strings.

### Querying

Query the `AuditLog` Prisma model directly:

```ts
const logs = await prisma.auditLog.findMany({
  where: { auditableType: 'posts', auditableId: '1' },
  orderBy: { createdAt: 'desc' },
});
```

### Context & Fail-Safe

Captures `userId`, `organizationId`, `ipAddress`, `userAgent` from the request (or `null` outside HTTP). Logging is wrapped in try/catch and never breaks CRUD.

---

## 10. Nested Operations

### Endpoint

```bash
POST /api/nested                  # without multi-tenancy
POST /api/:organization/nested    # with multi-tenancy
```

### Configuration

```ts
nested: { path: 'nested', maxOperations: 50, allowedModels: null }, // null = all
```

### Request / Response

```json
{ "operations": [
  { "model": "posts", "action": "create", "data": { "title": "New Post", "content": "..." } },
  { "model": "posts", "action": "update", "id": 5, "data": { "title": "Updated Title" } }
] }
```

```json
{ "results": [
  { "model": "posts", "id": 42, "action": "created", "data": { "id": 42, "title": "New Post" } },
  { "model": "posts", "id": 5,  "action": "updated", "data": { "id": 5, "title": "Updated Title" } }
] }
```

### Semantics

- All operations run in **one transaction** — all-or-nothing rollback.
- Each operation is individually validated (Zod) and authorized (policy), all **before** any write.
- `create` uses the Prisma delegate `create`; `update` loads by `id`, merges, and `update`s.
- Creates get `organizationId` auto-injected; updates scoped to the current org.
- Restrict models with `allowedModels: ['posts', 'comments']`.

---

## 11. Invitations

### Overview

1. Authenticated user creates an invitation for an email within an org
2. A 64-char hex token is generated; the `notificationHandler` sends the email
3. Invitee clicks the link
4. If authenticated → accepted immediately, added to org
5. If not → returns `requires_registration: true` for frontend redirect

### Configuration

```ts
invitations: {
  expiresDays: 7,
  allowedRoles: null, // null = all roles, or ['admin', 'manager']
  notificationHandler: async (invitation) => { /* send the email with invitation.token */ },
},
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:organization/invitations` | List invitations |
| `POST` | `/api/:organization/invitations` | Create invitation |
| `POST` | `/api/:organization/invitations/:id/resend` | Resend email |
| `DELETE` | `/api/:organization/invitations/:id` | Cancel invitation |
| `POST` | `/api/invitations/accept` | Accept (public) |

### Requests

Create: `{ "email": "newuser@example.com", "role_id": 2 }`. Accept: `{ "token": "...64-char-hex..." }`.

**Authenticated accept:** `{ "message": "Invitation accepted successfully", "invitation": {...}, "organization": {...} }`

**Unauthenticated accept:** `{ "invitation": {...}, "requires_registration": true, "message": "..." }`

### OrganizationInvitation Model (Prisma)

```prisma
model OrganizationInvitation {
  id             Int       @id @default(autoincrement())
  organizationId Int
  email          String
  roleId         Int
  token          String    @unique
  status         String    @default("pending")
  invitedById    Int
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())

  @@map("organization_invitations")
}
```

`InvitationService` generates the token (`randomBytes(32).toString('hex')`) and sets `expiresAt` from `expiresDays`.

---

## 12. Request Lifecycle

```
HTTP Request
  -> Route Match (NestJS router)
  -> JwtAuthGuard (skipped when skipAuth)
  -> Route Group Middleware (e.g., ResolveOrganizationMiddleware)
  -> Model Middleware (middleware / actionMiddleware)
  -> GlobalController
  -> Policy Check (403 if denied)
  -> Organization Scope (tenant group + belongsToOrganization)
  -> Validation (store/update only)
  -> Query Builder
  -> Response Serialization (hidden columns stripped)
  -> JSON Response
```

### Step-by-Step

1. **Route Match** — slug + group stored in route metadata.
2. **Auth Guard** — `JwtAuthGuard` verifies the Bearer JWT, sets `req.user`. Skipped for `skipAuth` groups.
3. **Route Group Middleware** — e.g., `ResolveOrganizationMiddleware` sets `req.organization`.
4. **Model Middleware** — `middleware` / `actionMiddleware` classes.
5. **Model Resolution** — registration looked up; Prisma delegate via `PrismaService.model(registration.model)`.
6. **Policy Check** — appropriate method; 403 if denied. Include authorization checked here.
7. **Organization Scope** — applied when `req.organization` exists and `belongsToOrganization` is set.
8. **Validation** — store/update: permitted-fields check (403), then Zod (422).
9. **Query Execution** — `QueryBuilderService` applies filters, sorts, search, includes, fields, pagination.
10. **Response** — JSON + pagination headers. Delete returns 204.

### Error Responses

| Status | Meaning |
|--------|---------|
| `204` | Success, no content (delete) |
| `403` | Authorization denied / forbidden fields |
| `404` | Not found |
| `422` | Validation failed |

---

## 13. Generator Commands

| Command | Description |
|---------|-------------|
| `npx rhino install` | Interactive project setup |
| `npx rhino generate` | Scaffold a model, policy, or scope stub |
| `npx rhino blueprint` | Generate from YAML blueprints |
| `npx rhino export-postman` | Generate a Postman collection |
| `npx rhino export-types` | Generate TypeScript type definitions |

### `npx rhino install`

Interactive wizard: connects Prisma, wires `RhinoModule` into `AppModule`, optionally enables multi-tenancy and audit trail, and sets up Claude Code skills. Then run `npx prisma migrate deploy`.

### `npx rhino generate`

Prompts for what to generate (`model | policy | scope`) and a PascalCase name. Writes a stub:

- **model** → `src/models/{Name}.model.ts` (a `@RhinoModel()`-decorated class; an optional alternative to config registration)
- **policy** → `src/policies/{Name}.policy.ts` (extends `ResourcePolicy`)
- **scope** → `src/scopes/{Name}.scope.ts` (implements `RhinoScope`)

Policy stub:

```ts
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  // override viewAny(user: any, org?: any): boolean { ... }
  // override create(user: any, org?: any): boolean { ... }
}
```

Scope stub:

```ts
import type { RhinoScope } from '@rhino-dev/rhino-nestjs';

export class PostScope implements RhinoScope {
  apply(query: Record<string, any>, _context: any): Record<string, any> {
    return query;
  }
}
```

The generator writes only a stub — add the Prisma column(s), register the model in `src/rhino.config.ts`, and run `npx prisma migrate dev` yourself. For end-to-end generation, use Blueprint.

---

## 14. Blueprint (YAML Code Generation)

Define your data model in YAML and generate all artifacts at once.

### Directory Structure

```
.rhino/
├── _roles.yaml          # Role definitions (shared across blueprints)
├── blueprints/
│   ├── posts.yaml       # One file per model
│   └── comments.yaml
└── BLUEPRINT.md         # AI guide
```

Created by `npx rhino install`.

### Roles File (`.rhino/_roles.yaml`)

```yaml
roles:
  owner:
    name: Owner
    description: "Full access to all resources"
  admin:
    name: Admin
    description: "Operational administrator"
  viewer:
    name: Viewer
    description: "Read-only access"
```

### Model Blueprint YAML

```yaml
model: Post                          # REQUIRED — PascalCase
slug: posts                          # Optional — auto-derived
table: posts                         # Optional — defaults to slug

options:
  belongs_to_organization: true      # multi-tenant scoping
  soft_deletes: true
  audit_trail: true
  owner: null                        # parent model for child resources
  except_actions: []
  pagination: true
  per_page: 25

columns:
  title:
    type: string
    nullable: false
    filterable: true
    sortable: true
    searchable: true
  total_value:
    type: decimal
    nullable: true
    precision: 10
    scale: 2
  author_id:
    type: foreignId
    foreign_model: User              # required for foreignId

relationships:
  - type: belongsTo
    model: User
    foreign_key: author_id

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  viewer:
    actions: [index, show]
    show_fields: [id, title, status]
    create_fields: []
    update_fields: []
    hidden_fields: [total_value]
```

**Valid column types:** `string`, `text`, `integer`, `bigInteger`, `boolean`, `date`, `datetime`, `timestamp`, `decimal`, `float`, `json`, `uuid`, `foreignId`

**Valid actions:** `index`, `show`, `store`, `update`, `destroy`, `trashed`, `restore`, `forceDelete`

**Valid relationship types:** `belongsTo`, `hasMany`, `hasOne`, `belongsToMany`

### Column Type Mapping

| Type | Prisma | Zod |
|------|--------|-----|
| `string` | `String` | `z.string().max(255)` |
| `text` | `String` | `z.string()` |
| `integer` | `Int` | `z.number().int()` |
| `boolean` | `Boolean` | `z.boolean()` |
| `date`/`datetime`/`timestamp` | `DateTime` | `z.string().datetime().or(z.date())` |
| `decimal` | `Decimal` (`Float` on SQLite) | `z.number()` |
| `float` | `Float` | `z.number()` |
| `json` | `Json` | `z.record(z.any())` |
| `uuid` | `String` | `z.string().uuid()` |
| `foreignId` | `Int` + `@relation` | `z.number().int()` |

### Command

```bash
npx rhino blueprint                 # all models
npx rhino blueprint --model=posts   # one model
npx rhino blueprint --dry-run       # preview
npx rhino blueprint --force         # ignore manifest hashes
```

### Generated Files (per model)

| Artifact | Path |
|----------|------|
| Prisma model | appended to `prisma/schema.prisma` |
| Registration | `src/resources/{Model}Resource.ts` |
| Policy | `src/policies/{Model}Policy.ts` |
| Tests (Jest) | `test/generated/{Model}.spec.ts` |
| Seeder | `src/seeders/{Model}Seeder.ts` |

After generating, import each `*Resource` into `src/rhino.config.ts` and run `npx prisma migrate dev`.

### Generated Registration & Policy

`{Model}Resource.ts` exports a `ModelRegistration` with role-keyed Zod schemas:

```ts
import { z } from 'zod';
import type { ModelRegistration } from '@rhino-dev/rhino-nestjs';
import { PostPolicy } from '../policies/PostPolicy';

const validationStore: Record<string, z.ZodTypeAny> = {
  owner: z.object({ title: z.string(), totalValue: z.number().nullable().optional() }),
  viewer: z.object({}),
};

export const postsRegistration: ModelRegistration = {
  model: 'Post',
  policy: PostPolicy,
  validationStore,
  allowedFilters: ['title', 'status'],
  belongsToOrganization: true,
  softDeletes: true,
  hasAuditTrail: true,
};
```

`{Model}Policy.ts` has fully working attribute methods:

```ts
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  override permittedAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'owner', org) || this.hasRole(user, 'admin', org)) return ['*'];
    if (this.hasRole(user, 'viewer', org)) return ['id', 'title', 'status'];
    return [];
  }

  override hiddenAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'viewer', org)) return ['totalValue'];
    return [];
  }
  // permittedAttributesForCreate / Update follow the same pattern
}
```

### Manifest Tracking

`.rhino/blueprints/.blueprint-manifest.json` stores SHA-256 hashes; unchanged files are skipped. Use `--force` to bypass.

### Discovery Interview (when asked to create blueprints)

**IMPORTANT:** Ask discovery questions BEFORE writing any YAML. Cover:

1. **What does the app do?** (context for defaults)
2. **Multi-tenant?** (drives `belongs_to_organization` + `tenant` route group; ask how orgs are identified — slug vs id)
3. **What are the user roles?** (drives `_roles.yaml` and every `permissions` block)
4. **What are the main entities/models?** (fields, types, relations; per-model: belongs to org directly or via parent? soft deletes? audit trail? excluded actions?)
5. **Permission rules per role per model?** (actions; `create_fields` vs `update_fields`; hidden fields)
6. **Filterable/sortable/searchable fields?** (status/FKs → filterable; dates → sortable; name/title → sortable + searchable)
7. **Any public (unauthenticated) endpoints?** (need a `public` group; policies must handle `null` user)
8. **Pagination + page sizes?** (`pagination: true`, `per_page: N`)

Then build `_roles.yaml`, one YAML per model, validate (every `foreignId` has `foreign_model`; every role exists; referenced fields exist), and run `npx rhino blueprint --dry-run` then `npx rhino blueprint`.

### Cross-Framework

| Concern | Laravel | NestJS |
|---------|---------|--------|
| CLI | `php artisan rhino:blueprint` | `npx rhino blueprint` |
| Models | Eloquent + traits | Prisma + `ModelRegistration` |
| Validation | Laravel rules | Zod schemas |
| Tests | Pest / PHPUnit | Jest |
| Migrations | Laravel migrations | Prisma migrations |
| Config | `config/rhino.php` | `src/rhino.config.ts` |

---

## 15. Public Route Groups

Use the reserved `public` group (implies `skipAuth`):

```ts
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

routeGroups: {
  public: { prefix: 'public', skipAuth: true, models: ['categories', 'tags'] },
  tenant: { prefix: ':organization', middleware: [ResolveOrganizationMiddleware], models: '*' },
},
```

### CRITICAL: Handle `null` users in the policy

When a model is exposed publicly, the policy must handle `user === null`:

```ts
import { ResourcePolicy, userHasPermission } from '@rhino-dev/rhino-nestjs';

export class CategoryPolicy extends ResourcePolicy {
  override resourceSlug = 'categories';

  override viewAny(_user: any): boolean { return true; }
  override view(_user: any, _record: any): boolean { return true; }

  override create(user: any): boolean { return !!user && userHasPermission(user, '*'); }
  override update(user: any, _record: any): boolean { return !!user && userHasPermission(user, '*'); }
  override delete(user: any, _record: any): boolean { return !!user && userHasPermission(user, '*'); }

  override hiddenAttributesForShow(user: any): string[] {
    return user ? [] : ['internalNotes', 'adminComment'];
  }

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org) ? ['name', 'slug', 'description'] : [];
  }
}
```

---

## 16. Hybrid Multi-Tenant Architecture

```ts
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

models: {
  trips:      { model: 'trip' },
  trucks:     { model: 'truck' },
  materials:  { model: 'material' },
  categories: { model: 'category' },
},

routeGroups: {
  tenant: { prefix: ':organization', middleware: [ResolveOrganizationMiddleware], models: '*' },
  driver: { prefix: 'driver', tenant: false, models: ['trips', 'trucks'] },
  admin:  { prefix: 'admin', tenant: false, models: '*' },
  public: { prefix: 'public', skipAuth: true, models: ['materials', 'categories'] },
},

multiTenant: { enabled: true, organizationIdentifierColumn: 'slug' },
```

| Group | URL Pattern | Auth | Org Scoped |
|-------|-------------|------|------------|
| tenant | `/api/:organization/trips` | Yes | Yes |
| driver | `/api/driver/trips` | Yes | No |
| admin | `/api/admin/trips` | Yes | No |
| public | `/api/public/materials` | No | No |

### Custom Scoping for Non-Tenant Groups

Attach a `RhinoScope`; `ctx` carries the user and resolved route group:

```ts
// src/scopes/TripScope.ts
import type { RhinoScope } from '@rhino-dev/rhino-nestjs';

export class TripScope implements RhinoScope {
  apply(where: Record<string, any>, ctx: { user?: any; routeGroup?: string | null }) {
    if (ctx.routeGroup === 'driver' && ctx.user?.driverId)
      return { ...where, driverId: ctx.user.driverId };
    return where;
  }
}
```

```ts
models: { trips: { model: 'trip', scopes: [TripScope] } },
```

---

## 17. Nested Filtering & Including

### Relationship Search

```ts
posts: { model: 'post', allowedSearch: ['title', 'content', 'author.name', 'category.name'] },
```

```bash
GET /api/posts?search=john   # searches posts AND related author/category names
```

Dot-notation search columns resolve via a nested Prisma relation filter.

### Nested Includes

```bash
GET /api/posts?include=comments.user
GET /api/posts?include=comments.user,tags
```

Top-level relation must be in `allowedIncludes`. Authorization checks both parent and nested resources.

### Count and Exists

```bash
GET /api/posts?include=commentsCount    # numeric
GET /api/posts?include=commentsExists   # boolean
```

```json
{ "id": 1, "title": "My Post", "comments_count": 15, "comments_exists": true }
```

Authorized against the base relation (`comments.index`).

### Combined

```bash
GET /api/posts?filter[status]=published&include=author,commentsCount&search=typescript&sort=-createdAt&per_page=10
```

---

## 18. Security: Organization ID Protection

### The Problem

```json
POST /api/acme-corp/posts
{ "title": "Legit Post", "organizationId": 999 }   // attacker tries another org
```

### Defenses

1. **Input stripping** — the controller strips client-supplied `organizationId`/`organization_id` and sets it from `req.organization.id`.
2. **Auto-set on create** — `belongsToOrganization: true` sets `organizationId` from the resolved org.
3. **Policy field permissions** — never list `organizationId` in `permittedAttributesForCreate/Update`.
4. **Query scoping** — all reads are scoped to the current org; a mis-tagged record never appears for the wrong org.

### Best Practices

1. **Never** put `organizationId` in `validation` schemas.
2. **Never** put `organizationId` in `permittedAttributesForCreate`/`permittedAttributesForUpdate`.
3. **Always** set `belongsToOrganization: true` on tenant-scoped models.
4. **Always** use a `tenant` route group with `ResolveOrganizationMiddleware`.
5. **Never** trust client-supplied `organizationId`.

---

## 19. Testing with Jest

**CRITICAL: Every code change MUST include tests.**

NestJS Rhino apps test with **Jest**. There are two common styles.

### Controller-level tests (fast, no HTTP server)

This is the style the Blueprint generator emits. Build the controllers from a config and call them directly:

```ts
import { buildEnv } from '../../test/helpers/make-controller';
import type { RhinoConfig } from '@rhino-dev/rhino-nestjs';

function makeConfig(overrides: Partial<RhinoConfig> = {}): RhinoConfig {
  return {
    models: {
      posts: { model: 'post', belongsToOrganization: true, softDeletes: true, hasAuditTrail: true },
    },
    ...overrides,
  };
}

function makeUser(role: string, perms: string[] = [], orgId = 1) {
  return { id: 1, userRoles: [{ organizationId: orgId, permissions: perms, role: { slug: role } }] };
}

const adminPerms = ['posts.index', 'posts.show', 'posts.store', 'posts.update', 'posts.destroy'];

describe('Post resource', () => {
  it('index returns records for the current org', async () => {
    const env = buildEnv(makeConfig(), { post: [{ id: 1, title: 'A', organizationId: 1 }] });
    const req = { user: makeUser('admin', adminPerms), organization: { id: 1 } } as any;
    const res: any = await env.controllers.global.index('posts', {}, req);
    expect(res).toBeDefined();
  });

  it('store returns 403 without permission', async () => {
    const env = buildEnv(makeConfig(), { post: [] });
    const req = { user: makeUser('viewer', ['posts.index']), organization: { id: 1 } } as any;
    await expect(env.controllers.global.store('posts', { title: 'X' }, req)).rejects.toThrow();
  });
});
```

> `buildEnv` is the library's test helper. In your app, use your own helper or the published one re-exported from `@rhino-dev/rhino-nestjs/testing`.

### HTTP/e2e tests (Jest + supertest)

```ts
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { applyRhinoRouting } from '@rhino-dev/rhino-nestjs';
import { AppModule } from '../src/app.module';

describe('Posts (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyRhinoRouting(app, { prefix: 'api' });
    await app.init();
    // seed an org + user, then login to get a JWT
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'secret' });
    token = login.body.token;
  });

  afterAll(async () => app.close());

  it('lists posts for the org', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/acme/posts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 403 when lacking permission', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/acme/posts')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'X', content: 'Y' });
    expect(res.status).toBe(403);
  });

  it('does not leak posts from another org', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/acme/posts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toHaveLength(0); // posts belong to a different org
  });

  it('paginates with correct headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/acme/posts?page=1&per_page=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.headers['x-total']).toBe('25');
    expect(res.headers['x-per-page']).toBe('10');
  });
});
```

### What to Test for Every Model

| Category | Assert |
|---|---|
| **CRUD** | 200/201 allowed, 403 denied |
| **Org isolation** | Other-org records never returned |
| **Validation** | 422 with invalid data |
| **Field permissions** | 403 on forbidden fields |
| **Filtering / Sorting / Search** | Correct results |
| **Pagination** | Correct headers and sizes |
| **Includes** | Related data loaded; 403 without permission |
| **Soft deletes** | Delete sets `deletedAt`; trashed endpoint works |
| **Audit trail** | `audit_logs` rows created for CUD |
| **Role-based access** | Different roles see different data/actions |

### Auditing a creation

```ts
it('creates an audit log on creation', async () => {
  await request(app.getHttpServer())
    .post('/api/acme/posts')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Audit Test', content: 'Testing' });

  const logs = await prisma.auditLog.findMany({ where: { auditableType: 'posts' } });
  expect(logs).toHaveLength(1);
  expect(logs[0].action).toBe('created');
});
```

Run tests: `npm test` (or `npx jest path/to/file.spec.ts`).

---

## 20. Comprehensive Q&A

### Getting Started

**Q: How do I install Rhino?**
A: `npm install @rhino-dev/rhino-nestjs` then `npx rhino install`, then `npx prisma migrate deploy`.

**Q: How do I add a new resource?**
A: (1) Add a Prisma model in `prisma/schema.prisma`, (2) add a `ModelRegistration` to `models` in `src/rhino.config.ts`, (3) run `npx prisma migrate dev`.

**Q: What is the `model` field?**
A: The Prisma client delegate name (camelCase) — `prisma.post` → `model: 'post'`.

**Q: What does `RhinoModule.forRoot()` do?**
A: Merges your `RhinoConfig` with sensible defaults and registers the controllers/services. Routes are applied by `applyRhinoRouting(app, { prefix: 'api' })` in `main.ts`.

### Models

**Q: How do I add audit trail and org scoping?**
A: `{ model: 'post', hasAuditTrail: true, belongsToOrganization: true }`.

**Q: What columns are hidden by default?**
A: `password`, `rememberToken`, `createdAt`, `updatedAt`, `deletedAt`. Add more via `additionalHiddenColumns`.

**Q: Do I declare all fields?**
A: No — only what differs from defaults (`paginationEnabled: true`, `perPage: 25`, empty arrays).

**Q: Custom URL slug?**
A: The map key is the slug: `'blog-posts': { model: 'blogPost' }` → `/api/blog-posts`.

**Q: Computed/virtual attributes?**
A: `computedAttributes: (record, user) => ({ ... })`. Merged before policy filtering, so they respect blacklist/whitelist.

**Q: Exclude CRUD actions?**
A: `exceptActions: ['store', 'update', 'destroy']`.

### Policies & Permissions

**Q: Minimal policy?**
A: `class PostPolicy extends ResourcePolicy { override resourceSlug = 'posts'; }`, attached via `policy: PostPolicy`.

**Q: Wildcards?**
A: `*` = everything; `posts.*` = all actions on posts.

**Q: Users update only their own records?**
A: Override `update`: `if (record.userId === user?.id) return true; return super.update(user, record, org);`

**Q: Forbidden field submitted?**
A: 403 — `"Forbidden: you are not allowed to set the following fields: ..."`.

**Q: Where are permissions stored?**
A: Non-tenant → `users.permissions`. Tenant → `user_roles.permissions` (per org).

### Validation

**Q: Where do I define validation?**
A: Zod schemas in the registration (`validation`/`validationStore`/`validationUpdate`); field access in the policy.

**Q: 403 vs 422?**
A: 403 = forbidden fields (policy). 422 = Zod format failure. 403 runs first.

**Q: Per-role rules?**
A: Use role-keyed `validationStore`/`validationUpdate` (a `Record<string, ZodSchema>` with a `'*'` fallback).

### Query Builder

**Q: Multiple filter values?**
A: Comma-separated: `?filter[status]=draft,published` (IN clause).

**Q: Unallowed filter fields?**
A: Silently ignored (security feature).

**Q: Search across relations?**
A: Dot notation in `allowedSearch` (`'author.name'`) → nested relation filter.

**Q: Nested includes / counts?**
A: `?include=comments.user`, `?include=commentsCount`, `?include=commentsExists`.

### Multi-Tenancy

**Q: Enable multi-tenancy?**
A: Add a `tenant` group with `ResolveOrganizationMiddleware`, plus `multiTenant: { enabled: true, ... }`.

**Q: Nested model scoping?**
A: Set `owner: 'post'` so Rhino walks Comment → post → organization.

**Q: Subdomain tenancy?**
A: Parameterized `domain: '{organization}.example.com'` + `createDomainRouteResolver` in `main.ts`.

### Route Groups

**Q: Public endpoints?**
A: Reserved `public` group (`skipAuth: true`); the policy must handle `user === null`.

**Q: Model in multiple groups?**
A: List it in multiple groups; each generates its own routes.

**Q: Where do invitation routes live?**
A: Under the `tenant` group at `/api/:organization/invitations`.

### Soft Deletes

**Q: Enable?**
A: `softDeletes: true` + a nullable `deletedAt` column.

**Q: Permissions?**
A: `posts.trashed`, `posts.restore`, `posts.forceDelete`.

### Audit Trail

**Q: Breaks the app if the table is missing?**
A: No — logging is fail-safe (try/catch).

**Q: Update logs when nothing changed?**
A: No — only dirty fields are recorded.

### Nested Operations

**Q: One operation fails?**
A: Everything rolls back (all-or-nothing).

**Q: Mix create and update?**
A: Yes.

**Q: Org scoping?**
A: Creates get `organizationId` injected; updates scoped to the current org.

### Invitations

**Q: Restrict who can invite?**
A: `invitations: { allowedRoles: ['admin', 'manager'] }`.

**Q: Invitation expires?**
A: Status set to `expired`, 422 returned. Can be resent.

**Q: Send the email?**
A: Provide `invitations.notificationHandler(invitation)` and send via your transport.

### Generator

**Q: Resource naming?**
A: PascalCase singular: `Post`, `BlogPost`.

**Q: Generate just a policy?**
A: Yes — choose "policy" in `npx rhino generate`.

### Security

**Q: Can a user inject `organizationId`?**
A: No — input is stripped and the org comes from the resolved request context; queries are org-scoped.

**Q: Include `organizationId` in validation/permitted fields?**
A: Never — it's always set by the framework.

---

## Complete Project Example: Multi-Tenant Blog Platform

### 1. Install

```bash
npm install @rhino-dev/rhino-nestjs
npx rhino install   # enable multi-tenancy + audit trail
npx prisma migrate deploy
```

### 2. Prisma Schema

```prisma
// prisma/schema.prisma
model Organization {
  id    Int    @id @default(autoincrement())
  name  String
  slug  String @unique
  posts Post[]
  @@map("organizations")
}

model User {
  id          Int     @id @default(autoincrement())
  name        String
  email       String  @unique
  password    String
  permissions String?
  posts       Post[]
  comments    Comment[]
  @@map("users")
}

model Post {
  id             Int       @id @default(autoincrement())
  title          String
  content        String
  excerpt        String?
  status         String    @default("draft")
  userId         Int
  organizationId Int
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  author       User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])
  comments     Comment[]
  @@map("posts")
}

model Comment {
  id        String   @id @default(uuid())
  body      String
  userId    Int
  postId    Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
  post Post @relation(fields: [postId], references: [id])
  @@map("comments")
}

model Category {
  id          Int     @id @default(autoincrement())
  name        String
  slug        String  @unique
  description String?
  @@map("categories")
}
```

### 3. Configuration

```ts
// src/rhino.config.ts
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { ResolveOrganizationMiddleware, type RhinoConfig } from '@rhino-dev/rhino-nestjs';
import { PostPolicy } from './policies/PostPolicy';
import { CommentPolicy } from './policies/CommentPolicy';
import { CategoryPolicy } from './policies/CategoryPolicy';

export function buildRhinoConfig(prisma: PrismaClient): RhinoConfig {
  return {
    prismaClient: prisma as any,
    models: {
      posts: {
        model: 'post',
        policy: PostPolicy,
        softDeletes: true,
        belongsToOrganization: true,
        hasAuditTrail: true,
        allowedFilters: ['status', 'userId'],
        allowedSorts: ['createdAt', 'title'],
        defaultSort: '-createdAt',
        allowedIncludes: ['author', 'comments'],
        allowedSearch: ['title', 'content', 'excerpt'],
        perPage: 20,
        validation: z.object({
          title: z.string().max(255),
          content: z.string(),
          excerpt: z.string().max(500).nullable().optional(),
          status: z.enum(['draft', 'published', 'archived']),
        }),
      },
      comments: {
        model: 'comment',
        policy: CommentPolicy,
        owner: 'post', // Comment -> post -> organization
        allowedFilters: ['postId', 'userId'],
        allowedSorts: ['createdAt'],
        defaultSort: '-createdAt',
        allowedIncludes: ['user', 'post'],
        allowedSearch: ['body'],
        validation: z.object({ body: z.string().max(5000), postId: z.number().int() }),
      },
      categories: {
        model: 'category',
        policy: CategoryPolicy,
        paginationEnabled: false,
        allowedSorts: ['name'],
        defaultSort: 'name',
        allowedSearch: ['name', 'description'],
        validation: z.object({
          name: z.string().max(100),
          slug: z.string().max(100),
          description: z.string().max(500).nullable().optional(),
        }),
      },
    },
    routeGroups: {
      tenant: { prefix: ':organization', middleware: [ResolveOrganizationMiddleware], models: ['posts', 'comments'] },
      public: { prefix: 'public', skipAuth: true, models: ['categories'] },
    },
    multiTenant: { enabled: true, organizationIdentifierColumn: 'slug', organizationModel: 'organization', userOrganizationModel: 'userRole' },
    auth: { jwtSecret: process.env.JWT_SECRET ?? 'change-me', jwtExpiresIn: '7d', userModel: 'user' },
    invitations: { expiresDays: 7, allowedRoles: ['admin'] },
    nested: { path: 'nested', maxOperations: 50, allowedModels: ['posts', 'comments'] },
  };
}
```

### 4. Policies

```ts
// src/policies/PostPolicy.ts
import { ResourcePolicy, userHasPermission } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  override update(user: any, record: any, org?: any): boolean {
    if (record.userId === user?.id) return true;
    return super.update(user, record, org);
  }

  override delete(user: any, record: any, org?: any): boolean {
    if (userHasPermission(user, '*', org)) return true;
    return record.userId === user?.id;
  }

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org)
      ? ['title', 'content', 'excerpt', 'status']
      : ['title', 'content', 'excerpt'];
  }

  override permittedAttributesForUpdate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'content', 'excerpt', 'status'];
  }
}
```

```ts
// src/policies/CategoryPolicy.ts (public model — handle null user)
import { ResourcePolicy, userHasPermission } from '@rhino-dev/rhino-nestjs';

export class CategoryPolicy extends ResourcePolicy {
  override resourceSlug = 'categories';

  override viewAny(_user: any): boolean { return true; }
  override view(_user: any, _record: any): boolean { return true; }

  override create(user: any): boolean { return !!user && userHasPermission(user, '*'); }
  override update(user: any, _record: any): boolean { return !!user && userHasPermission(user, '*'); }
  override delete(user: any, _record: any): boolean { return !!user && userHasPermission(user, '*'); }

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org) ? ['name', 'slug', 'description'] : [];
  }
}
```

### 5. App Module & Bootstrap

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { RhinoModule, JwtAuthGuard, ResponseInterceptor } from '@rhino-dev/rhino-nestjs';
import { buildRhinoConfig } from './rhino.config';

const prisma = new PrismaClient();

@Module({
  imports: [RhinoModule.forRoot(buildRhinoConfig(prisma), { registerControllers: true, autoPolicyGuard: true, autoRouteGroupMiddleware: true })],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor }],
})
export class AppModule {}
```

```ts
// src/main.ts
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

### 6. Run

```bash
npx prisma migrate deploy
npm test
```

Your API is now live:

```
# Tenant routes
GET/POST           /api/:organization/posts
GET/PUT/DELETE     /api/:organization/posts/:id
GET                /api/:organization/posts/trashed
POST               /api/:organization/posts/:id/restore
DELETE             /api/:organization/posts/:id/force-delete
GET/POST           /api/:organization/comments
POST               /api/:organization/nested
GET/POST           /api/:organization/invitations

# Public routes
GET                /api/public/categories
GET                /api/public/categories/:id

# Auth routes
POST               /api/auth/login
POST               /api/auth/logout
POST               /api/auth/register
POST               /api/auth/password/recover
POST               /api/auth/password/reset
POST               /api/invitations/accept
```
