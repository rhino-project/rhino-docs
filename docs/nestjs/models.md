---
sidebar_position: 3
title: Models
---

# Models

In Rhino for NestJS, a "model" is a plain **Prisma** model plus a **`ModelRegistration`** object that tells Rhino how to expose it as a REST API. The Prisma model lives in `prisma/schema.prisma`; the registration lives in `src/rhino.config.ts`. There is no base class to extend, no decorators, and no mixins — every behavior (filtering, sorting, search, pagination, validation, authorization, soft deletes, audit trail, multi-tenancy) is declared as a field on the registration object.

## The Prisma Model

Define your data model in `prisma/schema.prisma` exactly as you would in any Prisma project:

```prisma title="prisma/schema.prisma"
model Post {
  id             Int       @id @default(autoincrement())
  title          String
  content        String?
  status         String    @default("draft")
  userId         Int
  categoryId     Int?
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

The `model` key in your registration is the **Prisma client delegate name** for this model (`prisma.post` → `'post'`). Prisma exposes delegates in camelCase, so use `'post'`, `'blogPost'`, etc.

## ModelRegistration

Register the model in `src/rhino.config.ts`. The map key becomes the URL slug and permission prefix:

```ts title="src/rhino.config.ts"
import { z } from 'zod';
import type { RhinoConfig } from '@rhino-dev/rhino-nestjs';
import { PostPolicy } from './policies/PostPolicy';
import { PublishedScope } from './scopes/PublishedScope';

models: {
  posts: {
    model: 'post',                 // Prisma delegate name (required)
    policy: PostPolicy,            // ResourcePolicy subclass

    // -- Validation (Zod) --
    validation: z.object({         // applied to both store and update
      title: z.string().max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
    }),

    // -- Query builder --
    allowedFilters: ['status', 'userId', 'categoryId'],
    allowedSorts: ['createdAt', 'title', 'updatedAt'],
    defaultSort: '-createdAt',
    allowedFields: ['id', 'title', 'content', 'status'],
    allowedIncludes: ['author', 'comments'],
    allowedSearch: ['title', 'content'],

    // -- Pagination --
    paginationEnabled: true,
    perPage: 25,

    // -- Soft deletes --
    softDeletes: true,

    // -- Multi-tenancy & audit --
    belongsToOrganization: true,
    hasAuditTrail: true,

    // -- Custom scopes --
    scopes: [PublishedScope],

    // -- Middleware --
    actionMiddleware: { store: [VerifiedMiddleware] },

    // -- Route exclusion --
    exceptActions: ['destroy'],    // skip DELETE endpoint
  },
},
```

### Property Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | — | **Required.** The Prisma client delegate name (e.g., `'post'`). |
| `policy` | `Type<ResourcePolicy>` | — | A `ResourcePolicy` subclass for authorization. See [Policies](./policies). |
| `validation` | `ZodSchema` | — | Zod schema applied to both store and update. |
| `validationStore` | `ZodSchema \| Record<string, ZodSchema>` | — | Overrides `validation` for create. Role-keyed when a record. |
| `validationUpdate` | `ZodSchema \| Record<string, ZodSchema>` | — | Overrides `validation` for update. Role-keyed when a record. |
| `allowedFilters` | `string[]` | `[]` | Fields filterable via `?filter[field]=value`. |
| `allowedSorts` | `string[]` | `[]` | Fields sortable via `?sort=field`. Prefix with `-` for descending. |
| `defaultSort` | `string` | — | Sort applied when no `?sort` is provided (e.g., `'-createdAt'`). |
| `allowedFields` | `string[]` | `[]` | Fields selectable via `?fields[model]=field1,field2`. |
| `allowedIncludes` | `string[]` | `[]` | Prisma relations eager-loadable via `?include=relation`. |
| `allowedSearch` | `string[]` | `[]` | Fields searched when `?search=term` is used. Supports relation dot notation (`'author.name'`). |
| `paginationEnabled` | `boolean` | `true` | Enables pagination for the index endpoint. |
| `perPage` | `number` | `25` | Records per page when pagination is enabled. |
| `softDeletes` | `boolean` | `false` | Enables trashed/restore/force-delete endpoints. Requires a `deletedAt` column. |
| `belongsToOrganization` | `boolean` | `false` | Scopes queries to the current organization and auto-sets `organizationId` on create. |
| `hasAuditTrail` | `boolean` | `false` | Logs create/update/delete/restore/force-delete to `audit_logs`. |
| `hasUuid` | `boolean` | `false` | Treats the primary key as a string UUID. |
| `additionalHiddenColumns` | `string[]` | `[]` | Extra columns always hidden from responses for this model. |
| `auditExclude` | `string[]` | `[]` | Fields excluded from audit-log snapshots. |
| `computedAttributes` | `(record, user) => Record<string, any>` | — | Virtual attributes merged into responses (before policy filtering). |
| `scopes` | `Type<RhinoScope>[]` | `[]` | Custom scope classes applied to every query. |
| `owner` | `string` | — | Parent relation/FK used for nested-ownership scoping of child resources. |
| `fkConstraints` | `Array<{ field, model }>` | — | Foreign keys verified against the current organization. |
| `middleware` | `Type<NestMiddleware>[]` | `[]` | NestJS middleware applied to **all** routes for this model. |
| `actionMiddleware` | `Record<string, Type<NestMiddleware>[]>` | `{}` | Middleware applied to **specific** actions (`index`, `show`, `store`, `update`, `destroy`). |
| `exceptActions` | `string[]` | `[]` | CRUD actions to exclude. Valid: `index`, `show`, `store`, `update`, `destroy`, `trashed`, `restore`, `forceDelete`. |

:::tip
You only need to declare properties that differ from their defaults. If you do not need filtering, simply omit `allowedFilters`.
:::

## Behaviors (Formerly "Mixins")

Each behavior is a flag or field on the registration. The table below maps the conceptual behaviors to their registration fields.

### Query configuration

`allowedFilters`, `allowedSorts`, `defaultSort`, `allowedIncludes`, `allowedFields`, `allowedSearch`, `paginationEnabled`, and `perPage` configure the query builder. See [Querying](./querying) for full details.

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  allowedFilters: ['status', 'userId'],
  allowedSorts: ['createdAt', 'title'],
  defaultSort: '-createdAt',
  allowedIncludes: ['author', 'comments'],
  allowedSearch: ['title', 'content'],
  allowedFields: ['id', 'title', 'content', 'status'],
  paginationEnabled: true,
  perPage: 20,
},
```

### Validation

Provide Zod schemas via `validation`, `validationStore`, or `validationUpdate`. Field permissions (which fields each user can submit) are controlled by the **policy**, not the schema.

```ts title="src/rhino.config.ts"
import { z } from 'zod';

posts: {
  model: 'post',
  validation: z.object({
    title: z.string().max(255),
    content: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
  }),
},
```

See [Validation](./validation) for the full breakdown and [Policies — Attribute Permissions](./policies#attribute-permissions) for field permissions.

### Role-based permissions

Permission checking is provided by the [policy](./policies) and resolved from the user's permissions (`users.permissions` for non-tenant routes, `user_roles.permissions` for tenant routes). There is no per-model flag — register a `policy` and define your permission matrix there.

### Audit trail

Set `hasAuditTrail: true` to record changes to the `audit_logs` table. Use `auditExclude` to keep sensitive fields out of the snapshots.

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  hasAuditTrail: true,
  auditExclude: ['password', 'rememberToken'],
},
```

See the [Audit Trail](./audit-trail) page for details.

### UUID primary keys

Set `hasUuid: true` when the model's primary key is a string UUID. Define it in Prisma with `@default(uuid())`:

```prisma title="prisma/schema.prisma"
model Invoice {
  id        String   @id @default(uuid())
  // ...
  @@map("invoices")
}
```

```ts title="src/rhino.config.ts"
invoices: {
  model: 'invoice',
  hasUuid: true,
},
```

### Custom scopes

Pass scope classes implementing `RhinoScope` via `scopes`. Each scope's `apply(where, ctx)` augments the Prisma `where` clause for every query on the model.

```ts title="src/scopes/PublishedScope.ts"
import type { RhinoScope } from '@rhino-dev/rhino-nestjs';

export class PublishedScope implements RhinoScope {
  apply(where: Record<string, any>, ctx: { user?: any; userRole?: string | null }) {
    if (ctx.userRole !== 'admin') {
      return { ...where, status: 'published' };
    }
    return where;
  }
}
```

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  scopes: [PublishedScope],
},
```

### Organization scoping

Set `belongsToOrganization: true` for multi-tenant scoping. Rhino filters every query to the current organization and auto-sets `organizationId` on create. For nested models without a direct `organizationId`, use `owner` to point at the parent relation Rhino should walk to find the organization.

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  belongsToOrganization: true,
},
comments: {
  model: 'comment',
  owner: 'post', // Comment -> post -> organization
},
```

See the [Multi-Tenancy](./multi-tenancy) page for full details.

### Hidden columns

Columns are hidden in layers:

1. **Base hidden columns** (always hidden): `password`, `rememberToken`, `createdAt`, `updatedAt`, `deletedAt`
2. **Model-level** via `additionalHiddenColumns`
3. **Policy-level** via `hiddenAttributesForShow()` (per-user dynamic hiding)
4. **Policy-level whitelist** via `permittedAttributesForShow()` (only listed attributes returned)

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  additionalHiddenColumns: ['apiToken', 'stripeId'],
},
```

#### Computed attributes

Use `computedAttributes` to add virtual (non-column) values to responses. The function receives the record and the current user and returns an object that is merged into the serialized output **before** policy filtering, so it is still subject to `hiddenAttributesForShow()` / `permittedAttributesForShow()`.

```ts title="src/rhino.config.ts"
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

Computed attributes can be controlled per-role via the policy:

```ts title="src/policies/ContractPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class ContractPolicy extends ResourcePolicy {
  override resourceSlug = 'contracts';

  override hiddenAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'admin', org)) return [];
    return ['days_until_expiry']; // Only admins see the computed value
  }
}
```

## Registration Slugs

The map key (e.g., `blog-posts`) is the URL slug **and** the permission prefix:

```ts title="src/rhino.config.ts"
models: {
  'blog-posts': { model: 'blogPost' },
  comments:     { model: 'comment' },
  categories:   { model: 'category' },
  tags:         { model: 'tag' },
},
```

With this configuration, Rhino generates routes such as:

```
GET    /api/blog-posts
GET    /api/blog-posts/:id
POST   /api/blog-posts
PUT    /api/blog-posts/:id
DELETE /api/blog-posts/:id
```

:::warning
The slug (e.g., `blog-posts`) is used as the permission prefix. Make sure it matches what you use in your role permission definitions (e.g., `blog-posts.store`, `blog-posts.index`).
:::
