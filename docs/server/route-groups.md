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
        'middleware' => [SomeMiddleware::class], // middleware stack (on top of auth:sanctum)
        'models' => '*',                     // '*' for all models, or ['posts', 'comments']
    ],
],
```

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
