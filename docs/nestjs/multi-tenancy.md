---
sidebar_position: 8
title: Multi-Tenancy
---

# Multi-Tenancy

Rhino provides built-in multi-tenancy support that isolates data by organization. When an organization is present in the request context (set by middleware), all queries are automatically scoped to that organization, and new records are tagged with the correct `organization_id`.

Multi-tenancy is configured via [Route Groups](./route-groups). Use a `tenant` route group with organization-resolving middleware to enable org-scoped routing.

## Configuration

Enable multi-tenancy by adding a `tenant` route group and a `multiTenant` block in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

// Inside the RhinoConfig object passed to RhinoModule.forRoot()
routeGroups: {
  tenant: {
    prefix: ':organization',
    middleware: [ResolveOrganizationMiddleware],
    models: '*',
  },
},
multiTenant: {
  enabled: true,
  organizationIdentifierColumn: 'slug',
  organizationModel: 'organization',
  userOrganizationModel: 'userRole',
},
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Master switch for multi-tenancy. |
| `organizationIdentifierColumn` | `string` | `'id'` | The column used to look up the organization. Common values: `'id'`, `'slug'`, `'uuid'`. |
| `organizationModel` | `string` | `'organization'` | The Prisma model name for organizations. |
| `userOrganizationModel` | `string` | `'userRole'` | The Prisma model name for the user-organization membership join. |

## Routing Strategies

### URL Prefix Mode

Use a `tenant` route group with a parameterized prefix:

```ts title="src/rhino.config.ts"
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';

routeGroups: {
  tenant: {
    prefix: ':organization',
    middleware: [ResolveOrganizationMiddleware],
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

`ResolveOrganizationMiddleware` extracts the `:organization` parameter and looks up the Organization model by the configured identifier column.

### Subdomain Mode

For host-based tenancy, give a group a parameterized `domain` and resolve the organization at the Express layer with `createDomainRouteResolver` in `main.ts`:

```ts title="src/rhino.config.ts"
routeGroups: {
  tenant: {
    prefix: '',
    domain: '{organization}.example.com',
    models: '*',
  },
},
```

```ts title="src/main.ts"
import { createDomainRouteResolver } from '@rhino-dev/rhino-nestjs';

app.use(createDomainRouteResolver({ prisma, config }));
applyRhinoRouting(app, { prefix: 'api' });
```

Routes:

```
GET    https://acme.example.com/api/posts
POST   https://acme.example.com/api/posts
```

The captured `{organization}` subdomain feeds organization resolution exactly like the `:organization` path prefix. See [Route Groups → Domain Constraints](./route-groups#domain-constraints).

## ResolveOrganizationMiddleware

This middleware handles tenant resolution from the `:organization` route parameter:

1. Extracts the `organization` parameter from the route
2. Looks up the Organization model by the configured `organizationIdentifierColumn`
3. Verifies the authenticated user belongs to the organization
4. Sets `req.organization` for downstream controllers and policies

```ts
import { ResolveOrganizationMiddleware } from '@rhino-dev/rhino-nestjs';
```

If the organization is not found, a `404` is returned. If the user does not belong to the organization, a `404` is returned (to avoid leaking the existence of organizations).

## Organization Scoping (`belongsToOrganization`)

Set `belongsToOrganization: true` on a model registration to enable automatic organization scoping. The model's Prisma definition should include an `organizationId` column and an `organization` relation:

```prisma title="prisma/schema.prisma"
model Post {
  id             Int          @id @default(autoincrement())
  organizationId Int
  // ...
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@map("posts")
}
```

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  belongsToOrganization: true,
},
```

### What it Does

**Auto-sets `organizationId` on create:** When an organization is present in the request context, Rhino sets `organizationId` from `req.organization.id` on create. Client-supplied `organizationId` is stripped from the input — the org always comes from the resolved request context.

**Scopes every query:** When an organization is present, Rhino filters each query to that organization (`WHERE organizationId = ?`). Outside an HTTP request (scripts, tests, queue workers), no organization is set, so scoping is skipped.

## Nested Organization Scoping

Not every model has a direct `organizationId` column. For child models, set `owner` to the relation Rhino should walk to find the organization:

```ts title="src/rhino.config.ts"
comments: {
  model: 'comment',
  owner: 'post', // Comment -> post -> organization
},
```

Rhino traverses `Comment -> post` to find the organization using a nested Prisma relation filter, equivalent to:

```sql
SELECT * FROM comments
WHERE EXISTS (
  SELECT 1 FROM posts WHERE posts.id = comments.post_id AND posts.organization_id = ?
);
```

Deeper chains are also supported (e.g., `Reply -> comment -> post -> organization`).

## Organization Scope Precedence

The controller applies organization scoping using the following order of precedence:

1. **Resource IS the Organization model** -- restrict to the current org's primary key
2. **Model has an `organizationId` column** -- simple `WHERE organizationId = ?`
3. **`owner` chain is configured / auto-detected** -- walk the named relation(s) to a model with `organizationId` and filter via a nested relation condition
4. **No relationship found** -- model is global (no scope applied)

## Auto-Setting Organization on Create

When creating a record via `POST /api/:organization/posts`, the controller automatically adds `organizationId` to the data if:
- An organization is present in the request context (set by middleware)
- The registration has `belongsToOrganization: true` and the model has an `organizationId` column

Client-supplied `organizationId` is always stripped from the input first — the value comes from the resolved request context, never from the request body.

## Membership Verification

`ResolveOrganizationMiddleware` verifies that the authenticated user belongs to the resolved organization by checking the user-organization membership model (`userOrganizationModel`, default `userRole`) for a row matching the user and organization. If no membership row is found, the middleware denies access (`404` to avoid leaking which organizations exist).

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
