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

A route group (`RouteGroupConfig`) accepts:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `prefix` | `string` | — | URL prefix for all routes in this group (e.g., `':organization'`, `'admin'`, `''`) |
| `domain` | `string` | — | Optional host constraint (see [Domain Constraints](#domain-constraints)) |
| `middleware` | `Type<NestMiddleware>[]` | `[]` | Middleware applied to all routes in this group |
| `models` | `'*' \| string[]` | — | `'*'` for all registered models, or an array of specific model slugs |
| `skipAuth` | `boolean` | `false` | Skip the JWT guard for this group (used by the reserved `public` group) |
| `auth` | `boolean` | `false` | Register a group-tagged auth route set (see [Group membership & auth](#group-membership--auth)) |
| `hooks` | `Type<AuthLifecycleHooks> \| AuthLifecycleHooks` | — | Per-group lifecycle hooks (see [Group membership & auth](#group-membership--auth)) |
| `tenant` | `boolean` | inferred | Whether the group is org-scoped. When omitted, a group is a tenant group iff multi-tenancy is enabled; set `tenant: false` for org-less groups (e.g. `admin`, `driver`) when multi-tenancy is on |

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

## Domain Constraints

A route group can be constrained to a specific host with the optional `domain`
key, so two groups can share the same `prefix` while living on different hosts.

```ts title="src/rhino.config.ts"
routeGroups: {
  // Only matches requests to admin.example.com
  admin: {
    prefix: '',
    domain: 'admin.example.com',
    models: '*',
  },
},
```

| `domain` value                  | Behavior                                                                       |
|---------------------------------|--------------------------------------------------------------------------------|
| omitted                         | Matches **any** host (default, fully backward compatible)                       |
| `'admin.example.com'`           | Group's routes match **only** that exact host; other hosts get a 404            |
| `'{organization}.example.com'`  | Parameterized; the captured `{organization}` feeds org resolution like a path-prefix tenant param |

`domain` and `prefix` are independent and combine. A parameterized domain binds
the captured subdomain exactly like the path-prefix `:organization`, so subdomain
multi-tenancy works with no extra wiring (see [Multi-Tenancy → Subdomain Mode](./multi-tenancy.md#subdomain-mode)).

## Group membership & auth

By default a route group only chooses a URL/host context and a permission
*source* — it is **not an access boundary**, and auth (`/api/auth/*`) is
group-blind. Three opt-in, fully backward-compatible features turn the group
into a first-class boundary. **With all flags off, behavior is byte-for-byte
what it is today.**

### Group membership

A migration adds a nullable `route_group` column to `user_roles` (and makes
`organization_id` nullable, since non-tenant groups like `admin`/`driver` have
no org). A membership row is now keyed by `(user, route_group, organization, role)`.

| `route_group` value | Meaning                                                          |
|---------------------|------------------------------------------------------------------|
| `NULL` (absent)     | **Wildcard** — member of *every* group (the back-compat default) |
| `'driver'`          | Membership scoped to the `driver` group only                     |

Enforcement is gated by the master flag on `auth`:

```ts title="src/rhino.config.ts"
RhinoModule.forRoot({
  auth: { enforceGroupMembership: false }, // default OFF
  // ...
})
```

- **Off (default):** no membership check; the permission source is the existing
  org-presence heuristic (see [Permission Resolution by Group](#permission-resolution)).
- **On:** after authentication, the user must hold a `user_roles` row whose
  `route_group` matches the request's group (a `NULL`/absent row is a wildcard
  match) **and**, for tenant groups, the resolved organization. No match →
  **403**. Permissions then resolve from **that matching membership row** (per
  `(group, org)`), not the heuristic. The default/empty-prefix group is itself a
  first-class membership dimension, so enforcement applies to it uniformly.

Membership is the **coarse** gate (may you enter the group at all); permissions
remain the **fine** check (what may you do). The `public` group skips both.

:::info No backfill required
A `NULL` `route_group` is a wildcard, so enabling enforcement never locks out
existing rows. Scope rows to concrete groups only when you want to restrict them.
:::

### Group-aware auth

Set `auth: true` on a group to register the full auth route set — `login`,
`logout`, `password/recover`, `password/reset`, `register` — under that group's
prefix/domain, tagged with the group's name (Decision 9.A). The matched route
makes the group unambiguous, so the controller knows which group is signing in.

```ts title="src/rhino.config.ts"
routeGroups: {
  driver: {
    prefix: 'driver',
    auth: true, // adds POST /api/driver/auth/login, …/logout, …/register, …/password/*
    tenant: false,
    models: ['trips'],
  },
},
```

- The legacy unprefixed `/api/auth/*` set **always remains** and maps to the
  default/no-group case, preserving today's behavior for apps that don't opt in.
- A group with `auth` and a `domain` gets `…/auth/login` on that host; with a
  prefix it gets `{prefix}/auth/login`. Both carry the group's name.
- `public` is never auth-enabled.

:::info An empty-prefix, no-domain auth group **is** the default auth
A group with `auth: true`, an **empty prefix**, and **no domain** is
indistinguishable from the legacy `/api/auth/*` set, so Rhino resolves the
default auth paths to that group (keeping `skipAuth` semantics) and adopts its
`hooks` — it does **not** register a second, colliding route, even when a
host-claiming empty-prefix domain group also exists. If **two or more**
auth-enabled groups have an empty prefix **and** no domain, they are genuinely
indistinguishable and Rhino throws a boot-time `RouteGroupConflictError`. Give
each a distinct `prefix` or `domain`.
:::

### Lifecycle hooks

A group may declare an optional `hooks` provider implementing
`AuthLifecycleHooks` (a class resolved via Nest DI, or a plain object). Each
method runs **after** its auth action succeeds, receiving an `AuthHookContext`
(`{ user, routeGroup, organization?, token?, request }`):

```ts title="src/auth/driver-auth.hooks.ts"
import { Injectable } from '@nestjs/common';
import { AuthLifecycleHooks, AuthHookContext, RhinoAuthRejected } from '@rhino-dev/rhino-nestjs';

@Injectable()
export class DriverAuthHooks implements AuthLifecycleHooks {
  async afterLogin(ctx: AuthHookContext): Promise<void> {
    if (!ctx.user.driver?.active) {
      // Revokes the just-issued token and returns 403.
      throw new RhinoAuthRejected(403, 'Driver account is suspended.');
    }
  }
}
```

```ts title="src/rhino.config.ts"
routeGroups: {
  driver: {
    prefix: 'driver',
    auth: true,
    hooks: DriverAuthHooks, // provided via Nest DI
    tenant: false,
    models: ['trips'],
  },
},
```

| Event                  | Fires after                     | Can reject?                                          |
|------------------------|---------------------------------|------------------------------------------------------|
| `afterLogin`           | successful login (token issued) | yes — revokes the token, returns the status          |
| `afterRegister`        | invitation-accept registration  | yes — revokes the token, returns the status          |
| `afterLogout`          | logout                          | yes (token is already gone; returns the status)      |
| `afterPasswordReset`   | password reset completed        | yes                                                  |
| `afterPasswordRecover` | recovery email requested        | runs, but the rejection is **swallowed** (see note)  |

A hook rejects by throwing `RhinoAuthRejected(status = 403, message)` (or any
`HttpException`). For token-issuing actions (`login`, `register`) the controller
**revokes the just-issued token** and returns the given status; for the others
it returns the status with no side effects. Default status is 403.

:::warning `afterPasswordRecover` rejections are swallowed
The recover action still **runs** the hook (so side effects like auditing or
throttling happen), but **swallows any rejection** — it always returns the same
uniform "recovery email sent" response whether or not the email exists.
Surfacing the hook's status would turn recover into an email-enumeration oracle.
Reject semantics are preserved for `afterLogin`/`afterRegister`/`afterLogout`/`afterPasswordReset`.
:::

:::note Token revocation requires a `RevokedToken` model
On rejection of `afterLogin`/`afterRegister` the controller always drops the
token from the response, and *attempts* to denylist it via a `RevokedToken`
Prisma model (`token`, `createdAt`). With no such model the revocation is logged
and skipped — provision `RevokedToken` **and** use short-TTL JWTs
(`auth.jwtExpiresIn`) if you rely on revocation.
:::

### Invitations carry the group

When a group is an access boundary, invitations record which group the invitee
joins:

- Invite creation stores a `route_group` (with an org only for tenant groups —
  non-tenant group invites store a `NULL` org).
- Accept populates the `user_roles` membership with that `route_group` (+ org +
  role), then fires the group's `afterRegister` hook.
- You **cannot** invite into the `public` group. A forged/unknown `routeGroup`
  (not configured, not `public`) is rejected with **422** regardless of enforcement.
- When enforcement is on, a coarse membership gate runs first — the inviter must
  themselves be a member of the target group (**403** on denial; a `NULL` row is
  a wildcard) — then the normal permission check.

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
