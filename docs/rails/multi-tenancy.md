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

```ruby title="db/seeds.rb"
admin = Role.create!(
  name: 'Admin',
  slug: 'admin',
  permissions: ['*']
)

editor = Role.create!(
  name: 'Editor',
  slug: 'editor',
  permissions: [
    'posts.index', 'posts.show', 'posts.store', 'posts.update',
    'comments.*',
  ]
)

viewer = Role.create!(
  name: 'Viewer',
  slug: 'viewer',
  permissions: ['posts.index', 'posts.show']
)
```

### Assigning Users to Organizations

```ruby title="db/seeds.rb"
# User is admin in Acme Corp
UserRole.create!(
  user_id: user.id,
  organization_id: acme_corp.id,
  role_id: admin.id
)

# Same user is viewer in Other Org
UserRole.create!(
  user_id: user.id,
  organization_id: other_org.id,
  role_id: viewer.id
)
```

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
Returning 404 instead of 403 prevents leaking information about organization existence. Users can't discover which organization slugs are valid.
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
