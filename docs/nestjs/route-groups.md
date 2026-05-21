---
sidebar_position: 9
title: Route Groups
---

# Route Groups

Route groups let you register the same models under multiple URL prefixes, each with its own middleware stack and authentication behavior. This enables hybrid routing where different parts of your application serve the same data with different access rules.

## Route Registration with `rhinoRoutes()`

The recommended way to register Rhino routes is to use the `rhinoRoutes()` helper in your `start/routes.ts` file. This helper reads your configuration and registers all CRUD routes, auth routes, invitation routes, and nested operation routes automatically:

```ts title="start/routes.ts"
import router from '@nestjs/core/services/router'
import { rhinoRoutes } from '@rhino-dev/rhino-nestjs/route_helper'
import { middleware } from '#start/kernel'

rhinoRoutes(router, middleware, {
  config: {
    models: {
      projects: true,
      tasks: true,
      comments: true,
    },
    routeGroups: {
      tenant: { prefix: ':organization' },
    },
    nested: { path: 'nested' },
  },
})
```

The `rhinoRoutes()` helper accepts three arguments:

| Argument | Type | Description |
|----------|------|-------------|
| `router` | `Router` | The NestJS router instance |
| `middleware` | `MiddlewareStore` | The middleware store from `#start/kernel` |
| `config` | `object` | Configuration object with `models`, `routeGroups`, and `nested` settings |

For `models`, you can pass `true` as the value to use the default model import convention, or pass a full configuration object.

## Configuration

Define route groups in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
import { RhinoModule } from "@rhino-dev/rhino-nestjs";  // wire via RhinoModule.forRoot() in your AppModule

RhinoModule.forRoot({
  models: {
    posts: () => import('#models/post'),
    comments: () => import('#models/comment'),
    categories: () => import('#models/category'),
  },

  routeGroups: {
    tenant: {
      prefix: ':organization',
      middleware: ['rhino:resolveOrg'],
      models: '*',
    },
    admin: {
      prefix: 'admin',
      middleware: [],
      models: '*',
    },
    public: {
      prefix: 'public',
      middleware: [],
      models: ['categories'],
    },
  },

  multiTenant: {
    organizationIdentifierColumn: 'slug',
  },
})
```

### Structure

Each route group has three properties:

| Property | Type | Description |
|----------|------|-------------|
| `prefix` | `string` | URL prefix for all routes in this group (e.g., `':organization'`, `'admin'`, `''`) |
| `middleware` | `string[]` | Middleware to apply to all routes in this group |
| `models` | `'*' \| string[]` | `'*'` for all registered models, or an array of specific model slugs |

### Reserved Group Names

Two group names have special behavior:

- **`tenant`** -- Rhino detects this name and:
  - Registers invitation CRUD routes under the tenant prefix
  - Registers the nested operations endpoint under the tenant prefix
  - The middleware (e.g., `rhino:resolveOrg`) sets `ctx.organization`, enabling automatic organization scoping

- **`public`** -- Rhino detects this name and:
  - Skips the `auth` middleware for all routes in this group

Any other group name (e.g., `'driver'`, `'admin'`, `'default'`) is treated as a standard authenticated group.

### Route Naming

All routes are named with the pattern `rhino.{groupKey}.{modelSlug}.{action}`:

```
rhino.tenant.posts.index
rhino.tenant.posts.store
rhino.admin.posts.show
rhino.public.categories.index
```

### Registration Order

Route groups with literal prefixes (e.g., `admin`, `public`) are registered before groups with parameterized prefixes (containing `:`, e.g., `:organization`). This prevents parameterized routes from capturing requests meant for literal prefixes.

## Examples

### Simple Non-Tenant App

```ts title="src/rhino.config.ts"
routeGroups: {
  default: {
    prefix: '',
    middleware: [],
    models: '*',
  },
},
```

Routes: `GET /api/posts`, `POST /api/posts`, etc. All routes require authentication.

### Simple Multi-Tenant App

```ts title="src/rhino.config.ts"
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
```

Routes: `GET /api/:organization/posts`, etc. All routes require auth + organization resolution.

### Hybrid Platform

```ts title="src/rhino.config.ts"
models: {
  trips: () => import('#models/trip'),
  trucks: () => import('#models/truck'),
  materials: () => import('#models/material'),
},

routeGroups: {
  // Customer dashboard -- org-scoped
  tenant: {
    prefix: ':organization',
    middleware: ['rhino:resolveOrg'],
    models: '*',
  },
  // Driver app -- authenticated, not org-scoped
  driver: {
    prefix: 'driver',
    middleware: [],
    models: ['trips', 'trucks'],
  },
  // Admin panel -- authenticated, global access
  admin: {
    prefix: 'admin',
    middleware: [],
    models: '*',
  },
  // Public API -- no auth
  public: {
    prefix: 'public',
    middleware: [],
    models: ['materials'],
  },
},
```

Generated routes:

| Group | URL Pattern | Auth | Org Scoped |
|-------|-------------|------|------------|
| tenant | `/api/:organization/trips` | Yes | Yes |
| tenant | `/api/:organization/materials` | Yes | Yes |
| driver | `/api/driver/trips` | Yes | No |
| driver | `/api/driver/trucks` | Yes | No |
| admin | `/api/admin/trips` | Yes | No |
| admin | `/api/admin/materials` | Yes | No |
| public | `/api/public/materials` | No | No |

## Organization Scoping Behavior

Organization scoping is implicit, based on the middleware stack:

- **Organization present** (set by middleware like `rhino:resolveOrg`): scoping is applied automatically.
- **Organization absent** (no middleware sets it): scoping is skipped, query returns all records.

This means:
- `tenant` group routes get org scoping automatically (their middleware sets the org on the context).
- Non-tenant group routes skip org scoping naturally (no middleware sets an org).
- **No configuration flag needed** -- the behavior is implicit based on the middleware stack.

## Custom Scoping for Non-Tenant Groups

For non-tenant groups (e.g., `driver`, `admin`), custom data filtering is implemented at the application level using NestJS model scopes:

```ts title="app/models/trip.ts"
import { scope } from '@nestjs/lucid/orm'

export default class Trip extends RhinoModel {
  @scope()
  public static forDriver(
    query: ModelQueryBuilderContract<typeof Trip>,
    ctx: HttpContext
  ) {
    if (ctx.routeGroup === 'driver') {
      query.where('driver_id', ctx.auth.user!.driverId)
    }
  }
}
```

## Permission Resolution

Two permission sources are used, determined by the route group context:

| Route Group | Permission Source | Description |
|-------------|------------------|-------------|
| `'tenant'` | `userRoles.permissions` | Organization-scoped, checked per-org |
| Any other | `users.permissions` | User-level, checked directly on the user model |

The decision is deterministic based on the presence of an organization in the request context. There is no fallback chain. See [Policies](./policies) for details.
