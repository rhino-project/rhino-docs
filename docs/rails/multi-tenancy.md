---
sidebar_position: 7
title: Multi-Tenancy
---

# Multi-Tenancy

Rhino supports organization-based data isolation out of the box. Each user can belong to multiple organizations with different roles in each.

## Enabling Multi-Tenancy

During `rails rhino:install`, select **Yes** when asked about multi-tenant support. This creates:

- `organizations` table and model
- `roles` table and model
- `user_roles` junction table
- Organization resolution middleware
- Role and organization seeders

Or configure it manually in `config/initializers/rhino.rb`:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :posts, 'Post'

  c.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  c.multi_tenant = { organization_identifier_column: 'slug' }  # 'id', 'slug', or 'uuid'
end
```

:::tip Hybrid Platforms
For platforms that need both tenant and non-tenant routes (e.g., customer dashboard + driver app + admin panel), see [Route Groups](./route-groups.md).
:::

## Route Groups Without a Tenant Boundary

Every [route group](./route-groups.md) is a tenant group by default, which is what a tenant app
wants: the [resource-scope resolver](./custom-controllers.md) **fails closed**, so `Rhino.query` on an
organization-scopable model with no organization context raises `Rhino::MissingTenantContext` rather
than returning every tenant's rows.

Some groups genuinely have no tenant to resolve — a back office or admin group whose operators are
meant to see every organization's records, with access decided by **roles and scopes** instead of by
organization. Declare the group non-tenant:

```ruby title="config/initializers/rhino.rb"
config.route_group :tenant,
  prefix: ":organization",
  middleware: [Rhino::Middleware::ResolveOrganizationFromRoute],
  models: :all

config.route_group :admin,
  prefix: "admin",
  tenant: false,   # no tenant boundary: queries here span every organization
  models: []
```

Inside that group, `Rhino.query` and `Rhino.scoped_query` apply **no** organization filter and no
longer raise. The `:tenant` group in the same app is untouched and keeps failing closed — that is the
point of putting the switch on the group rather than on the app.

### Publishing the group from a custom controller

The resolver reads the group from the request's `route_group`, the same value memberships and
policies use. Rhino's own controllers publish it; a controller you write includes the concern:

```ruby title="app/controllers/admin_dashboard_controller.rb"
class AdminDashboardController < ApplicationController
  include Rhino::RouteGroupContext
  rhino_route_group :admin

  def summary
    render json: { tasks_total: Rhino.query(Task).count }
  end
end
```

Without an explicit `rhino_route_group`, the concern falls back to the route's own default:

```ruby title="config/routes.rb"
get "/api/admin/dashboard", to: "admin_dashboard#summary",
                            defaults: { route_group: "admin" }
```

Declare non-tenant routes **before** any `:organization`-prefixed route, or `/api/admin/dashboard`
matches the tenant route with `:organization = "admin"` and 404s as an unknown organization.

### What declaring a group non-tenant does not change

It removes **only** the organization filter, and only for requests served by that group:

| Still applies in a `tenant: false` group | Why |
|---|---|
| The model's `default_scope` / auto-scopes | Your user-aware scopes are where row-level access lives when there is no organization |
| `allowed_scopes` named scopes | `Rhino.scoped_query(Model, "published")` behaves identically |
| Policies | The resolver scopes rows; Pundit still decides access |
| Explicit `in_organization(org)` | An explicitly requested organization is always honored — the caller asked for that tenant |
| CRUD through the Rhino controllers | Tenant groups resolve and scope the organization exactly as before |

Everything that is **not** provably a non-tenant group keeps failing closed — an unknown group, a
request with no group, and any code running outside a request that does not say which group it is
acting as.

### Naming the group where no request resolves one

An Active Job, a rake task or the console has no request, so nothing publishes a group and a bare
`Rhino.query` fails closed. Such code names the group it is acting as:

```ruby
# A back-office job: the :admin group is declared `tenant: false`, so this
# legitimately spans every organization.
Rhino.in_route_group(:admin).query(Task).where(status: "open").count

# With an operator, so the model's user-aware scopes still narrow the rows:
Rhino.for_user(operator).in_route_group(:admin).query(Task)

# Ambient calls inside the block see the group too:
Rhino.in_route_group(:admin).run { Rhino.query(Task).count }
```

The initializer remains the single source of truth: the **named group's own** `tenant: false` is what
lifts the boundary. Naming a tenant group — or one that is not configured — changes nothing and still
raises, so this states a context rather than bypassing one:

```ruby
Rhino.in_route_group(:tenant).query(Task)  # still raises Rhino::MissingTenantContext
Rhino.for_user(admin).query(Task)          # no group named → still raises
```

For a job that belongs to **one** tenant, pass that tenant instead — an explicit organization always
scopes, in any group:

```ruby
Rhino.for_user(admin).in_organization(org).query(Task)
```

The context is restored after the relation is built (and after `run`), so it never leaks into a later
ambient query in a long-lived worker.

:::warning Only for groups with no tenant boundary
`tenant: false` removes the guard that turns a forgotten tenant context into a loud crash — for that
group, a missing organization becomes a **silent cross-tenant read** instead. Declare it only on
groups where every operator is meant to see every organization's rows, and keep those groups' model
lists narrow (`models: []` when the group only serves custom controllers).
:::

## How It Works

When a `:tenant` route group is configured, all routes in that group include the organization:

```
/api/{organization}/posts
/api/{organization}/comments
/api/{organization}/users
```

The middleware:

1. Resolves the organization from the URL (or subdomain)
2. Validates the organization exists (404 if not)
3. Checks the authenticated user belongs to that organization (404 if not)
4. Scopes all queries to that organization automatically

## Organization Resolution Strategies

### Route Prefix (Default)

The organization identifier is part of the URL path:

```bash title="terminal"
GET /api/acme-corp/posts       # Using slug
GET /api/1/posts               # Using id
GET /api/abc-123-def/posts     # Using uuid
```

Uses `Rhino::Middleware::ResolveOrganizationFromRoute`. The identifier column is configurable:

```ruby title="config/initializers/rhino.rb"
c.multi_tenant[:organization_identifier_column] = 'slug'  # matches organizations.slug column
```

### Subdomain

The organization is extracted from the subdomain:

```bash title="terminal"
GET https://acme-corp.yourapp.com/api/posts
GET https://other-org.yourapp.com/api/posts
```

This is expressed with a **parameterized `domain:`** on the tenant route group.
The captured `{organization}` segment is injected into the request's path
parameters, so the standard `Rhino::Middleware::ResolveOrganizationFromRoute`
resolves it exactly as it does for a path prefix:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :posts, 'Post'

  c.route_group :tenant,
    prefix: '',
    domain: '{organization}.yourapp.com',
    middleware: [Rhino::Middleware::ResolveOrganizationFromRoute],
    models: :all

  c.multi_tenant = { organization_identifier_column: 'slug' }
end
```

See [Route Groups → Domain Constraints](./route-groups.md#domain-constraints) for
the full semantics. A domain parameter matches a single host label, so an apex
request like `yourapp.com/api/posts` does not match the tenant group — keep
non-tenant subdomains (e.g. `www`, `app`) on their own group or host.

## Scoping Models

Add `BelongsToOrganization` to scope a model's data per organization:

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation
  include Rhino::BelongsToOrganization

  has_discard
end
```

Migration:

```ruby title="db/migrate/create_posts.rb"
class CreatePosts < ActiveRecord::Migration[8.0]
  def change
    create_table :posts do |t|
      t.string :title
      t.text :content
      t.references :organization, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.datetime :discarded_at
      t.timestamps
    end
  end
end
```

Now `GET /api/acme-corp/posts` only returns posts where `organization_id` matches Acme Corp. The `organization_id` is automatically set when creating records.

### Nested Organization Ownership

Not all models have a direct `organization_id` column. For nested models, Rhino auto-detects the path to the organization by walking `belongs_to` relationships:

```ruby title="app/models/comment.rb"
class Comment < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::BelongsToOrganization

  # Comment → Post → Blog → Organization is auto-detected
  belongs_to :post
end
```

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::BelongsToOrganization

  # Post → Blog → Organization is auto-detected
  belongs_to :blog
  has_many :comments
end
```

```ruby title="app/models/blog.rb"
class Blog < ApplicationRecord
  include Rhino::BelongsToOrganization

  # Blog has organization_id directly
  belongs_to :organization
  has_many :posts
end
```

## Per-Organization Roles

Users have roles scoped to each organization. A user can be **admin** in one organization and **viewer** in another.

### Setting Up Roles

Roles are named buckets. Their permissions live in the **role layer**
(`org_role_permissions`), defined once per `(organization, role)` — every member
of that role in that org inherits it.

```ruby title="db/seeds.rb"
# Roles (just slug + name)
admin  = Role.create!(name: 'Admin',  slug: 'admin')
editor = Role.create!(name: 'Editor', slug: 'editor')
viewer = Role.create!(name: 'Viewer', slug: 'viewer')

# The shared role layer — what each role can do *within an organization*.
[acme_corp, other_org].each do |org|
  OrgRolePermission.create!(organization: org, role: admin,  permissions: ['*'])
  OrgRolePermission.create!(organization: org, role: editor,
    permissions: ['posts.index', 'posts.show', 'posts.store', 'posts.update', 'comments.*'])
  OrgRolePermission.create!(organization: org, role: viewer,
    permissions: ['posts.index', 'posts.show'])
end
```

### Assigning Users to Organizations

Each `user_roles` row carries only the user's **deltas** — extra abilities
(`granted_permissions`) or carve-outs (`denied_permissions`). Leave them empty to
inherit the role layer as-is.

```ruby title="db/seeds.rb"
# User is admin in Acme Corp (inherits '*' from the role layer)
UserRole.create!(user_id: user.id, organization_id: acme_corp.id, role_id: admin.id)

# Same user is viewer in Other Org
UserRole.create!(user_id: user.id, organization_id: other_org.id, role_id: viewer.id)

# Bob is an editor, but specifically may NOT delete posts (deny wins):
UserRole.create!(user_id: bob.id, organization_id: acme_corp.id, role_id: editor.id,
  denied_permissions: ['posts.destroy'])

# Carol is a viewer, but is also allowed to moderate comments (extra grant):
UserRole.create!(user_id: carol.id, organization_id: acme_corp.id, role_id: viewer.id,
  granted_permissions: ['comments.destroy'])
```

:::tip Effective permissions
`effective = (role ∪ granted) − denied`, and **deny always wins** (even over a
role `*`). The legacy global `roles.permissions` column is still honored as a
fallback. See [Layered Permissions](./policies.md#layered-permissions) for the
full model and the `rake rhino:permissions_migrate` command.
:::

### Checking Permissions

```ruby title="app/models/user.rb"
# User is admin in Acme Corp
user.has_permission?('posts.store', acme_corp)   # true
user.has_permission?('posts.destroy', acme_corp)  # true (admin has *)

# Same user is viewer in Other Org
user.has_permission?('posts.store', other_org)   # false
user.has_permission?('posts.index', other_org)   # true
```

## Group Membership Enforcement

By default, belonging to an organization is what grants access; a route group is
not itself an access boundary. You can opt into treating group membership as a
first-class gate with the master flag in `config/initializers/rhino.rb`:

```ruby title="config/initializers/rhino.rb"
config.auth = { enforce_group_membership: false } # default OFF — behavior unchanged
```

When the flag is **on**, after authentication an additional **coarse** check
runs before permissions: the user must hold a `user_roles` row whose
`route_group` matches the request's group (a `nil` `route_group` row is a
**wildcard** that matches every group) **and**, for tenant groups, the resolved
organization. No matching row → **403**. Permissions then resolve from that
matching membership row (per `[group, org]`), with an exact-group row preferred
over a wildcard row — instead of the org-presence heuristic.

This pairs with the per-group `auth:`/`hooks:` keywords and invitation
`route_group` described in [Route Groups → Group membership & auth](./route-groups.md#group-membership--auth).
With the flag off, none of this applies and multi-tenancy behaves exactly as
documented above.

## Access Control

### User Not in Organization

If a user tries to access an organization they don't belong to:

```bash title="terminal"
curl -H "Authorization: Bearer TOKEN" /api/other-org/posts
# → 404 { "message": "Organization not found" }
```

:::info Why 404 and not 403?
With `enforce_group_membership` **off** (the default), returning 404 instead of
403 prevents leaking information about organization existence — users can't
discover which organization slugs are valid. A genuinely unknown org always 404s.

When `enforce_group_membership` is **on**, this changes for an authenticated
**non-member** of the requested route group: the membership gate runs *before*
the org-resolution 404 and returns **403** (membership denial takes precedence
over the org 404). The gate resolves the org itself as needed, so a real org you
simply aren't a member of yields 403, while a genuinely non-existent org still
404s. See [Route Groups → Group membership & auth](./route-groups.md#group-membership--auth).
:::

### No Authentication

Requests without authentication to non-public endpoints:

```bash title="terminal"
curl /api/acme-corp/posts
# → 401 { "message": "Unauthenticated." }
```

### Public Endpoints

Models in a `:public` route group skip authentication:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.route_group :public, prefix: 'public', models: [:posts]
end
```

See [Route Groups](./route-groups.md) for more details on public and hybrid configurations.

## Full Setup Example

Here's a complete multi-tenant setup from scratch:

### 1. Enable in Config

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :posts, 'Post'
  c.model :comments, 'Comment'

  c.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  c.multi_tenant = { organization_identifier_column: 'slug' }
end
```

### 2. Create Models

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation
  include Rhino::BelongsToOrganization
  include Rhino::HasAuditTrail

  has_discard

  rhino_filters  :status, :user_id
  rhino_sorts    :created_at, :title
  rhino_default_sort '-created_at'
  rhino_includes :user, :comments
  rhino_search   :title, :content

  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published] }, allow_nil: true

  # Field permissions are controlled by the policy (PostPolicy).

  belongs_to :user
  has_many :comments
end
```

### 3. Seed Roles

```ruby title="db/seeds.rb"
Role.create!(name: 'Admin', slug: 'admin', permissions: ['*'])
Role.create!(name: 'Editor', slug: 'editor', permissions: [
  'posts.index', 'posts.show', 'posts.store', 'posts.update',
  'comments.*',
])
Role.create!(name: 'Viewer', slug: 'viewer', permissions: [
  'posts.index', 'posts.show',
  'comments.index', 'comments.show',
])
```

### 4. Create Organization & Assign Users

```ruby title="db/seeds.rb"
org = Organization.create!(name: 'Acme Corp', slug: 'acme-corp')

# Admin user
UserRole.create!(
  user_id: admin.id,
  organization_id: org.id,
  role_id: Role.find_by(slug: 'admin').id
)

# Editor user
UserRole.create!(
  user_id: editor.id,
  organization_id: org.id,
  role_id: Role.find_by(slug: 'editor').id
)
```

### 5. Use the API

```bash title="terminal"
# Admin: full access
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World", "status": "published"}'
# → 201 Created

# Editor: can create but not set status (role-based validation)
curl -H "Authorization: Bearer EDITOR_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World"}'
# → 201 Created

# Viewer: cannot create
curl -H "Authorization: Bearer VIEWER_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World"}'
# → 403 Forbidden
```
