---
sidebar_position: 5
title: Querying
---

# Advanced Querying

Every Rhino endpoint supports filtering, sorting, search, pagination, field selection, and eager loading -- all via query parameters. The `QueryBuilderService` translates URL parameters into Prisma queries.

## Model Configuration

Define what is queryable on the model registration in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',

  // Fields that can be filtered
  allowedFilters: ['status', 'userId', 'categoryId'],

  // Fields that can be sorted
  allowedSorts: ['createdAt', 'title', 'updatedAt', 'publishedAt'],

  // Default sort when none specified (prefix with - for descending)
  defaultSort: '-createdAt',

  // Fields that can be selected
  allowedFields: ['id', 'title', 'content', 'status', 'createdAt'],

  // Prisma relations that can be eager loaded
  allowedIncludes: ['author', 'comments', 'tags', 'category'],

  // Fields searched with ?search= parameter
  allowedSearch: ['title', 'content', 'author.name'],
},
```

:::warning
Fields **not** listed in these arrays are silently ignored. This is a security feature -- users cannot filter or sort by columns you have not explicitly allowed.
:::

## Filtering

Filter records by field values:

```bash title="terminal"
# Single filter
GET /api/posts?filter[status]=published

# Multiple filters (AND)
GET /api/posts?filter[status]=published&filter[user_id]=1

# Multiple values for one field (OR via comma-separated)
GET /api/posts?filter[status]=draft,published
```

Only fields listed in `allowedFilters` can be filtered.

When a filter value contains commas, the query builder produces a `WHERE col IN (...)` clause. Otherwise it produces a simple `WHERE col = ?` clause.

### Examples

```bash title="terminal"
# Posts by a specific user
GET /api/posts?filter[user_id]=42

# Published posts in a category
GET /api/posts?filter[status]=published&filter[category_id]=5

# Posts that are either draft or published (excludes archived)
GET /api/posts?filter[status]=draft,published
```

## Sorting

Sort records by one or more fields:

```bash title="terminal"
# Ascending
GET /api/posts?sort=title

# Descending (prefix with -)
GET /api/posts?sort=-created_at

# Multiple sorts (first by status ascending, then by date descending)
GET /api/posts?sort=status,-created_at
```

Only fields listed in `allowedSorts` can be sorted. If no sort is specified, `defaultSort` is used.

### Default Sort

Every model can specify a default sort that applies when no `?sort` parameter is provided:

```ts
defaultSort: '-createdAt',
```

The default sort supports the same comma-separated format as the query parameter. Use the `-` prefix for descending order.

## Search

Full-text search across configured fields:

```bash title="terminal"
GET /api/posts?search=nestjs
```

Searches across all fields listed in `allowedSearch`. The query builder produces an `OR` group of case-insensitive `contains` conditions, one for each configured column.

### Relationship Search

You can search across relationships using dot notation:

```ts
// Model registration
allowedSearch: ['title', 'content', 'author.name'],
```

```bash title="terminal"
# This searches in post.title, post.content, AND author.name
GET /api/posts?search=john
```

Dot-notation columns (e.g., `author.name`) are resolved with a nested Prisma relation filter so the `contains` match runs on the related table.

:::tip Combine search with filters
```bash title="terminal"
# Search for "nestjs" only in published posts
GET /api/posts?search=nestjs&filter[status]=published
```
:::

## Named Scopes

Named scopes let the client **select** a model-whitelisted query scope by name via `?scope=`. Unlike filters and sorts (which the client composes freely from allowed columns), a named scope is a reusable, server-defined query fragment -- ideal for complex relation filters or user-specific constraints you do not want to express in the URL.

Register the whitelist and a default on the model registration with `namedScopes` and `defaultScope`:

```ts title="src/rhino.config.ts"
import { AvailableForDriversScope } from './scopes/AvailableForDriversScope';
import { ActiveScope } from './scopes/ActiveScope';

routes: {
  model: 'route',

  // Scopes the client may select by name via ?scope=
  namedScopes: {
    availableForDrivers: AvailableForDriversScope,
    active: ActiveScope,
  },

  // Applied automatically when no ?scope= is given
  defaultScope: 'active',
},
```

Each scope class implements `RhinoNamedScope` and returns a Prisma **where-fragment** that Rhino ANDs into the query. Joins are expressed as nested relation filters (`some` / `none` / `is`):

```ts title="src/scopes/AvailableForDriversScope.ts"
import type { RhinoNamedScope, ScopeContext } from '@rhino-dev/rhino-nestjs';

export class AvailableForDriversScope implements RhinoNamedScope {
  apply(ctx: ScopeContext): Record<string, any> {
    if (!ctx.user) return { id: { in: [] } }; // fail closed when unauthenticated
    return {
      status: 'active',
      assignments: { none: { completedAt: null } },
      region: {
        driverQualifications: {
          some: { driverId: ctx.user.id, expiresAt: { gt: new Date() } },
        },
      },
    };
  }
}
```

`RhinoNamedScope` and `ScopeContext` are exported from the package root (`@rhino-dev/rhino-nestjs`). The context's `user` is the **current authenticated user**, resolved server-side -- the client never sends user identity, only the scope name. Always fail closed (`{ id: { in: [] } }`) when `ctx.user` is absent.

### Selecting a scope

```bash title="terminal"
# Apply the availableForDrivers scope
GET /api/routes?scope=availableForDrivers

# No ?scope= -> the model's defaultScope ('active') is applied automatically
GET /api/routes
```

### Best practices for complex scopes

The inline example above fits on a screen. Once a scope grows past a couple of clauses -- relation joins, subqueries, per-user or per-role logic -- move it into its own class instead of inlining a growing object literal. The patterns below keep a named scope safe, cheap, and testable.

#### Put it in a scope class, not a service

A named scope is a **pure query transformation**: given a `ScopeContext`, it returns a Prisma where-fragment that Rhino ANDs into the query. It is not a place for business logic or side effects. Give each scope its own class implementing `RhinoNamedScope`, keep them together under `src/scopes/`, and let the model registration point at the class -- that line stays thin:

```ts title="src/rhino.config.ts"
namedScopes: { availableForDrivers: AvailableForDriversScope },
```

```ts title="src/scopes/AvailableForDriversScope.ts"
import type { RhinoNamedScope, ScopeContext } from '@rhino-dev/rhino-nestjs';

export class AvailableForDriversScope implements RhinoNamedScope {
  apply(ctx: ScopeContext): Record<string, any> {
    if (!ctx.user) return { id: { in: [] } }; // fail closed

    return {
      status: 'active',
      // no open assignment blocking the route
      assignments: { none: { completedAt: null } },
      // driver holds a current qualification for the route's region
      region: {
        driverQualifications: {
          some: { driverId: ctx.user.id, expiresAt: { gt: new Date() } },
        },
      },
    };
  }
}
```

#### Derive from what Rhino hands you -- never a fresh model query

A named scope returns a **fragment**; Rhino ANDs it into the where it has already built (org scoping, global scopes, soft-delete, filters). That is exactly why the fragment shape is safe. The danger is stepping outside it -- reaching for `prisma.route.findMany(...)` inside the scope and returning ids from a query that starts fresh:

```ts
// BAD — starts from a fresh model query; drops org scoping → tenant data leak
const ids = await prisma.route.findMany({ where: { status: 'active' } });
return { id: { in: ids.map((r) => r.id) } };

// GOOD — return a narrowing fragment; Rhino ANDs it onto the already-scoped where
return { status: 'active', region: { driverQualifications: { some: { driverId: ctx.user.id } } } };
```

The fragment form runs *on top of* the organization scope. The fresh-query form silently discards it -- a tenant-isolated list becomes a data leak.

#### Fail closed when there is no user

If the scope depends on the current user, return an empty set when `ctx.user` is absent -- never the full set:

```ts
if (!ctx.user) return { id: { in: [] } };
```

`{ id: { in: [] } }` matches no rows. Returning `{}` (or nothing) would match *every* row the outer query allows -- the opposite of what a user-scoped view should do when identity is missing.

#### Prefer relation predicates over raw joins

Express joins as nested relation filters (`some` / `none` / `is`), not by hand-rolling `$queryRaw` joins. A raw join fans out rows: one route with three matching qualifications becomes three rows, which double-counts under pagination and makes `?sort` ambiguous. Relation predicates stay row-per-parent:

```ts
// one row per route, regardless of how many qualifications match
region: { driverQualifications: { some: { driverId: ctx.user.id } } }
```

:::warning
If you ever do fall back to a join that needs `distinct`, do **not** combine that scope with `?fields[...]` -- a `COUNT(DISTINCT ...)` interaction can miscount the paginated total. Add DB indexes on the predicate columns you filter through (`driverQualifications.driverId`, `expiresAt`) so the `some` / `none` subquery stays cheap.
:::

#### A named scope only narrows, never widens

A named scope is ANDed on top of org scoping and global scopes -- it can only *narrow* the already-authorized set, never widen it. Do **not** put mandatory restrictions (tenancy, visibility) in a named scope: a client swaps the scope out the moment it sends a different `?scope=`. Those restrictions belong in an always-on global scope (`belongsToOrganization` or a custom `scopes: [...]` class). See [the default scope is not a security boundary](#the-403-contract) below.

#### Offload external or expensive work to a service

The scope's `apply` runs on **every** list request, so it must stay a cheap, pure transform. If deciding the set needs an API call, a permission-graph lookup, or heavy computation, push that into a service that returns raw material -- a set of ids or a subquery shape -- cache it, and have the scope apply the result:

```ts title="src/scopes/AssignedToMeScope.ts"
export class AssignedToMeScope implements RhinoNamedScope {
  constructor(private readonly routes: RouteAccessService) {}

  apply(ctx: ScopeContext): Record<string, any> {
    if (!ctx.user) return { id: { in: [] } };
    // service does the expensive/cached lookup; scope just applies ids
    const ids = this.routes.accessibleRouteIds(ctx.user.id); // memoized/cached
    return { id: { in: ids } };
  }
}
```

The expensive lookup lives (and is cached) in the service; the thing that runs per request is a plain `{ id: { in: [...] } }` fragment.

:::note `apply` is synchronous
`apply(ctx)` returns a plain object — Rhino ANDs the fragment into the query without awaiting it, so you cannot `await` inside a scope. The service accessor must therefore return synchronously (a read from an already-warmed cache/store). Do any async work — the API call, the DB round-trip — upstream (e.g. in a guard or middleware) and memoize it, so the scope only reads the result.
:::

#### Test the class in isolation

Because a scope is a plain class, unit-test `apply` directly with a stubbed context -- no HTTP, no Prisma round-trip:

```ts title="src/scopes/AvailableForDriversScope.spec.ts"
it('fails closed without a user', () => {
  expect(new AvailableForDriversScope().apply({})).toEqual({ id: { in: [] } });
});

it('scopes to the current driver', () => {
  const frag = new AvailableForDriversScope().apply({ user: { id: 7 } });
  expect(frag.region.driverQualifications.some.driverId).toBe(7);
});
```

:::tip
Assert on the returned fragment shape, not on database rows. The whole point of the fragment contract is that you can verify the scope's logic without a database -- the AND-into-the-query behavior is Rhino's job, already covered by its own tests.
:::

### The 403 contract

Unlike filters and sorts, an unknown or non-whitelisted scope name is **not** silently ignored -- it returns a `403` using the standard `RhinoException` envelope, mirroring the [include-authorization](#include-authorization) behavior:

```bash title="terminal"
# 'archived' is not in namedScopes:
GET /api/routes?scope=archived
# 403 { "code": "FORBIDDEN", "message": "Scope 'archived' is not allowed", "details": {} }
```

Requesting the declared default scope by name (`?scope=active`) is always allowed.

:::warning The default scope is a convenience, not a security boundary
`defaultScope` is a listing default that a client **replaces** the moment it selects another scope. Do **not** put mandatory row restrictions (tenancy, visibility) in it -- those belong in an always-on layer (`belongsToOrganization`, or a custom `scopes: [...]` class), which no `?scope=` value can bypass. Note the two meanings of "scope" in Rhino for NestJS: a **named scope** (`namedScopes`) *selects* a client-chosen subset, while a **custom scope** (`scopes`) *enforces* a subset on every query.

A named scope can only **narrow** the already-authorized, organization-scoped set -- it is ANDed on top of global scoping and can never widen it.
:::

### Composition and where it applies

Named scopes compose with everything else -- `filter`, `sort`, `search`, `fields`, `include`, and pagination all apply on top of the selected scope:

```bash title="terminal"
GET /api/routes?scope=availableForDrivers&sort=-createdAt&include=region&page=1&per_page=20
```

Scoping applies to the **index** listing and the **trashed** (soft-delete) listing. A single-record `show` is **not** scoped.

## Pagination

Control page size and navigate through results:

```bash title="terminal"
# Page 1 with 20 items per page
GET /api/posts?page=1&per_page=20

# Page 3
GET /api/posts?page=3&per_page=20
```

### Pagination Headers

Pagination metadata is returned in **response headers**, not the body:

```
X-Current-Page: 2
X-Last-Page: 10
X-Per-Page: 20
X-Total: 195
```

The response body contains only the data array:

```json title="Response"
[
    { "id": 21, "title": "Post 21" },
    { "id": 22, "title": "Post 22" }
]
```

### Per-Page Clamping

The `per_page` value is clamped to the range [1, 100]. Requesting `per_page=0` is clamped to 1, and `per_page=500` is clamped to 100.

### Disabling Pagination

To return all results without pagination:

```ts title="src/rhino.config.ts"
tags: {
  model: 'tag',
  paginationEnabled: false,
},
```

### Changing Default Page Size

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  perPage: 25, // Default items per page (default is 25)
},
```

### Pagination Behavior Summary

| Scenario | Result |
|----------|--------|
| No `?per_page`, `paginationEnabled = false` | Returns all results (no pagination) |
| No `?per_page`, `paginationEnabled = true` | Uses the registration's `perPage` (default 25) |
| `?per_page=20` | Overrides the default, paginates at 20 |
| `?per_page=0` | Clamped to 1 |
| `?per_page=500` | Clamped to 100 |

## Field Selection

Select only specific fields to reduce payload size:

```bash title="terminal"
# Select specific fields
GET /api/posts?fields[posts]=id,title,status

# Select fields on included relationships too
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

Only fields listed in `allowedFields` can be selected.

The `id` column is always included automatically, even if not specified. This ensures relationships and pagination work correctly.

:::info
The table name or model slug is used as the key in the `fields` parameter. For a `posts` table, use `fields[posts]=...`.
:::

## Eager Loading (Includes)

Load related models in a single request:

```bash title="terminal"
# Load single relationship
GET /api/posts?include=user

# Load multiple relationships
GET /api/posts?include=user,comments,tags

# Load nested relationships
GET /api/posts?include=comments.user
```

Only relationships listed in `allowedIncludes` can be loaded. Nested includes (e.g., `comments.user`) are supported via nested Prisma `include` clauses -- the top-level segment must be in the allowed list.

### Count and Exists

You can get relationship counts or existence checks by appending `Count` or `Exists` to an include name:

```bash title="terminal"
# Get the count of comments for each post
GET /api/posts?include=commentsCount

# Check if comments exist (boolean)
GET /api/posts?include=commentsExists
```

Response:
```json title="Response"
{
    "id": 1,
    "title": "My Post",
    "comments_count": 15,
    "comments_exists": true
}
```

These suffixes are authorized against the base relationship name (`comments`), so the user needs `comments.index` permission.

### Include Authorization

When loading includes, Rhino checks if the user has `viewAny` permission on the included resource. If not, a 403 is returned:

```bash title="terminal"
# If user doesn't have 'comments.index' permission:
GET /api/posts?include=comments
# 403 { "message": "You do not have permission to include comments." }
```

This prevents users from bypassing permissions through eager loading. Each included resource is independently authorized, including nested ones.

:::warning
This applies to all includes, including nested ones. A request like `?include=comments.author` checks permissions on both `comments` and the author resource.
:::

## Combined Example

```bash title="terminal"
GET /api/posts?scope=active&filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=nestjs&page=1&per_page=20
```

This single request:
- Selects the `active` named scope (narrowing the base result set)
- Filters to published posts only
- Sorts newest first
- Eager loads user and comments
- Returns only id, title, and excerpt fields
- Searches for "nestjs" in searchable columns
- Returns page 1 with 20 items per page

### Response

**Headers:**
```
X-Current-Page: 1
X-Last-Page: 3
X-Per-Page: 20
X-Total: 47
```

**Body:**
```json title="Response"
[
    {
        "id": 42,
        "title": "Getting Started with NestJS",
        "excerpt": "A beginner's guide to NestJS...",
        "user": {
            "id": 1,
            "name": "John Doe"
        },
        "comments": [
            { "id": 1, "content": "Great article!", "user_id": 2 }
        ]
    }
]
```
