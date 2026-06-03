---
sidebar_position: 8
title: Route Groups
---

# Route Groups

Route groups allow you to register the same models under multiple URL prefixes, each with its own middleware stack and authentication behavior. This enables hybrid platforms where different user types access resources through different contexts.

## Configuration

Define route groups in `config/initializers/rhino.rb`:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.route_group :group_name, prefix: 'url-prefix', middleware: [SomeMiddleware], models: :all
end
```

### Reserved Group Names

Two group names have special behavior:

| Name      | Behavior                                                               |
|-----------|------------------------------------------------------------------------|
| `:tenant` | Invitation and nested routes are registered under this group's prefix  |
| `:public` | Authentication is **skipped** for routes in this group                 |

All other group names (e.g., `:driver`, `:admin`, `:default`) are standard authenticated groups.

### Model Selection

- `models: :all` — registers all models from `config.models`
- `models: [:posts, :categories]` — registers only the specified model slugs

### Domain Constraints

A route group can be constrained to a specific host with the optional `domain:`
keyword. This lets two groups share the same `prefix:` while living on different
domains.

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'

  # Only matches requests to admin.example.com
  config.route_group :admin, prefix: '', domain: 'admin.example.com', models: :all
end
```

Semantics:

| `domain:` value                  | Behavior                                                                                 |
|----------------------------------|------------------------------------------------------------------------------------------|
| omitted / `nil` / `''`           | Matches **any** host (default, fully backward compatible)                                 |
| `'admin.example.com'`            | Group's routes match **only** that exact host; other hosts get a 404                      |
| `'{organization}.example.com'`   | Matches that host pattern and captures `{organization}`, feeding org resolution           |

`domain:` and `prefix:` are independent and combine — a group may have both.

:::warning Conflicting groups fail fast
Two groups that share the same prefix **and** overlapping models **and** an
intersecting host-set would silently shadow each other. Rhino validates the
config when routes are drawn and raises `Rhino::RouteGroupConflictError` in that
case. The fix is to give them distinct prefixes, distinguish them with different
`domain:` values, or make their `models:` disjoint. A group without a `domain:`
matches every host, so it intersects with all others.
:::

#### Subdomain multi-tenancy

A **parameterized** domain captures a single host label and exposes it exactly
like the path-prefix `:organization` parameter, so subdomain multitenancy works
out of the box:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'

  config.route_group :tenant,
    prefix: '',
    domain: '{organization}.example.com',
    middleware: [Rhino::Middleware::ResolveOrganizationFromRoute],
    models: :all

  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

A request to `org-one.example.com` resolves the `org-one` organization (by the
configured identifier column) and scopes all data to it. Requests to an unknown
subdomain — or to an organization the authenticated user does not belong to —
return `404`. The capture matches a single label only, so `example.com` (no
subdomain) and `a.b.example.com` (multi-label) do **not** match.

When the `:tenant` group declares a domain, the tenant-scoped invitation and
nested (`/nested`) routes inherit that same domain constraint.

Internally the constraint is implemented by `Rhino::Routing::DomainConstraint`,
which compiles the pattern to an anchored, case-insensitive regex (`{name}`
becomes `(?<name>[^.]+)`) and injects captured values into the request's path
parameters so `ResolveOrganizationFromRoute` (and the controller) resolve the
organization from the subdomain.

## Examples

### Simple Non-Tenant App

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.model :comments, 'Comment'

  config.route_group :default, prefix: '', middleware: [], models: :all
end
```

Routes: `GET /api/posts`, `POST /api/posts`, etc.

### Simple Multi-Tenant App

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.model :organizations, 'Organization'

  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

Routes: `GET /api/:organization/posts`, `POST /api/:organization/posts`, etc.

### Hybrid Platform (Logistics Example)

A logistics platform with four user types accessing the same resources differently:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :trips, 'Trip'
  config.model :construction_sites, 'ConstructionSite'
  config.model :trucks, 'Truck'
  config.model :materials, 'Material'
  config.model :organizations, 'Organization'

  # Customer dashboard — org-scoped, full CRUD
  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  # Driver app — authenticated, not org-scoped
  config.route_group :driver, prefix: 'driver', middleware: [], models: [:trips, :construction_sites, :trucks]

  # Admin panel — authenticated, global access to everything
  config.route_group :admin, prefix: 'admin', middleware: [], models: :all

  # Public API — no authentication, read-only reference data
  config.route_group :public, prefix: 'public', middleware: [], models: [:materials]

  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

This generates:

| Group  | Example Route                     | Auth          | Org Scoped |
|--------|-----------------------------------|---------------|------------|
| tenant | `GET /api/acme-corp/trips`        | authenticated | Yes        |
| tenant | `GET /api/acme-corp/materials`    | authenticated | Yes        |
| driver | `GET /api/driver/trips`           | authenticated | No         |
| driver | `GET /api/driver/trucks`          | authenticated | No         |
| admin  | `GET /api/admin/trips`            | authenticated | No         |
| admin  | `GET /api/admin/materials`        | authenticated | No         |
| public | `GET /api/public/materials`       | None          | No         |

## Route Naming

All routes are named with the pattern `rhino_{group}_{model}_{action}`:

```
rhino_tenant_trips_index
rhino_tenant_trips_store
rhino_tenant_trips_show
rhino_driver_trips_index
rhino_driver_trucks_show
rhino_admin_trips_index
rhino_public_materials_index
```

## How Organization Scoping Works

Organization scoping is **implicit**, not configured per group. The ResourcesController's `apply_organization_scope` checks if the request has an organization in `request.env["rhino.organization"]`:

- **Tenant group** → middleware sets `rhino.organization` on the request → scoping applied
- **Other groups** → no middleware sets organization → scoping skipped, queries return all records

This means you don't need any extra configuration for non-tenant groups to bypass org scoping — it happens naturally.

## Custom Scoping for Non-Tenant Groups

For groups like `driver` that need custom data filtering (e.g., a driver only sees their own trips), use standard Rails scoping mechanisms:

```ruby title="app/models/concerns/driver_scopable.rb"
module DriverScopable
  extend ActiveSupport::Concern

  included do
    default_scope do
      if RequestStore.store[:route_group] == 'driver'
        where(driver_id: Current.user&.driver_id)
      else
        all
      end
    end
  end
end
```

```ruby title="app/models/trip.rb"
class Trip < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation
  include DriverScopable

  # ...
end
```

Now when a driver accesses `GET /api/driver/trips`, they only see their own trips. When an admin accesses `GET /api/admin/trips`, they see all trips.

:::tip Route Group in Params
The current route group is available via `params[:route_group]` in the controller. You can also access it via route defaults for use in model scopes.
:::

## Permission Resolution

Rhino uses two permission sources based on the route group context:

| Route Group | Permission Source | When Used |
|-------------|------------------|-----------|
| `:tenant` | `roles.permissions` (via `user_roles`) | Organization middleware sets org on request |
| Any other | `users.permissions` | No organization context |

### Setup

Add a `permissions` JSON column to your users table:

```ruby title="db/migrate/add_permissions_to_users.rb"
class AddPermissionsToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :permissions, :json
  end
end
```

Add the column to your User model's attributes:

```ruby title="app/models/user.rb"
class User < ApplicationRecord
  include Rhino::HasPermissions

  # ...
end
```

### Assigning Permissions

```ruby title="db/seeds.rb"
# Driver: can view and manage their trips and trucks
driver.update!(permissions: ['trips.index', 'trips.show', 'trucks.*'])

# Platform admin: full access to everything
admin.update!(permissions: ['*'])
```

### How It Works

When `has_permission?` is called:

1. **Organization present** (tenant route group) → checks `roles.permissions` for that organization via `user_roles`
2. **No organization** (any other route group) → checks `users.permissions` directly

This is deterministic — the decision is based on the presence of an organization in the request, which is set by middleware in tenant route groups. There is no fallback chain.

## Request Flow Walkthrough

### Customer Request: `GET /api/acme-corp/trips`

1. Route matches `rhino_tenant_trips_index`
2. Authentication middleware authenticates the user
3. `ResolveOrganizationFromRoute` middleware resolves "acme-corp" to an Organization model
4. Organization is set on the request: `request.env["rhino.organization"] = org`
5. ResourcesController `apply_organization_scope` finds the organization → scopes query to org
6. Response contains only Acme Corp's trips

### Driver Request: `GET /api/driver/trips`

1. Route matches `rhino_driver_trips_index`
2. Authentication middleware authenticates the user
3. No organization middleware → no org on request
4. ResourcesController `apply_organization_scope` finds no organization → skips org scope
5. `DriverScopable` default scope detects `route_group = 'driver'` → filters by `driver_id`
6. Response contains only the driver's trips

### Admin Request: `GET /api/admin/trips`

1. Route matches `rhino_admin_trips_index`
2. Authentication middleware authenticates the user
3. No organization middleware → no org on request
4. ResourcesController `apply_organization_scope` finds no organization → skips org scope
5. `DriverScopable` default scope detects `route_group = 'admin'` → does nothing
6. Response contains all trips across all organizations

### Public Request: `GET /api/public/materials`

1. Route matches `rhino_public_materials_index`
2. No authentication (public group)
3. No organization middleware
4. ResourcesController serves the request without auth or org scoping
5. Response contains all materials

## Migration from Previous Config

If you're upgrading from a previous Rhino version, update your `config/initializers/rhino.rb`:

**Before:**

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.public_model :materials

  config.multi_tenant = {
    enabled: true,
    use_subdomain: false,
    organization_identifier_column: 'slug'
  }
end
```

**After:**

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.model :materials, 'Material'

  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all
  config.route_group :public, prefix: 'public', middleware: [], models: [:materials]

  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

Key changes:
- Remove `public_model` calls → use a `:public` route group instead
- Remove `enabled`, `use_subdomain`, and `middleware` from `multi_tenant` → these are now expressed via `route_groups`
- Keep `organization_identifier_column` in `multi_tenant` (still used by middleware)
