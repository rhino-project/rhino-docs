---
sidebar_position: 8
title: Route Groups
---

# Route Groups

Route groups allow you to register the same models under multiple URL prefixes, each with its own middleware stack and authentication behavior. This enables hybrid platforms where different user types access resources through different contexts.

## Configuration

Define route groups in `config/rhino.php`:

```php title="config/rhino.php"
'route_groups' => [
    'group-name' => [
        'prefix' => 'url-prefix',           // URL prefix for routes
        'domain' => null,                    // optional host constraint (see Domain Constraints)
        'middleware' => [SomeMiddleware::class], // middleware stack (on top of auth:sanctum)
        'models' => '*',                     // '*' for all models, or ['posts', 'comments']
        'auth' => false,                     // register a group-tagged auth route set (see Group membership & auth)
        'hooks' => null,                     // optional lifecycle hooks class (see Group membership & auth)
    ],
],
```

| Key          | Type             | Default | Purpose                                                                                  |
|--------------|------------------|---------|------------------------------------------------------------------------------------------|
| `prefix`     | string           | —       | URL prefix for the group's routes                                                        |
| `domain`     | string \| null   | `null`  | Optional host constraint (see [Domain Constraints](#domain-constraints))                 |
| `middleware` | array            | `[]`    | Middleware stack applied on top of `auth:sanctum`                                        |
| `models`     | `'*'` \| array   | —       | `'*'` for all registered models, or an array of model slugs                              |
| `auth`       | bool             | `false` | Register the full auth route set under this group's prefix/domain, tagged with the group |
| `hooks`      | class-string     | `null`  | A `Rhino\Contracts\AuthLifecycleHooks` class run after each auth action for the group    |

### Reserved Group Names

Two group names have special behavior:

| Name       | Behavior                                                                 |
|------------|--------------------------------------------------------------------------|
| `'tenant'` | Invitation and nested routes are registered under this group's prefix    |
| `'public'` | `auth:sanctum` middleware is **skipped** for routes in this group         |

All other group names (e.g., `'driver'`, `'admin'`, `'default'`) are standard authenticated groups.

### Model Selection

- `'models' => '*'` — registers all models from `config('rhino.models')`
- `'models' => ['posts', 'categories']` — registers only the specified model slugs

### Domain Constraints

A route group can be constrained to a specific host with the optional `'domain'`
key. This lets two groups share the same `'prefix'` while living on different
domains. Under the hood it uses Laravel's `Route::domain()`.

```php title="config/rhino.php"
'route_groups' => [
    // Only matches requests to admin.example.com
    'admin' => [
        'prefix' => '',
        'domain' => 'admin.example.com',
        'middleware' => [],
        'models' => '*',
    ],
],
```

Semantics:

| `'domain'` value                | Behavior                                                                       |
|---------------------------------|--------------------------------------------------------------------------------|
| omitted / `null` / `''`         | Matches **any** host (default, fully backward compatible)                       |
| `'admin.example.com'`           | Group's routes match **only** that exact host; other hosts get a 404            |
| `'{organization}.example.com'`  | Matches that host pattern and binds `{organization}`, feeding org resolution    |

`'domain'` and `'prefix'` are independent and combine — a group may have both.

:::warning Conflicting groups fail fast
Two groups that share the same prefix **and** overlapping models **and** an
intersecting host-set would silently shadow each other. Rhino validates the
config at boot and throws a `RouteGroupConflictException` in that case. The fix
is to give them distinct prefixes, distinguish them with different `'domain'`
values, or make their `'models'` disjoint. A group without a `'domain'` matches
every host, so it intersects with all others.
:::

#### Subdomain multi-tenancy

A **parameterized** domain binds a host segment as a route parameter. Because
Laravel exposes domain parameters as route parameters, `{organization}` flows
into `ResolveOrganizationFromRoute` exactly like the path-prefix `{organization}`
does — so subdomain multitenancy works with no extra wiring:

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '',
        'domain' => '{organization}.example.com',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

A request to `org-one.example.com` resolves the `org-one` organization (by the
configured identifier column) and scopes all data to it. Requests to an unknown
subdomain — or to an organization the authenticated user does not belong to —
return `404`. A domain parameter matches a single label only, so `example.com`
(no subdomain) does not match.

When the `'tenant'` group declares a domain, the tenant-scoped invitation and
nested (`/nested`) routes inherit that same domain constraint.

## Group membership & auth

By default a route group only chooses a URL/host context and a permission
*source* — it is **not an access boundary**, and auth (`/api/auth/*`) is
group-blind. Three opt-in, fully backward-compatible features turn the group
into a first-class boundary. **With all flags off, behavior is byte-for-byte
what it is today.**

### Group membership on `user_roles`

A migration adds a nullable `route_group` column to `user_roles` (and makes
`organization_id` nullable, since non-tenant groups like `admin`/`driver` have
no org). A membership row is now keyed by `(user, route_group, organization,
role)`.

| `route_group` value | Meaning                                                          |
|---------------------|------------------------------------------------------------------|
| `NULL`              | **Wildcard** — member of *every* group (the back-compat default) |
| `'driver'`          | Membership scoped to the `driver` group only                     |

Enforcement is gated by the master flag in `config/rhino.php`:

```php title="config/rhino.php"
'auth' => [
    'enforce_group_membership' => false, // default OFF
],
```

- **Off (default):** no membership check; the permission source is the existing
  org-presence heuristic (see [Permission Resolution](#permission-resolution)).
- **On:** after authentication, the user must hold a `user_roles` row whose
  `route_group` matches the request's group (a `NULL` row is a wildcard match)
  **and**, for tenant groups, the resolved organization. No match → **403**.
  Permissions then resolve from **that matching membership row** (per
  `(group, org)`), not the heuristic. When both an exact-group row and a
  wildcard (`NULL`) row exist, the **exact row is preferred**.

Membership is the **coarse** gate (may you enter the group at all); permissions
remain the **fine** check (what may you do). They run in sequence and are never
merged. The `public` group skips both (no auth).

:::info No backfill required
A `NULL` `route_group` is a wildcard, so enabling enforcement never locks out
existing rows. Scope rows to concrete groups only when you want to restrict them.
:::

### Group-aware auth

Set `'auth' => true` on a group to register the full auth route set — `login`,
`logout`, `password/recover`, `password/reset`, `register` — under that group's
prefix/domain, tagged with the group's `route_group` (exactly how CRUD routes
are generated). The matched route makes the group unambiguous, so the controller
knows which group is signing in.

```php title="config/rhino.php"
'route_groups' => [
    'driver' => [
        'prefix' => 'driver',
        'auth'   => true, // adds POST /api/driver/auth/login, …/logout, …/register, …/password/*
        'models' => ['trips'],
    ],
],
```

- The legacy unprefixed `/api/auth/*` set **always remains** and maps to the
  `default`/no-group case, preserving today's behavior for apps that don't opt in.
- A group with `auth` and a `domain` gets `…/auth/login` on that host; with a
  prefix it gets `{prefix}/auth/login`. Both carry the group's `route_group`.
- The resolved `route_group` flows into membership checks and lifecycle hooks.
- `public` is never auth-enabled.

### Lifecycle hooks

A group may declare an optional `'hooks'` class implementing
`Rhino\Contracts\AuthLifecycleHooks` (an abstract base with no-op defaults for
each event). The relevant auth action calls it **after** it succeeds, passing
the user and a context (`{ user, routeGroup, organization?, token?, request }`):

```php title="app/Auth/DriverAuthHooks.php"
namespace App\Auth;

use Rhino\Contracts\AuthLifecycleHooks;
use Rhino\Exceptions\RhinoAuthRejected;

class DriverAuthHooks extends AuthLifecycleHooks
{
    public function afterLogin(array $ctx): void
    {
        if (! $ctx['user']->driver?->active) {
            // Revokes the just-issued token and returns 403.
            throw new RhinoAuthRejected(403, 'Driver account is suspended.');
        }
    }
}
```

```php title="config/rhino.php"
'driver' => [
    'prefix' => 'driver',
    'auth'   => true,
    'hooks'  => \App\Auth\DriverAuthHooks::class,
    'models' => ['trips'],
],
```

| Event                  | Fires after                     | Can reject?                                        |
|------------------------|---------------------------------|----------------------------------------------------|
| `afterLogin`           | successful login (token issued) | yes — revokes the token, returns the status        |
| `afterRegister`        | invitation-accept registration  | yes — revokes the token, returns the status        |
| `afterLogout`          | logout                          | yes (token is already gone; returns the status)    |
| `afterPasswordReset`   | password reset completed        | yes                                                |
| `afterPasswordRecover` | recovery email requested        | runs, but the rejection is **swallowed** (see note) |

A hook rejects by throwing `RhinoAuthRejected($status = 403, $message)`. For
token-issuing actions (`login`, `register`) the controller **revokes the
just-issued token** and returns the given status; for the others it returns the
status with no side effects. The default status is 403; a hook may set 401/409/etc.

:::warning `afterPasswordRecover` rejections are swallowed
The recover action still **runs** the hook (so side effects like auditing or
throttling happen), but **swallows any rejection** — it always returns the same
uniform "recovery email sent" response whether or not the email exists.
Surfacing the hook's status would turn recover into an email-enumeration oracle.
Reject semantics are preserved for `afterLogin`/`afterRegister`/`afterLogout`/`afterPasswordReset`.
:::

### Invitations carry the group

When a group is an access boundary, invitations record which group the invitee
joins:

- Invite creation stores a `route_group` (with `organization_id` only for tenant
  groups — non-tenant group invites store a `NULL` org).
- Accept populates the `user_roles` membership with that `route_group` (+ org +
  role), then fires the group's `afterRegister` hook.
- You **cannot** invite into the `public` group (it has no auth).
- When enforcement is on, the inviter must themselves be a member of the target
  group.

## Examples

### Simple Non-Tenant App

```php title="config/rhino.php"
'route_groups' => [
    'default' => [
        'prefix' => '',
        'middleware' => [],
        'models' => '*',
    ],
],
```

Routes: `GET /api/posts`, `POST /api/posts`, etc.

### Simple Multi-Tenant App

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

Routes: `GET /api/{organization}/posts`, `POST /api/{organization}/posts`, etc.

### Hybrid Platform (Logistics Example)

A logistics platform with four user types accessing the same resources differently:

```php title="config/rhino.php"
'models' => [
    'trips' => \App\Models\Trip::class,
    'construction-sites' => \App\Models\ConstructionSite::class,
    'trucks' => \App\Models\Truck::class,
    'materials' => \App\Models\Material::class,
    'organizations' => \App\Models\Organization::class,
],

'route_groups' => [
    // Customer dashboard — org-scoped, full CRUD
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],

    // Driver app — authenticated, not org-scoped
    'driver' => [
        'prefix' => 'driver',
        'middleware' => [],
        'models' => ['trips', 'construction-sites', 'trucks'],
    ],

    // Admin panel — authenticated, global access to everything
    'admin' => [
        'prefix' => 'admin',
        'middleware' => [],
        'models' => '*',
    ],

    // Public API — no authentication, read-only reference data
    'public' => [
        'prefix' => 'public',
        'middleware' => [],
        'models' => ['materials'],
    ],
],

'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

This generates:

| Group   | Example Route                        | Auth       | Org Scoped |
|---------|--------------------------------------|------------|------------|
| tenant  | `GET /api/acme-corp/trips`           | sanctum    | Yes        |
| tenant  | `GET /api/acme-corp/materials`       | sanctum    | Yes        |
| driver  | `GET /api/driver/trips`              | sanctum    | No         |
| driver  | `GET /api/driver/trucks`             | sanctum    | No         |
| admin   | `GET /api/admin/trips`               | sanctum    | No         |
| admin   | `GET /api/admin/materials`           | sanctum    | No         |
| public  | `GET /api/public/materials`          | None       | No         |

## Route Naming

All routes are named with the pattern `{group}.{model}.{action}`:

```
tenant.trips.index
tenant.trips.store
tenant.trips.show
driver.trips.index
driver.trucks.show
admin.trips.index
public.materials.index
```

## How Organization Scoping Works

Organization scoping is **implicit**, not configured per group. The GlobalController's `applyOrganizationScope()` checks if the request has an organization:

- **Tenant group** → middleware sets `request()->get('organization')` → scoping applied
- **Other groups** → no middleware sets organization → scoping skipped, queries return all records

This means you don't need any extra configuration for non-tenant groups to bypass org scoping — it happens naturally.

## Custom Scoping for Non-Tenant Groups

For groups like `driver` that need custom data filtering (e.g., a driver only sees their own trips), use standard Laravel global scopes:

```php title="app/Scopes/DriverScope.php"
namespace App\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class DriverScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = auth()->user();
        $routeGroup = request()->route()?->defaults['route_group'] ?? null;

        if ($routeGroup === 'driver' && $user) {
            $builder->where('driver_id', $user->driver_id);
        }
    }
}
```

```php title="app/Models/Trip.php"
namespace App\Models;

use App\Scopes\DriverScope;
use Illuminate\Database\Eloquent\Model;

class Trip extends Model
{
    protected static function booted(): void
    {
        static::addGlobalScope(new DriverScope);
    }
}
```

Now when a driver accesses `GET /api/driver/trips`, they only see their own trips. When an admin accesses `GET /api/admin/trips`, they see all trips (the scope checks `route_group` and only applies for `driver`).

## Permission Resolution

Rhino uses two permission sources based on the route group context:

| Route Group | Permission Source | When Used |
|-------------|------------------|-----------|
| `tenant` | `user_roles.permissions` | Organization middleware sets org on request |
| Any other | `users.permissions` | No organization context |

### Setup

Add a `permissions` JSON column to your users table:

```php title="database/migrations/add_permissions_to_users_table.php"
Schema::table('users', function (Blueprint $table) {
    $table->json('permissions')->nullable();
});
```

Add the cast to your User model:

```php title="app/Models/User.php"
class User extends Authenticatable
{
    use HasPermissions;

    protected $casts = [
        'permissions' => 'array',
    ];
}
```

### Assigning Permissions

```php title="database/seeders/UserSeeder.php"
// Driver: can view and manage their trips and trucks
$driver->update([
    'permissions' => ['trips.index', 'trips.show', 'trucks.*'],
]);

// Platform admin: full access to everything
$admin->update([
    'permissions' => ['*'],
]);
```

### How It Works

When `hasPermission()` is called:

1. **Organization present** (tenant route group) → checks `user_roles.permissions` for that organization
2. **No organization** (non-tenant route group) → checks `users.permissions` directly

This is deterministic — the decision is based on the presence of an organization in the request, which is set by middleware in tenant route groups. There is no fallback chain.

## Request Flow Walkthrough

### Customer Request: `GET /api/acme-corp/trips`

1. Route matches `tenant.trips.index`
2. `auth:sanctum` middleware authenticates the user
3. `ResolveOrganizationFromRoute` middleware resolves "acme-corp" to an Organization model
4. Organization is set on the request: `request()->attributes->set('organization', $org)`
5. GlobalController `applyOrganizationScope()` finds the organization → scopes query to org
6. Response contains only Acme Corp's trips

### Driver Request: `GET /api/driver/trips`

1. Route matches `driver.trips.index`
2. `auth:sanctum` middleware authenticates the user
3. No organization middleware → no org on request
4. GlobalController `applyOrganizationScope()` finds no organization → skips org scope
5. `DriverScope` global scope on Trip model detects `route_group = 'driver'` → filters by `driver_id`
6. Response contains only the driver's trips

### Admin Request: `GET /api/admin/trips`

1. Route matches `admin.trips.index`
2. `auth:sanctum` middleware authenticates the user
3. No organization middleware → no org on request
4. GlobalController `applyOrganizationScope()` finds no organization → skips org scope
5. `DriverScope` global scope detects `route_group = 'admin'` → does nothing
6. Response contains all trips across all organizations

### Public Request: `GET /api/public/materials`

1. Route matches `public.materials.index`
2. No `auth:sanctum` middleware (public group)
3. No organization middleware
4. GlobalController serves the request without auth or org scoping
5. Response contains all materials

## Migration from Previous Config

If you're upgrading from a previous Rhino version, update your `config/rhino.php`:

**Before:**

```php title="config/rhino.php"
'public' => ['materials'],
'multi_tenant' => [
    'enabled' => true,
    'use_subdomain' => false,
    'organization_identifier_column' => 'slug',
    'middleware' => ResolveOrganizationFromRoute::class,
],
```

**After:**

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
    'public' => [
        'prefix' => '',
        'middleware' => [],
        'models' => ['materials'],
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

Key changes:
- Remove `'public'` top-level key → use a `'public'` route group instead
- Remove `'enabled'`, `'use_subdomain'`, and `'middleware'` from `multi_tenant` → these are now expressed via `route_groups`
- Keep `'organization_identifier_column'` in `multi_tenant` (still used by middleware)
