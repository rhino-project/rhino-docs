---
sidebar_position: 8
title: Multi-Tenancy
---

# Multi-Tenancy

Rhino provides built-in multi-tenancy support that isolates data by organization. When an organization is present in the request context (set by middleware), all queries are automatically scoped to that organization, and new records are tagged with the correct `organization_id`.

Multi-tenancy is configured via [Route Groups](./route-groups). Use a `tenant` route group with organization-resolving middleware to enable org-scoped routing.

## Configuration

Enable multi-tenancy by adding a `tenant` route group in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
import { RhinoModule } from "@rhino-dev/rhino-nestjs";  // wire via RhinoModule.forRoot() in your AppModule

RhinoModule.forRoot({
  routeGroups: {
    tenant: {
      prefix: ':organization',
      middleware: ['rhino:resolveOrg'],
      models: '*',
    },
  },
  multiTenant: {
    organizationIdentifierColumn: 'slug',
  },
})
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `organizationIdentifierColumn` | `string` | `'id'` | The column used to look up the organization. Common values: `'id'`, `'slug'`, `'uuid'`. |

## Routing Strategies

### URL Prefix Mode

Use a `tenant` route group with a parameterized prefix:

```ts title="src/rhino.config.ts"
routeGroups: {
  tenant: {
    prefix: ':organization',
    middleware: ['rhino:resolveOrg'],
    models: '*',
  },
},
```

Routes:

```
GET    /api/:organization/posts
POST   /api/:organization/posts
GET    /api/:organization/posts/:id
PUT    /api/:organization/posts/:id
DELETE /api/:organization/posts/:id
```

The `ResolveOrganizationFromRoute` middleware extracts the `:organization` parameter and looks up the Organization model by the configured identifier column.

### Subdomain Mode

Use a `tenant` route group with the subdomain middleware:

```ts title="src/rhino.config.ts"
routeGroups: {
  tenant: {
    prefix: '',
    middleware: ['rhino:resolveOrgSubdomain'],
    models: '*',
  },
},
```

Routes:

```
GET    https://acme.example.com/api/posts
POST   https://acme.example.com/api/posts
```

The `ResolveOrganizationFromSubdomain` middleware extracts the subdomain (e.g., `acme` from `acme.example.com`) and looks up the organization by the `domain` column first, then by the identifier column.

The following subdomains are skipped (treated as non-tenant): `www`, `app`, `api`, `localhost`, `127.0.0.1`.

## ResolveOrganizationFromRoute Middleware

This middleware handles URL-prefix-based tenant resolution:

1. Extracts the `organization` parameter from the route
2. Looks up the Organization model by the configured `organizationIdentifierColumn`
3. Verifies the authenticated user belongs to the organization
4. Sets `ctx.organization` for downstream controllers and policies

```ts
import ResolveOrganizationFromRoute from '@rhino-dev/rhino-nestjs/middleware/resolve_organization_from_route'
```

If the organization is not found, a `404` is returned. If the user does not belong to the organization, a `404` is returned (to avoid leaking the existence of organizations).

## ResolveOrganizationFromSubdomain Middleware

This middleware handles subdomain-based tenant resolution:

1. Extracts the subdomain from the `Host` header (strips port if present)
2. Skips known non-tenant subdomains (`www`, `app`, `api`, `localhost`)
3. Looks up the Organization model by `domain` column or by the identifier column
4. Verifies the authenticated user belongs to the organization
5. Sets `ctx.organization` for downstream consumers

```ts
import ResolveOrganizationFromSubdomain from '@rhino-dev/rhino-nestjs/middleware/resolve_organization_from_subdomain'
```

If the user does not belong to the organization in subdomain mode, a `403` is returned.

## BelongsToOrganization Mixin

The `BelongsToOrganization` mixin provides automatic organization scoping at the model level:

```ts title="app/models/post.ts"
import { compose } from '@nestjs/core/helpers'
import { BaseModel, column, belongsTo } from '@nestjs/lucid/orm'
import type { BelongsTo } from '@nestjs/lucid/types/relations'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'
import Organization from '#models/organization'

export default class Post extends compose(BaseModel, BelongsToOrganization) {
  @column()
  declare organizationId: number

  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>
}
```

### What the Mixin Does

**Auto-sets `organizationId` on create:**

A `before:create` hook automatically sets `organizationId` from the current HTTP context (via `ctx.organization.id`). This is skipped if:
- The `organizationId` is already set explicitly
- The code is running outside an HTTP context (e.g., Ace commands, tests, queue workers)

**Global query scope:**

The mixin uses Prisma hooks (`before('find')`, `before('fetch')`, `before('paginate')`) to automatically filter by `organization_id` when an HTTP context with an organization is available. This means every query for the model is tenant-scoped without any manual intervention:

```ts
// Automatically scoped to the current organization
const posts = await Post.query().where('status', 'published')
// SQL: SELECT * FROM posts WHERE organization_id = ? AND status = 'published'
```

**Manual scoping:**

For contexts outside of HTTP requests (background jobs, admin tools), use the static `scopeForOrganization()` method:

```ts
const posts = await Post.query()
  .apply((scopes) => Post.scopeForOrganization(scopes, organization))
```

Or directly:

```ts
Post.scopeForOrganization(query, organization)
```

:::info
The global organization scope is skipped when running in a console context (e.g., Ace commands, tests, queue workers) since there is no HTTP request context available.
:::

## Nested Organization Scoping (Auto-Detected)

Not every model has a direct `organization_id` column. For nested models, Rhino automatically walks `belongsTo` relationships to find the nearest model that holds the organization reference. No explicit configuration is needed:

```ts title="app/models/comment.ts"
export default class Comment extends compose(BaseModel, HasRhino, BelongsToOrganization) {
  // Organization path is auto-detected: Comment -> post -> organization
  @column()
  declare postId: number

  @belongsTo(() => Post)
  declare post: BelongsTo<typeof Post>
}
```

Rhino traverses `Comment -> post` to find the organization using a nested `whereHas` call:

```sql
SELECT * FROM comments
WHERE EXISTS (
  SELECT 1 FROM posts WHERE posts.id = comments.post_id AND posts.organization_id = ?
)
```

Deep nesting is also auto-detected (e.g., `Reply -> comment -> post -> organization`).

## Organization Scope Precedence

The `ResourcesController` applies organization scoping using the following order of precedence:

1. **Resource IS the Organization model** -- restrict to the current org's primary key
2. **Model has `scopeForOrganization` static method** -- delegate to the custom scope
3. **Model has `organization_id` column** -- simple `WHERE organization_id = ?`
4. **Auto-detected `belongsTo` chain** -- Rhino walks `belongsTo` relationships to find a model with `organization_id`
5. **Model has `organization` or `organizations` relationship** -- use `whereHas`
6. **No relationship found** -- model is global (no scope applied)

## Auto-Setting Organization on Create

When creating a record via `POST /api/:organization/posts`, the controller automatically adds `organization_id` to the data if:
- An organization is present in the request context (set by middleware)
- The model has an `organizationId` or `organization_id` column

This happens in the controller layer, independent of the `BelongsToOrganization` mixin. Using both provides defense-in-depth.

## Membership Verification

Both middleware classes verify that the authenticated user belongs to the resolved organization. The check supports three strategies in order:

1. **Prisma relationship query** -- `user.related('organizations').query().where('organizations.id', org.id)`
2. **Preloaded organizations array** -- checks `user.organizations` for a matching id
3. **Explicit helper method** -- calls `user.belongsToOrganization(org)` if defined

If none of these strategies find a match, the middleware denies access.

## Group Membership Enforcement

By default, belonging to an organization is what grants access; a route group is
not itself an access boundary. You can opt into treating group membership as a
first-class gate with the master flag on `auth`:

```ts title="src/rhino.config.ts"
RhinoModule.forRoot({
  auth: { enforceGroupMembership: false }, // default OFF — behavior unchanged
  // ...
})
```

When the flag is **on**, after authentication an additional **coarse** check
runs before permissions: the user must hold a `user_roles` row whose
`route_group` matches the request's group (a `NULL`/absent `route_group` row is a
**wildcard** that matches every group) **and**, for tenant groups, the resolved
organization. No matching row → **403**. Permissions then resolve from that
matching membership row (per `(group, org)`) instead of the org-presence
heuristic.

This pairs with the per-group `auth`/`hooks` keys and invitation `route_group`
described in [Route Groups → Group membership & auth](./route-groups.md#group-membership--auth).
With the flag off, none of this applies and multi-tenancy behaves exactly as
documented above.

:::info Why 404 and not 403?
With `enforceGroupMembership` **off** (the default), an authenticated user who
hits an organization they don't belong to gets a **404** — this prevents leaking
which organization slugs exist. A genuinely unknown org always 404s.

When `enforceGroupMembership` is **on**, this changes for an authenticated
**non-member** of the requested route group: the membership gate runs *before*
the org-resolution 404 and returns **403** (membership denial takes precedence
over the org 404). The gate resolves the org itself as needed, so a real org you
simply aren't a member of yields 403, while a genuinely non-existent org still
404s.
:::
