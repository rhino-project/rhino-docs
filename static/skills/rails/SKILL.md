# Rhino Rails -- Comprehensive AI Reference

You are a senior software engineer specialized in **Rhino**, a Rails gem (`rhino`) that generates fully-featured REST APIs from model definitions. This is a single, comprehensive reference for building a complete project from scratch with Rhino Rails. When answering, assume the developer is working with **Rails (Ruby)** and uses **RSpec** for testing.

**CRITICAL RULE: Every code change MUST include tests using RSpec. No exceptions.**

---

## Feature Summary

Rhino auto-generates a complete REST API from your model definitions. Here is every feature it provides:

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Automatic CRUD Endpoints** | Generates `index`, `show`, `store`, `update`, `destroy` for every registered model — zero controller code needed. |
| 2 | **Authentication** | Built-in login, logout, password recovery/reset, and invitation-based registration via API token authentication. |
| 3 | **Authorization & Policies** | `ResourcePolicy` base class (Pundit) with convention-based permission checks (`{slug}.{action}`). Supports wildcards (`*`, `posts.*`). |
| 4 | **Role-Based Access Control** | Permissions stored per-role per-organization. Roles assigned via `user_roles` pivot table. |
| 5 | **Attribute-Level Permissions** | Control which fields each role can read (`permitted_attributes_for_show`, `hidden_attributes_for_show`) and write (`permitted_attributes_for_create`, `permitted_attributes_for_update`). |
| 6 | **Validation** | ActiveModel validations with `allow_nil: true` convention (field presence controlled by policy, format by model). |
| 7 | **Cross-Tenant FK Validation** | Foreign key references validated to belong to current organization, even through indirect FK relationships. |
| 8 | **Filtering** | `?filter[field]=value` with AND logic. Comma-separated values for OR (`?filter[status]=draft,published`). |
| 9 | **Sorting** | `?sort=field` (asc) or `?sort=-field` (desc). Multiple: `?sort=-created_at,title`. |
| 10 | **Full-Text Search** | `?search=term` across `rhino_search` fields. Supports relationship dot notation (`user.name`) via joins. |
| 11 | **Pagination** | `?page=N&per_page=N`. Metadata in response headers (`X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`). Per-page clamped 1–100. Powered by Pagy. |
| 12 | **Field Selection (Sparse Fieldsets)** | `?fields[posts]=id,title,status` to reduce payload. Primary key always included. |
| 13 | **Eager Loading (Includes)** | `?include=user,comments` with nested support (`comments.user`). Count (`commentsCount`) and existence (`commentsExists`) suffixes. Authorization checked per include. |
| 14 | **Multi-Tenancy** | Organization-based data isolation via `BelongsToOrganization` concern. Auto-sets `organization_id` via `RequestStore`, default scope filters queries. Route-prefix or subdomain resolution. |
| 15 | **Nested Ownership Auto-Detection** | Models without direct `organization_id` are scoped by walking `belongs_to` chains (e.g., Comment → Post → Blog → Organization). |
| 16 | **Route Groups** | Multiple URL prefixes with different middleware/auth per group, optionally constrained to a host via `domain:` (literal or `{organization}.example.com` for subdomain multitenancy). Reserved names: `:tenant` (org-scoped + invitations) and `:public` (no auth). |
| 17 | **Soft Deletes** | Via Discard gem (`discarded_at`). `DELETE` soft-deletes, plus `GET /trashed`, `POST /restore`, `DELETE /force-delete` endpoints. Each with its own permission. |
| 18 | **Audit Trail** | `HasAuditTrail` concern logs all CRUD events with old/new values, user, IP, user-agent, and organization context via `RequestStore`. |
| 19 | **Nested Operations** | `POST /nested` for atomic multi-model transactions. `$N.field` references between operations. All-or-nothing rollback. |
| 20 | **Invitations** | Token-based invitation system with create, resend, cancel, and accept endpoints. Configurable expiration and role assignment. |
| 21 | **Hidden Columns** | Base hidden columns (password, timestamps) + model-level (`rhino_additional_hidden`) + policy-level dynamic hiding per role. |
| 22 | **Auto-Scope Discovery** | `HasAutoScope` concern auto-registers scopes by naming convention (`Scopes::{ModelName}Scope`). Extend `Rhino::ResourceScope` for user/org/role access. |
| 23 | **UUID Primary Keys** | `HasUuid` concern for auto-generated UUID via `SecureRandom.uuid`. |
| 24 | **Middleware Support** | Global model middleware (`rhino_middleware`) and per-action middleware (`rhino_middleware_actions`). |
| 25 | **Action Exclusion** | `rhino_except_actions` to disable specific CRUD routes per model. |
| 26 | **Generator CLI** | `rhino:install` (setup), `rhino:generate` (scaffold model/policy/scope), `rhino:export_postman` (API collection), `invitation:link` (test invitations). |
| 27 | **Postman Export** | Auto-generated Postman Collection v2.1 with all endpoints, auth, example bodies, and filter/sort/include variants. |
| 28 | **Blueprint (YAML Code Generation)** | Define models, columns, relationships, and role-based permissions in YAML files. `rhino:blueprint` generates models, migrations, factories, policies, tests, and seeders from these definitions. Incremental via manifest tracking. |

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Models & Concerns](#2-models--concerns)
3. [Policies & Permissions](#3-policies--permissions)
4. [Validation](#4-validation)
5. [Query Builder](#5-query-builder)
6. [Multi-Tenancy](#6-multi-tenancy)
7. [Route Groups](#7-route-groups)
8. [Soft Deletes](#8-soft-deletes)
9. [Audit Trail](#9-audit-trail)
10. [Nested Operations](#10-nested-operations)
11. [Invitations](#11-invitations)
12. [Request Lifecycle](#12-request-lifecycle)
13. [Generator Commands](#13-generator-commands)
14. [Blueprint (YAML Code Generation)](#14-blueprint-yaml-code-generation)
15. [Public Route Groups](#15-public-route-groups)
16. [Hybrid Multi-Tenant Architecture](#16-hybrid-multi-tenant-architecture)
17. [Nested Filtering & Including](#17-nested-filtering--including)
18. [Security: Organization ID Protection](#18-security-organization-id-protection)
19. [Testing with RSpec](#19-testing-with-rspec)
20. [Q&A Reference](#20-qa-reference)

---

## 1. Getting Started

### Requirements

- Ruby 3.3+
- Rails 8.0+
- Bundler
- PostgreSQL (recommended) or MySQL/SQLite

### Installation

```bash
bundle add rhino-rails -v "~> 4.0"
rails rhino:install
```

The installer walks you through:
- Publishing config and routes
- Enabling multi-tenant support (organizations, roles)
- Enabling audit trail (change logging)
- Setting up Cursor AI toolkit (rules, skills, agents)

### Configuration

After installation, the config file lives at `config/initializers/rhino.rb`:

```ruby
Rhino.configure do |c|
  c.models = {
    posts:    'Post',
    comments: 'Comment',
  }

  c.public = [
    :posts,  # These endpoints skip auth middleware
  ]

  c.multi_tenant = {
    enabled: false,
    use_subdomain: false,
    organization_identifier_column: 'id',
    middleware: nil,
  }

  c.invitations = {
    expires_days: ENV.fetch('INVITATION_EXPIRES_DAYS', 7).to_i,
    allowed_roles: nil,
  }

  c.nested = {
    path: 'nested',
    max_operations: 50,
    allowed_models: nil,
  }

  c.test_framework = :rspec

  c.postman = {
    role_class:      'Role',
    user_role_class: 'UserRole',
    user_class:      'User',
  }
end
```

### Registering a Model

Create a model extending `RhinoModel` and register it:

```ruby
# app/models/post.rb
class Post < RhinoModel
  belongs_to :user
  has_many   :comments, dependent: :destroy

  validates :title,   length: { maximum: 255 }, allow_nil: true
  validates :content, length: { maximum: 10_000 }, allow_nil: true
  validates :status,  inclusion: { in: %w[draft published archived] }, allow_nil: true

  rhino_filters  :status, :user_id
  rhino_sorts    :created_at, :title, :updated_at
  rhino_default_sort '-created_at'
  rhino_includes :user, :comments
  rhino_search   :title, :content
end
```

```ruby
# config/initializers/rhino.rb
c.models = {
  posts: 'Post',
}
```

### Generated REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/:id` | Show single record with relationships |
| `PUT` | `/api/posts/:id` | Update with validation |
| `DELETE` | `/api/posts/:id` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/:id/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/:id/force_delete` | Permanent delete |

When multi-tenancy is enabled, all routes are prefixed with `:organization`:

```
GET /api/:organization/posts
POST /api/:organization/posts
```

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns API token |
| `POST` | `/api/auth/logout` | Revoke all tokens |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

### Running Migrations

```bash
rails db:migrate
```

This applies all Rhino-generated migrations (audit logs, roles, user_roles, organizations, etc.) and any model-specific migrations.

---

## 2. Models & Concerns

### RhinoModel Base Class

The recommended way to create Rhino models is to extend `Rhino::RhinoModel` (or just `RhinoModel` if published):

```ruby
class Post < Rhino::RhinoModel
  rhino_filters :status, :user_id
  rhino_sorts :created_at, :title
  rhino_search :title, :content

  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published] }, allow_nil: true
end
```

`Rhino::RhinoModel` extends `ApplicationRecord` and includes these concerns automatically:

| Concern | Purpose |
|---|---|
| `Rhino::HasRhino` | Query builder DSL (filters, sorts, includes, etc.) |
| `Rhino::HasValidation` | Role-based field allowlisting and validation |
| `Rhino::HidableColumns` | Dynamic column hiding from API responses |
| `Rhino::HasAutoScope` | Auto-discovery of `Scopes::{Model}Scope` classes (with `Rhino::ResourceScope` base) |

You can also extend `ApplicationRecord` directly and include concerns manually:

```ruby
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation
  include Rhino::HidableColumns
  include Rhino::HasAutoScope
end
```

### Optional Concerns

These are NOT included in `RhinoModel` because they require additional database columns, gems, or relationships. Add them manually:

```ruby
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model  # Soft deletes via discard gem
end
```

| Concern | Purpose |
|---|---|
| `Rhino::HasAuditTrail` | Automatic change logging to `audit_logs` table |
| `Rhino::HasUuid` | Auto-generated UUID on creation |
| `Rhino::BelongsToOrganization` | Multi-tenant organization scoping |
| `Rhino::HasPermissions` | Permission checking (User model only) |
| `Discard::Model` | Soft deletes via the Discard gem |

### Customizing the Base Class

Publish and customize:

```bash
rails rhino:install --publish-model
```

This creates `app/models/rhino_model.rb`:

```ruby
class RhinoModel < Rhino::RhinoModel
  include Rhino::HasAuditTrail  # Now all models get audit trail
end
```

### Complete Model Configuration DSL

```ruby
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model

  # -- Query Builder --
  rhino_filters   :status, :user_id, :category_id
  rhino_sorts     :created_at, :title, :updated_at
  rhino_default_sort '-created_at'
  rhino_fields    :id, :title, :content, :status
  rhino_includes  :user, :comments, :tags
  rhino_search    :title, :content

  # -- Pagination --
  rhino_pagination_enabled true
  rhino_per_page 25

  # -- Middleware --
  rhino_middleware 'throttle:60,1'
  rhino_middleware_actions(
    store:   ['verified'],
    destroy: ['admin']
  )

  # -- Route Exclusion --
  rhino_except_actions :destroy

  # -- Column Hiding --
  rhino_additional_hidden :api_token, :stripe_id

  # -- Audit Exclusion --
  rhino_audit_exclude :password, :remember_token

  # -- Relationships --
  belongs_to :user
  belongs_to :blog
  has_many :comments
  has_many :tags
end
```

### DSL Reference

| DSL Method | Type | Description |
|---|---|---|
| `rhino_filters` | `*symbols` | Fields available for `?filter[field]=value` |
| `rhino_sorts` | `*symbols` | Fields available for `?sort=field` (prefix `-` for desc) |
| `rhino_default_sort` | `string` | Sort applied when no `?sort` provided |
| `rhino_fields` | `*symbols` | Fields for sparse fieldsets `?fields[model]=field1,field2` |
| `rhino_includes` | `*symbols` | Relationships for `?include=relation` |
| `rhino_search` | `*symbols/strings` | Fields for `?search=term`. Supports dot-notation (e.g., `'user.name'`) |
| `rhino_pagination_enabled` | `bool` | Enable/disable pagination (default: `false`) |
| `rhino_per_page` | `integer` | Records per page (default: `25`) |
| `rhino_middleware` | `*strings` | Middleware for ALL routes |
| `rhino_middleware_actions` | `hash` | Middleware for specific actions (`:index`, `:show`, `:store`, `:update`, `:destroy`) |
| `rhino_except_actions` | `*symbols` | CRUD actions to exclude from route generation |
| `rhino_additional_hidden` | `*symbols` | Additional fields to always hide from API responses |
| `rhino_audit_exclude` | `*symbols` | Fields to exclude from audit trail logging |

### HasAutoScope

Automatically applies a global scope from `Scopes::{ModelName}Scope` (or `ModelScopes::{ModelName}Scope` as fallback).

**Recommended: Extend `Rhino::ResourceScope`** for access to `user`, `organization`, and `role`:

```ruby
# app/models/scopes/post_scope.rb
module Scopes
  class PostScope < Rhino::ResourceScope
    def apply(relation)
      if role == "viewer"
        relation.where(published: true)
      else
        relation
      end
    end
  end
end
```

Available methods inside `apply`: `user` (current user or nil), `organization` (current org or nil), `role` (user's role slug in current org or nil).

**Legacy: Class-method scopes** (no user/org context):

```ruby
module Scopes
  class PostScope
    def self.apply(scope)
      scope.where(is_visible: true)
    end
  end
end
```

The scope is only applied if the class exists. No registration needed beyond `HasAutoScope` (included in `RhinoModel` by default).

### HasPermissions (User Model)

```ruby
class User < Rhino::RhinoModel
  include Rhino::HasPermissions
  has_many :user_roles
end

user.has_permission?('posts.store', organization)   # true/false
user.has_permission?('*', organization)             # wildcard: full access
user.has_permission?('posts.*', organization)       # all post actions
```

### HasUuid

Auto-generates a UUID on creation. Requires a `uuid` column:

```ruby
class Invoice < Rhino::RhinoModel
  include Rhino::HasUuid
end
```

Migration:

```ruby
t.uuid :uuid, null: true
add_index :invoices, :uuid, unique: true
```

### BelongsToOrganization

Automatically filters queries to the current organization and sets `organization_id` on creation:

```ruby
class Post < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
end

# For nested models without a direct organization_id:
# Rhino auto-detects the path: Comment -> post -> blog -> organization
class Comment < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
  belongs_to :post
end
```

### HidableColumns

Controls column visibility across three layers:

1. **Base hidden** (always): `password`, `password_digest`, `remember_token`, `created_at`, `updated_at`, `deleted_at`, `discarded_at`, `email_verified_at`
2. **Model-level** via `rhino_additional_hidden`
3. **Policy-level** via `hidden_attributes_for_show()` / `permitted_attributes_for_show()`

#### `rhino_computed_attributes` — Adding Computed Attributes

Override `rhino_computed_attributes` to add virtual attributes to API responses. These are merged BEFORE policy filtering, so they respect `hidden_attributes_for_show` and `permitted_attributes_for_show`:

```ruby
class Contract < Rhino::RhinoModel
  def days_until_expiry
    (expiry_date - Date.current).to_i if expiry_date
  end

  def rhino_computed_attributes
    { 'days_until_expiry' => days_until_expiry }
  end
end
```

**IMPORTANT:** Do NOT override `as_rhino_json` directly — `super.merge(...)` adds attributes AFTER policy filtering, bypassing security. Always use `rhino_computed_attributes`.

### Model Registration

Models are registered in `config/initializers/rhino.rb`. The key becomes the URL slug and permission prefix:

```ruby
Rhino.configure do |c|
  c.model :'blog-posts', 'BlogPost'
  c.model :comments, 'Comment'
  c.model :categories, 'Category'
end
```

This generates routes like `GET /api/{organization}/blog-posts`. The key (e.g., `blog-posts`) is used as the permission prefix (e.g., `blog-posts.store`).

---

## 3. Policies & Permissions

### How Policies Work

Every CRUD request is authorized via a policy (built on Pundit):

1. Request comes in (e.g., `POST /api/posts`)
2. Rhino resolves the policy for the `Post` model (looks for `PostPolicy`)
3. The matching policy method is called (e.g., `create?`)
4. `Rhino::ResourcePolicy` checks `has_permission?` (e.g., `posts.store`)
5. If authorized, action proceeds. Otherwise, `403 Forbidden`

### ResourcePolicy

`Rhino::ResourcePolicy` is the base class. Default implementations delegate to permission checks:

| API Action | Policy Method | Alias | Permission Checked |
|---|---|---|---|
| `GET /posts` (index) | `index?` | `view_any?` | `posts.index` |
| `GET /posts/:id` (show) | `show?` | `view?` | `posts.show` |
| `POST /posts` (store) | `create?` | -- | `posts.store` |
| `PUT /posts/:id` (update) | `update?` | -- | `posts.update` |
| `DELETE /posts/:id` (destroy) | `destroy?` | `delete?` | `posts.destroy` |
| `GET /posts/trashed` | `view_trashed?` | -- | `posts.trashed` |
| `POST /posts/:id/restore` | `restore?` | -- | `posts.restore` |
| `DELETE /posts/:id/force-delete` | `force_delete?` | -- | `posts.forceDelete` |

### Creating a Policy

A minimal policy:

```ruby
# app/policies/post_policy.rb
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'
end
```

That is the entire policy. The parent class handles everything. If your resource slug matches what would be auto-resolved from config, you can omit `resource_slug`.

### Permission Format

```
{resource_slug}.{action}
```

Examples: `posts.index`, `posts.show`, `posts.store`, `posts.update`, `posts.destroy`, `posts.trashed`, `posts.restore`, `posts.forceDelete`

### Wildcard Permissions

| Permission | Meaning |
|---|---|
| `*` | Full access to everything (superadmin) |
| `posts.*` | All actions on posts |
| `posts.index` | Exact match only |

Wildcards are checked hierarchically: exact match first, then `posts.*`, then `*`.

### How Permissions Are Stored

**User-level permissions (`users.permissions` JSON column)**

For non-tenant route groups:

```
id | name         | email              | permissions (JSON)
1  | Alice Driver | alice@example.com  | ["trips.index", "trips.show", "trucks.*"]
2  | Bob Admin    | bob@example.com    | ["*"]
```

**Organization-scoped permissions (`roles.permissions` via `user_roles`)**

For the `:tenant` route group:

```
roles table:
id | name    | slug    | permissions (JSON)
1  | Admin   | admin   | ["*"]
2  | Editor  | editor  | ["posts.index", "posts.show", "posts.store", "posts.update", "comments.*"]
3  | Viewer  | viewer  | ["posts.index", "posts.show"]

user_roles table:
id | user_id | organization_id | role_id
1  | 1       | 1               | 1        (user 1 is admin in org 1)
2  | 2       | 1               | 2        (user 2 is editor in org 1)
```

**Resolution:** `has_permission?` checks:
1. **Organization present** (tenant route group) -> checks `roles.permissions` via `user_roles`
2. **No organization** (any other route group) -> checks `users.permissions` directly

### Attribute Permissions

**Field Visibility (Read)**

```ruby
class UserPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'users'

  def permitted_attributes_for_show(user)
    if has_role?(user, 'admin')
      ['*']  # Admins see everything
    else
      ['id', 'name', 'avatar']
    end
  end

  def hidden_attributes_for_show(user)
    if has_role?(user, 'admin')
      []
    else
      ['stripe_id', 'internal_notes']
    end
  end
end
```

Both methods receive `nil` when no authenticated user. Always handle `nil`.

**Field Permissions (Write)**

```ruby
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def permitted_attributes_for_create(user)
    if has_role?(user, 'admin')
      ['*']
    else
      ['title', 'content']
    end
  end

  def permitted_attributes_for_update(user)
    if has_role?(user, 'admin')
      ['*']
    else
      ['title', 'content']
    end
  end
end
```

When a user submits forbidden fields, API returns **403 Forbidden**:

```json
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

### Using `has_role?` Helper

Available in all policies extending `Rhino::ResourcePolicy`:

```ruby
def permitted_attributes_for_create(user)
  if has_role?(user, 'admin')
    ['*']
  elsif has_role?(user, 'editor')
    ['title', 'content', 'excerpt', 'category_id']
  else
    ['title', 'content']
  end
end
```

Handles `nil` users gracefully (returns `false`).

### Include Authorization

`GET /api/posts?include=comments` checks `comments.index` permission. If denied:

```json
{
    "message": "You do not have permission to include comments."
}
```

Applies to nested includes too: `?include=comments.author` checks both `comments.index` and `author.index`.

### Custom Policy Methods

```ruby
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def update?
    if user.has_permission?('*')
      true
    else
      super && record.user_id == user.id
    end
  end

  def destroy?
    if user.has_permission?('*')
      return true
    end
    super && record.created_at > 24.hours.ago
  end
end
```

Always call `super` to preserve base permission check.

### Error Responses

Authorization failure: `403 Forbidden`
```json
{ "message": "This action is unauthorized." }
```

Not authenticated: `401 Unauthorized`
```json
{ "message": "Unauthenticated." }
```

---

## 4. Validation

### How Validation Works

Models opt in via `Rhino::HasValidation` (included in `RhinoModel`). Define format rules on the model and field permissions on the policy.

On `store` or `update`:
1. Checks policy's `permitted_attributes_for_create(user)` or `permitted_attributes_for_update(user)`
2. Forbidden fields -> `403 Forbidden`
3. Runs ActiveModel validations on permitted fields
4. Failure -> `422 Unprocessable Entity` with field-level errors
5. Success -> proceeds with operation

### CRITICAL: `allow_nil: true`

**All validators MUST use `allow_nil: true`.** This is the single most important validation pattern in Rhino Rails.

Why: Rhino validates using `Model.new(params)`. On partial updates, fields not submitted are `nil`. Without `allow_nil: true`, those nil fields fail validation.

```ruby
validates :title, length: { maximum: 255 }, allow_nil: true        # CORRECT
validates :title, length: { maximum: 255 }                         # WRONG -- breaks partial updates
```

Presence requirements are handled by the policy's field permissions, NOT model validations.

### Model-Level Validation (ActiveModel)

```ruby
validates :title, length: { maximum: 255 }, allow_nil: true
validates :content, length: { maximum: 10_000 }, allow_nil: true
validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
validates :user_id, numericality: { only_integer: true }, allow_nil: true
validates :is_published, inclusion: { in: [true, false] }, allow_nil: true
validates :rating, numericality: { greater_than: 0, less_than_or_equal_to: 5 }, allow_nil: true
validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, uniqueness: true, allow_nil: true
```

### Error Response Format

`422 Unprocessable Entity`:

```json
{
    "errors": {
        "title": ["is too long (maximum is 255 characters)"],
        "status": ["is not included in the list"]
    }
}
```

### 403 vs 422

- **403 Forbidden**: User tried to set a field they are not allowed to (field permission denied by policy)
- **422 Unprocessable Entity**: Field is allowed but value failed format validation

### Custom Validation Messages

```ruby
validates :title, length: { maximum: 255, message: 'cannot exceed 255 characters' }, allow_nil: true
```

Or via locale files at `config/locales/en.yml`:

```yaml
en:
  activerecord:
    errors:
      models:
        post:
          attributes:
            title:
              too_long: "Post title cannot exceed %{count} characters."
```

---

## 5. Query Builder

### Model Configuration

```ruby
class Post < Rhino::RhinoModel
  rhino_filters :status, :user_id, :category_id
  rhino_sorts :created_at, :title, :updated_at, :published_at
  rhino_default_sort '-created_at'
  rhino_fields :id, :title, :content, :status, :created_at
  rhino_includes :user, :comments, :tags, :category
  rhino_search :title, :content, 'user.name'
end
```

Fields not listed in DSL calls are silently ignored (security feature).

### Filtering

```bash
# Single filter
GET /api/posts?filter[status]=published

# Multiple filters (AND)
GET /api/posts?filter[status]=published&filter[user_id]=1

# Multiple values for one field (OR)
GET /api/posts?filter[status]=draft,published
```

### Sorting

```bash
# Ascending
GET /api/posts?sort=title

# Descending (prefix with -)
GET /api/posts?sort=-created_at

# Multiple sorts
GET /api/posts?sort=status,-created_at
```

### Search

```bash
GET /api/posts?search=rails
```

Searches across all `rhino_search` fields. Case-insensitive `LIKE`. Supports dot-notation for relationships:

```ruby
rhino_search :title, :content, 'user.name'
```

For relationship fields, Rhino automatically uses `left_outer_joins`.

### Pagination

```bash
GET /api/posts?page=1&per_page=20
```

Metadata in **response headers** (NOT body):

```
X-Current-Page: 2
X-Last-Page: 10
X-Per-Page: 20
X-Total: 195
```

Body contains only the data array. Pagination is **disabled by default**:

```ruby
rhino_pagination_enabled true
rhino_per_page 25
```

Per-page values are clamped between 1 and 100.

### Field Selection (Sparse Fieldsets)

```bash
GET /api/posts?fields[posts]=id,title,status
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

### Eager Loading (Includes)

```bash
GET /api/posts?include=user
GET /api/posts?include=user,comments,tags
GET /api/posts?include=comments.user
```

**Count and Exists:**

```bash
GET /api/posts?include=commentsCount
GET /api/posts?include=commentsExists
```

Response:

```json
{
    "id": 1,
    "title": "My Post",
    "comments_count": 15,
    "comments_exists": true
}
```

### Combined Example

```bash
GET /api/posts?filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=rails&page=1&per_page=20
```

---

## 6. Multi-Tenancy

### Enabling

During `rails rhino:install`, select Yes for multi-tenant support. This creates:
- `organizations` table and model
- `roles` table and model
- `user_roles` junction table
- Organization resolution middleware
- Role and organization seeders

Or configure manually:

```ruby
Rhino.configure do |c|
  c.model :posts, 'Post'

  c.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  c.multi_tenant = { organization_identifier_column: 'slug' }
end
```

### How It Works

Routes include the organization:

```
/api/{organization}/posts
/api/{organization}/comments
```

The middleware:
1. Resolves the organization from the URL (or subdomain)
2. Validates the organization exists (404 if not)
3. Checks the user belongs to that organization (404 if not -- prevents leaking org existence)
4. Scopes all queries to that organization

### Organization Resolution Strategies

**Route Prefix (Default):**

```bash
GET /api/acme-corp/posts       # Using slug
GET /api/1/posts               # Using id
GET /api/abc-123-def/posts     # Using uuid
```

Uses `Rhino::Middleware::ResolveOrganizationFromRoute`.

```ruby
c.multi_tenant = { organization_identifier_column: 'slug' }
```

**Subdomain:**

```bash
GET https://acme-corp.yourapp.com/api/posts
```

Uses `Rhino::Middleware::ResolveOrganizationFromSubdomain`. Automatically skips: `www`, `app`, `api`, `localhost`, `127.0.0.1`.

```ruby
Rhino.configure do |c|
  c.route_group :tenant, prefix: '', middleware: [ResolveOrganizationFromSubdomain], models: :all
  c.multi_tenant = { organization_identifier_column: 'slug' }
end
```

### Scoping Models

```ruby
class Post < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
  belongs_to :user
  has_many :comments
end
```

Migration must include `organization_id`:

```ruby
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
    add_index :posts, :discarded_at
  end
end
```

### Nested Organization Ownership

Rhino auto-detects the path by walking `belongs_to` relationships:

```ruby
class Blog < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
  belongs_to :organization
  has_many :posts
end

class Post < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
  belongs_to :blog
  has_many :comments
end

class Comment < Rhino::RhinoModel
  include Rhino::BelongsToOrganization
  belongs_to :post
end
```

Comment -> Post -> Blog -> Organization is auto-detected. No direct `organization_id` needed on Comment or Post.

### Per-Organization Roles

```ruby
# db/seeds.rb
admin = Role.create!(name: 'Admin', slug: 'admin', permissions: ['*'])

editor = Role.create!(name: 'Editor', slug: 'editor', permissions: [
  'posts.index', 'posts.show', 'posts.store', 'posts.update',
  'comments.*',
])

viewer = Role.create!(name: 'Viewer', slug: 'viewer', permissions: [
  'posts.index', 'posts.show',
])
```

**Assigning Users:**

```ruby
UserRole.create!(user_id: user.id, organization_id: acme_corp.id, role_id: admin.id)
UserRole.create!(user_id: user.id, organization_id: other_org.id, role_id: viewer.id)
```

**Checking:**

```ruby
user.has_permission?('posts.store', acme_corp)   # true (admin)
user.has_permission?('posts.store', other_org)   # false (viewer)
```

### Access Control

- User not in organization -> `404` (prevents leaking org existence)
- Not authenticated -> `401`
- Public endpoints skip authentication

---

## 7. Route Groups

### Configuration

```ruby
Rhino.configure do |config|
  config.route_group :group_name, prefix: 'url-prefix', middleware: [SomeMiddleware], models: :all
end
```

### Reserved Group Names

| Name | Behavior |
|---|---|
| `:tenant` | Invitation and nested routes registered under this group's prefix |
| `:public` | Authentication is **skipped** |

All other names (`:driver`, `:admin`, `:default`) are standard authenticated groups.

### Model Selection

- `models: :all` -- all models from `config.models`
- `models: [:posts, :categories]` -- only specified slugs

### Domain Constraints

Optional `domain:` keyword constrains a group to a host. Two groups can share a `prefix:` on different domains.

| `domain:` | Behavior |
|---|---|
| omitted / `nil` / `''` | Matches any host (default, backward compatible) |
| `'admin.example.com'` | Matches only that exact host; other hosts get 404 |
| `'{organization}.example.com'` | Matches the pattern, captures `{organization}`, feeds org resolution like the path prefix `:organization` |

`domain:` and `prefix:` are independent and combine. Implemented by `Rhino::Routing::DomainConstraint`: compiles the pattern to an anchored, case-insensitive regex (`{name}` -> `(?<name>[^.]+)`, single label only) and injects captures into `request.path_parameters` so `ResolveOrganizationFromRoute` / the controller resolve the org from the subdomain.

```ruby
# Subdomain multi-tenancy: org-one.example.com scopes to org-one
config.route_group :tenant, prefix: '', domain: '{organization}.example.com',
  middleware: [Rhino::Middleware::ResolveOrganizationFromRoute], models: :all
config.multi_tenant = { organization_identifier_column: 'slug' }
```

Unknown subdomain or a non-member organization -> 404. `example.com` (no label) and `a.b.example.com` (multi-label) do not match `{organization}.example.com`. When `:tenant` has a domain, its invitation + nested routes inherit that domain.

### Examples

**Simple Non-Tenant App:**

```ruby
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.model :comments, 'Comment'

  config.route_group :default, prefix: '', middleware: [], models: :all
end
```

Routes: `GET /api/posts`, `POST /api/posts`, etc.

**Simple Multi-Tenant App:**

```ruby
Rhino.configure do |config|
  config.model :posts, 'Post'
  config.model :organizations, 'Organization'

  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all
  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

Routes: `GET /api/:organization/posts`, etc.

### Route Naming

Pattern: `rhino_{group}_{model}_{action}`

```
rhino_tenant_trips_index
rhino_driver_trips_index
rhino_admin_trips_index
rhino_public_materials_index
```

### Organization Scoping Is Implicit

`apply_organization_scope` checks `request.env["rhino.organization"]`:
- **Tenant group** -- middleware sets it -> scoping applied
- **Other groups** -- no middleware -> scoping skipped, queries return all records

### Custom Scoping for Non-Tenant Groups

```ruby
# app/models/concerns/driver_scopable.rb
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

Route group available via `params[:route_group]` or `RequestStore.store[:route_group]`.

### Permission Resolution

| Route Group | Permission Source |
|---|---|
| `:tenant` | `roles.permissions` (via `user_roles`) |
| Any other | `users.permissions` (JSON column) |

Setup for non-tenant groups:

```ruby
class AddPermissionsToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :permissions, :json
  end
end
```

```ruby
driver.update!(permissions: ['trips.index', 'trips.show', 'trucks.*'])
admin.update!(permissions: ['*'])
```

---

## 8. Soft Deletes

### Setup

Rhino uses the [Discard](https://github.com/jmez/discard) gem. Add `Discard::Model` and a `discarded_at` column:

```ruby
class Post < Rhino::RhinoModel
  include Discard::Model
end
```

Note: `RhinoModel` already includes `Discard::Model` -- no need to add it manually. Just ensure the migration has a `discarded_at` column.

```ruby
class CreatePosts < ActiveRecord::Migration[8.0]
  def change
    create_table :posts do |t|
      t.string :title
      t.text :content
      t.datetime :discarded_at  # soft delete column
      t.timestamps
    end
    add_index :posts, :discarded_at
  end
end
```

Rhino **auto-detects** `discarded_at` and generates all trash/restore/force-delete endpoints.

### Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| `DELETE` | `/api/posts/:id` | Soft delete (move to trash) | `posts.destroy` |
| `GET` | `/api/posts/trashed` | List trashed items | `posts.trashed` |
| `POST` | `/api/posts/:id/restore` | Restore from trash | `posts.restore` |
| `DELETE` | `/api/posts/:id/force-delete` | Permanently delete | `posts.forceDelete` |

### Behavior

- `GET /api/posts` -- excludes soft-deleted (Discard default scope)
- `DELETE /api/posts/1` -- sets `discarded_at`, record stays in DB
- `POST /api/posts/1/restore` -- clears `discarded_at`
- `DELETE /api/posts/1/force-delete` -- permanently removes

### Audit Trail Integration

If using both `Discard::Model` and `Rhino::HasAuditTrail`:
- Soft delete -> `deleted`
- Restore -> `restored`
- Force delete -> `force_deleted`

---

## 9. Audit Trail

### Enabling

During `rails rhino:install`, select Yes for audit trail. Then add `Rhino::HasAuditTrail` to models:

```ruby
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
end
```

### What Gets Logged

| Event | Action | Old Values | New Values |
|---|---|---|---|
| Created | `created` | `null` | All new field values |
| Updated | `updated` | Changed fields (before) | Changed fields (after) |
| Soft-deleted | `deleted` | All field values | `null` |
| Force-deleted | `force_deleted` | All field values | `null` |
| Restored | `restored` | `null` | All field values |

On updates, only changed fields are logged.

### Excluding Sensitive Fields

```ruby
class User < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  rhino_audit_exclude :password, :password_digest, :remember_token, :api_token, :two_factor_secret
end
```

`password` and `remember_token` are excluded by default.

### Audit Log Fields

| Field | Type | Description |
|---|---|---|
| `id` | integer | Auto-increment ID |
| `auditable_type` | string | Model class (e.g., `Post`) |
| `auditable_id` | integer | Primary key of audited record |
| `action` | string | `created`, `updated`, `deleted`, `force_deleted`, `restored` |
| `old_values` | JSON | Previous values (null on create) |
| `new_values` | JSON | New values (null on delete) |
| `user_id` | integer | User who made the change |
| `organization_id` | integer | Organization context |
| `ip_address` | string | Request IP |
| `user_agent` | string | Browser/client UA |
| `created_at` | datetime | When the change occurred |

### API Endpoint

```bash
GET /api/posts/42/audit
GET /api/posts/42/audit?page=1&per_page=20
```

### Querying in Code

```ruby
post.audit_logs.order(created_at: :desc)
post.audit_logs.where(action: 'updated')
post.audit_logs.where(user_id: 5)

Rhino::AuditLog.where(organization_id: org.id).order(created_at: :desc)
```

### Context Tracking

Rhino captures via `RequestStore`: `user_id`, `ip_address`, `user_agent`, `organization_id`.

---

## 10. Nested Operations

### Endpoint

```bash
POST /api/nested                       # Without multi-tenancy
POST /api/{organization}/nested        # With multi-tenancy
```

### Configuration

```ruby
Rhino.configure do |c|
  c.nested[:path] = 'nested'
  c.nested[:max_operations] = 50
  c.nested[:allowed_models] = nil   # nil = all, or ['posts', 'comments']
end
```

### Request Format

```json
{
    "operations": [
        {
            "action": "create",
            "model": "blogs",
            "data": { "title": "My Blog", "slug": "my-blog" }
        },
        {
            "action": "create",
            "model": "posts",
            "data": { "title": "First Post", "blog_id": "$0.id" }
        }
    ]
}
```

### Supported Actions

| Action | Required Fields |
|---|---|
| `create` | `model`, `data` |
| `update` | `model`, `id`, `data` |
| `delete` | `model`, `id` |

### Referencing Previous Results

Use `$N.field` syntax:
- `$0.id` -- `id` from first operation's result
- `$1.slug` -- `slug` from second operation's result

### Atomicity

All operations run inside `ActiveRecord::Base.transaction`. If ANY operation fails, the ENTIRE batch is rolled back. No partial results.

### Authorization

Each operation is individually authorized. The user must have permission for every action. If any fails, the entire batch is rejected with 403.

---

## 11. Invitations

### Overview

Invitation flow:
1. Authenticated user creates invitation for an email within an organization
2. 64-character hex token generated, email notification sent
3. Invitee clicks acceptance link
4. If authenticated -> accepted immediately, added to org with role
5. If not authenticated -> API returns details so frontend redirects to registration

### Configuration

```ruby
Rhino.configure do |c|
  c.invitations = {
    expires_days: ENV.fetch('INVITATION_EXPIRES_DAYS', 7).to_i,
    allowed_roles: nil,  # nil = all, or ['admin', 'manager']
  }
end
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:organization/invitations` | List invitations (supports `?status=pending\|expired\|all`) |
| `POST` | `/api/:organization/invitations` | Create invitation |
| `POST` | `/api/:organization/invitations/:id/resend` | Resend email, refresh expiration |
| `DELETE` | `/api/:organization/invitations/:id` | Cancel invitation |
| `POST` | `/api/invitations/accept` | Accept via token (public endpoint) |

### Create Invitation Request

```json
{
  "email": "newuser@example.com",
  "role_id": 2
}
```

Checks: no duplicate pending invitation, user not already a member, role exists.

### Accept Invitation

```json
{
  "token": "a1b2c3d4e5f6...64-char-hex-token"
}
```

**Not authenticated response:**
```json
{
  "invitation": { "..." },
  "requires_registration": true,
  "message": "Please register or login to accept this invitation"
}
```

**Authenticated response:**
```json
{
  "message": "Invitation accepted successfully",
  "invitation": { "..." },
  "organization": { "..." }
}
```

### OrganizationInvitation Model

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `organization_id` | integer | Target organization |
| `email` | string | Invitee email |
| `role_id` | integer | Role to assign |
| `invited_by` | integer | Inviting user ID |
| `token` | string | 64-character hex token |
| `status` | string | `pending`, `expired`, `cancelled`, `accepted` |
| `expires_at` | datetime | Expiration timestamp |
| `accepted_at` | datetime | Acceptance timestamp |

---

## 12. Request Lifecycle

Every API request flows through these layers:

```
Request -> Middleware -> Policy -> Scope -> Query -> Serialize -> Hide Columns -> Response
```

### 1. Middleware Layer

```ruby
class Post < RhinoModel
  rhino_middleware :authenticate_user!

  rhino_middleware_actions(
    create:  [:verify_email!],
    destroy: [:require_admin!],
  )
end
```

### 2. Policy Layer

Checks `ResourcePolicy` (via Pundit). Returns `403` on failure.

### 3. Scope Layer

Multi-tenancy boundary:
- Models with `organization_id` filtered directly
- Nested models use auto-detected `belongs_to` chains
- Custom scopes via `HasAutoScope`

### 4. Query Builder

Builds DB query from URL parameters: `?filter[...]`, `?sort=`, `?search=`, `?page=`, `?include=`, `?fields[...]=`

### 5. Response Serialization

Pagination metadata in headers (`X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`).

### 6. Attribute Permissions

Policy's `permitted_attributes_for_show(user)` and `hidden_attributes_for_show(user)` control column visibility.

### 7. JSON Response

Single resource: `{ "id": 1, "title": "My Post" }`
Collection: data array with pagination headers.

---

## 13. Generator Commands

| Command | Alias | Description |
|---|---|---|
| `rails rhino:install` | -- | Interactive project setup |
| `rails rhino:generate` | `rails rhino:g` | Scaffold resources (models, policies, scopes) |
| `rails rhino:blueprint` | -- | Generate from YAML blueprints |
| `rails rhino:export_postman` | -- | Generate Postman collection |
| `rails invitation:link` | -- | Generate invitation link for testing |

### rhino:install

```bash
rails rhino:install
```

Interactive setup wizard that walks through:

1. **Core Setup** — creates `config/initializers/rhino.rb` and route configuration
2. **Feature Selection** — multi-tenant support, audit trail
3. **Multi-Tenant Options** (if enabled):
   - Resolution strategy: route prefix (`:organization`) or subdomain
   - Organization identifier column: `id`, `slug`, or `uuid`
   - Default roles: creates admin, editor, viewer roles with seeders
4. **Migrations** — creates organizations, roles, user_roles, audit_logs tables
5. **Seeds** — optionally seeds roles and organizations

After installation:
```bash
rails db:migrate
rails db:seed    # optional — seeds default roles and organization
```

### rhino:generate

```bash
rails rhino:generate
# or
rails rhino:g
```

Interactive prompts:
1. **Resource type** — Model, Policy, or Scope
2. **Resource name** — PascalCase singular (e.g., `Post`, `BlogPost`)
3. **Organization ownership** — If multi-tenancy enabled, asks if model belongs to org
4. **Columns** — Name, type, nullable, unique, index, default value
5. **Additional options** — Soft deletes, policy generation, audit trail

Interactively creates models (with migration + factory), policies, and scopes.

**Generated Model:**

```ruby
class BlogPost < Rhino::RhinoModel
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :user_id, numericality: { only_integer: true }, allow_nil: true

  rhino_filters  :status, :user_id
  rhino_sorts    :created_at, :title
  rhino_default_sort '-created_at'
  rhino_includes :user
  rhino_search   :title, :content

  belongs_to :user
end
```

**Generated Migration:**

```ruby
class CreateBlogPosts < ActiveRecord::Migration[8.0]
  def change
    create_table :blog_posts do |t|
      t.string :title, null: false
      t.text :content, null: false
      t.string :status, default: 'draft'
      t.references :user, null: false, foreign_key: true
      t.datetime :published_at
      t.datetime :discarded_at
      t.timestamps
    end
    add_index :blog_posts, :discarded_at
  end
end
```

**Generated Factory:**

```ruby
FactoryBot.define do
  factory :blog_post do
    title { Faker::Lorem.sentence }
    content { Faker::Lorem.paragraphs(number: 3).join("\n\n") }
    status { %w[draft published].sample }
    association :user
    published_at { [nil, Faker::Time.backward(days: 30)].sample }
  end
end
```

**Generated Policy:**

```ruby
class BlogPostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'blog-posts'
end
```

**Generated Scope:**

```ruby
module Scopes
  class BlogPostScope < Rhino::ResourceScope
    # Available methods: user, organization, role
    def apply(relation)
      relation
    end
  end
end
```

Auto-registers model in `config/initializers/rhino.rb`.

### Supported Column Types

| Type | Migration | Factory |
|---|---|---|
| `string` | `t.string :name` | `Faker::Lorem.sentence` |
| `text` | `t.text :body` | `Faker::Lorem.paragraphs(number: 3).join` |
| `integer` | `t.integer :count` | `Faker::Number.between(from: 0, to: 100)` |
| `boolean` | `t.boolean :active` | `Faker::Boolean.boolean` |
| `date` | `t.date :published_at` | `Faker::Date.backward(days: 30)` |
| `datetime` | `t.datetime :starts_at` | `Faker::Time.backward(days: 30)` |
| `decimal` | `t.decimal :price, precision: 10, scale: 2` | `Faker::Commerce.price` |
| `uuid` | `t.uuid :external_id` | `SecureRandom.uuid` |
| `references` | `t.references :user, foreign_key: true` | `association :user` |

### rhino:export_postman

Generates Postman Collection v2.1 with all CRUD endpoints, soft delete endpoints, auth endpoints, invitation endpoints, nested operations, and example request bodies.

### invitation:link

```bash
rails invitation:link user@example.com acme-corp --role=editor --create
```

---

## 14. Blueprint (YAML Code Generation)

Instead of using the interactive `rails rhino:generate` command, you can define your entire data model in YAML files and generate all artifacts at once.

### Directory Structure

```
.rhino/blueprints/
├── _roles.yaml          # Role definitions (required for permissions)
├── posts.yaml           # One file per model
├── comments.yaml
└── categories.yaml
```

Files prefixed with `_` or `.` are excluded from model discovery.

### Roles File (`_roles.yaml`)

```yaml
roles:
  owner:
    name: Owner
    description: "Full access to all resources"
  admin:
    name: Admin
    description: "Operational administrator"
  editor:
    name: Editor
    description: "Can create and edit content"
  viewer:
    name: Viewer
    description: "Read-only access"
```

- At least one role must be defined
- Slug must match `/^[a-z][a-z0-9_]*$/` (lowercase with underscores)

### Model Blueprint YAML

```yaml
model: Post                          # REQUIRED — PascalCase
slug: posts                          # Optional — auto-derived as snake_case plural
table: posts                         # Optional — defaults to slug

options:
  belongs_to_organization: true      # Default: false — adds BelongsToOrganization concern
  soft_deletes: true                 # Default: true — adds Discard::Model + discarded_at
  audit_trail: true                  # Default: false — adds HasAuditTrail concern
  owner: null                        # Default: null
  except_actions: []                 # Default: [] — actions to exclude from routes
  pagination: true                   # Default: false — enables rhino_pagination_enabled
  per_page: 25                       # Default: 25

columns:
  # Short syntax:
  title: string

  # Full syntax:
  total_value:
    type: decimal                    # REQUIRED
    nullable: true                   # Default: false
    unique: false                    # Default: false
    index: false                     # Default: false
    default: null                    # Default: null
    filterable: true                 # Default: false — adds to rhino_filters
    sortable: true                   # Default: false — adds to rhino_sorts
    searchable: false                # Default: false — adds to rhino_search
    precision: 10                    # For decimal only
    scale: 2                         # For decimal only

  author_id:
    type: foreignId
    foreign_model: User              # Required for foreignId — creates belongs_to + rhino_includes

relationships:                       # Optional explicit relationships
  - type: belongsTo
    model: User
    foreign_key: author_id
  - type: hasMany
    model: Comment

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"                 # "*" = all fields, or array of field names
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  editor:
    actions: [index, show, store, update]
    show_fields: "*"
    create_fields: [title, content, status]
    update_fields: [title, content, status]
    hidden_fields: [total_value]
  viewer:
    actions: [index, show]
    show_fields: [id, title, status, created_at]
    create_fields: []
    update_fields: []
    hidden_fields: [total_value]
```

**Valid column types:** `string`, `text`, `integer`, `bigInteger`, `boolean`, `date`, `datetime`, `timestamp`, `decimal`, `float`, `json`, `uuid`, `foreignId`

**Valid actions:** `index`, `show`, `store`, `update`, `destroy`, `trashed`, `restore`, `forceDelete`

**Valid relationship types:** `belongsTo`, `hasMany`, `hasOne`, `belongsToMany`

### How to Build Blueprint Files: Discovery Interview

**IMPORTANT:** When a user asks you to create blueprint files, you MUST ask discovery questions BEFORE writing any YAML. Do NOT guess or assume. The blueprint defines the entire data model, permissions, and behavior of the API — getting it wrong means regenerating everything.

Ask the following questions in order. You may group related questions together to avoid back-and-forth, but do NOT skip any category. If the user already provided some information (e.g., in a product spec or description), acknowledge what you understood and only ask about what's missing.

---

#### Question 1: What does the application do?

Ask the user to describe the product in 2-3 sentences. This gives you context to make smart defaults for everything that follows.

> "Describe your application in a few sentences. What problem does it solve? Who are the users?"

**Why this matters:** A contract management app has very different models, roles, and permissions than an e-commerce platform. This context drives every decision below.

---

#### Question 2: Is this a multi-tenant application?

> "Will this app serve multiple organizations/companies, each with their own isolated data? (multi-tenant) Or is it a single-tenant app where all users share the same data?"

**Why this matters:** This determines whether models get `belongs_to_organization: true` and whether you need a `tenant` route group. Most B2B SaaS apps are multi-tenant. Most internal tools are single-tenant.

**Follow-up if multi-tenant:**
> "How should organizations be identified in the URL — by slug (e.g., `/api/acme-corp/posts`) or by ID (e.g., `/api/1/posts`)?"

---

#### Question 3: What are the user roles?

> "List all the roles in your system. For each role, describe what they should be able to do in plain language. Example:
> - **Owner**: Full access to everything, can manage billing and invite users
> - **Admin**: Can manage all resources but cannot delete the organization
> - **Editor**: Can create and edit content but cannot delete or manage users
> - **Viewer**: Read-only access to all resources"

**Why this matters:** This creates the `_roles.yaml` file and drives the entire permissions block of every model blueprint. Be specific — the difference between "can edit" and "can edit their own" matters.

**Follow-up questions if unclear:**
> "Can [role] delete records, or only soft-delete (move to trash)?"
> "Can [role] see all fields, or should some fields (like financials, internal notes) be hidden?"
> "Can [role] create new records, or only edit existing ones?"

---

#### Question 4: What are the main entities/models?

> "List all the main entities (database tables) in your system. For each one, describe:
> 1. What it represents
> 2. What fields/columns it has (name, type, whether it's optional)
> 3. How it relates to other entities (belongs to, has many, etc.)
>
> Example:
> - **Project**: name (string), description (text, optional), status (string: active/archived), budget (decimal, optional). Belongs to organization. Has many tasks.
> - **Task**: title (string), description (text), status (string: todo/in_progress/done), priority (string: low/medium/high), due_date (date, optional). Belongs to project and assignee (user)."

**Why this matters:** This is the core of every model blueprint — the `columns` and `relationships` sections. Missing a column here means regenerating later.

**Follow-up for each model:**
> "Does [model] belong to an organization directly, or through a parent? (e.g., Task belongs to Project which belongs to Organization)"
> "Should [model] support soft deletes (trash and restore)?"
> "Do you need an audit trail (change history) for [model]?"
> "Are there any CRUD actions that should NOT exist for [model]? (e.g., users should not be able to delete invoices)"

---

#### Question 5: What are the permission rules per role per model?

> "For each role and each model, tell me:
> 1. **Which actions** can they perform? (list, view, create, edit, delete, view trash, restore, permanently delete)
> 2. **Which fields can they write** when creating? (all, specific list, or none)
> 3. **Which fields can they write** when editing? (all, specific list, or none — often different from create)
> 4. **Which fields should be hidden** from their view? (e.g., hide financial data from viewers)
>
> Example for a Task model:
> - **Owner**: All actions, all fields readable and writable
> - **Manager**: Can list, view, create, edit, delete. Can create/edit: title, description, status, priority, due_date, assignee. Cannot see: internal_cost
> - **Member**: Can list, view, and edit. Can only edit: status, description. Cannot see: internal_cost"

**Why this matters:** This maps directly to the `permissions` block of each blueprint. The distinction between `create_fields` and `update_fields` is critical — for example, a user might be able to set the `project_id` when creating a task but should NOT be able to move it to a different project when editing.

---

#### Question 6: What should be filterable, sortable, and searchable?

> "For each model, think about how users will browse and find records:
> 1. **Filter by**: Which fields do users need to filter on? (e.g., filter tasks by status, by assignee, by project)
> 2. **Sort by**: Which fields do users need to sort on? (e.g., sort by created date, due date, priority)
> 3. **Search across**: Which text fields should full-text search cover? (e.g., search tasks by title and description)
>
> If you're unsure, a good default is:
> - Status/type fields → filterable
> - Foreign keys → filterable
> - Date fields → sortable
> - Name/title fields → sortable + searchable
> - Description/content fields → searchable"

**Why this matters:** These map to `filterable: true`, `sortable: true`, and `searchable: true` on columns. If you don't set them, the frontend cannot filter/sort/search on those fields.

---

#### Question 7: Are there any public (unauthenticated) endpoints?

> "Should any models be accessible without login? (e.g., a public product catalog, public blog posts, public categories)"

**Why this matters:** Public models need a separate `public` route group and their policies must handle `nil` users. This affects route group configuration, not the blueprint files directly, but it's important to know upfront.

---

#### Question 8: Do you need pagination? What page sizes?

> "Should list endpoints return paginated results by default? If so, what's the default page size? (Common: 15, 20, 25, 50)"

**Why this matters:** Maps to `pagination: true` and `per_page: N` in the options block. If not specified, Rhino returns all records.

---

### After Discovery: Build the Blueprints

Once you have answers to all questions above, build the YAML files following this order:

**Step 1: Create `_roles.yaml`** from the roles in Question 3.

**Step 2: Create one YAML file per model** from Questions 4-6:
- `model` and `slug` from the entity name
- `options` from Question 2 (multi-tenancy), Question 4 follow-ups (soft deletes, audit trail, except_actions), Question 8 (pagination)
- `columns` from Question 4 entity descriptions, with `filterable`/`sortable`/`searchable` from Question 6
- `relationships` from Question 4 relationship descriptions
- `permissions` from Question 5 per-role rules

**Step 3: Review and validate.** Before generating, review each file:
- Every `foreignId` column has a `foreign_model`
- Every role referenced in `permissions` exists in `_roles.yaml`
- Fields referenced in `show_fields`, `create_fields`, `update_fields`, `hidden_fields` exist in `columns`
- Actions in `except_actions` are not also listed in any role's `actions`

**Step 4: Generate.**
```bash
rails rhino:blueprint --dry-run   # Preview first
rails rhino:blueprint             # Generate all files
```

### Complete Real-World Example: Project Management App

**Requirements:** A multi-tenant project management app with owners (full access), managers (manage projects and tasks), and members (view and update assigned tasks).

**Step 1 — `_roles.yaml`:**

```yaml
roles:
  owner:
    name: Owner
    description: "Full access to everything"
  manager:
    name: Manager
    description: "Manages projects and tasks"
  member:
    name: Member
    description: "Works on assigned tasks"
```

**Step 2 — `projects.yaml`:**

```yaml
model: Project
slug: projects

options:
  belongs_to_organization: true
  soft_deletes: true
  audit_trail: true
  pagination: true
  per_page: 20

columns:
  name:
    type: string
    filterable: true
    sortable: true
    searchable: true
  description: text
  status:
    type: string
    default: active
    filterable: true
    sortable: true
  budget:
    type: decimal
    nullable: true
    precision: 12
    scale: 2
    sortable: true
  due_date:
    type: date
    nullable: true
    sortable: true
  owner_id:
    type: foreignId
    foreign_model: User

relationships:
  - type: hasMany
    model: Task

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  manager:
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: [name, description, status, budget, due_date, owner_id]
    update_fields: [name, description, status, budget, due_date]
    hidden_fields: []
  member:
    actions: [index, show]
    show_fields: [id, name, description, status, due_date]
    create_fields: []
    update_fields: []
    hidden_fields: [budget]
```

**Step 3 — `tasks.yaml`:**

```yaml
model: Task
slug: tasks

options:
  belongs_to_organization: true
  soft_deletes: true
  audit_trail: true
  pagination: true

columns:
  title:
    type: string
    filterable: true
    sortable: true
    searchable: true
  description: text
  status:
    type: string
    default: todo
    filterable: true
    sortable: true
  priority:
    type: string
    default: medium
    filterable: true
    sortable: true
  due_date:
    type: date
    nullable: true
    sortable: true
  project_id:
    type: foreignId
    foreign_model: Project
  assignee_id:
    type: foreignId
    foreign_model: User
    nullable: true

relationships:
  - type: hasMany
    model: Comment

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  manager:
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: [title, description, status, priority, due_date, project_id, assignee_id]
    update_fields: [title, description, status, priority, due_date, assignee_id]
    hidden_fields: []
  member:
    actions: [index, show, update]
    show_fields: "*"
    create_fields: []
    update_fields: [status, description]
    hidden_fields: []
```

**Step 4 — Run the command:**

```bash
rails rhino:blueprint
```

This generates all models, migrations, factories, policies, tests, and seeders from the three YAML files above. The policies will have role-based `permitted_attributes_for_show`, `permitted_attributes_for_create`, `permitted_attributes_for_update`, and `hidden_attributes_for_show` methods auto-generated from the permissions block.

### Command

```bash
rails rhino:blueprint
```

| Flag | Description |
|------|-------------|
| `--dir=PATH` | Blueprint directory (default: `.rhino/blueprints`) |
| `--model=SLUG` | Generate only this model |
| `--force` | Regenerate even if unchanged |
| `--dry-run` | Preview without writing files |
| `--skip-tests` | Skip test generation |
| `--skip-seeders` | Skip seeder generation |

### Generated Files

For each model blueprint, the command generates:

| Artifact | Path |
|----------|------|
| Model | `app/models/{underscored_name}.rb` |
| Migration | `db/migrate/{ts}_create_{table}.rb` |
| Factory | `spec/factories/{underscored_plurals}.rb` |
| Scope | `app/models/model_scopes/{underscored_name}_scope.rb` |
| Policy | `app/policies/{underscored_name}_policy.rb` |
| Tests | `spec/models/{underscored_name}_spec.rb` |
| Config registration | `config/initializers/rhino.rb` (auto-updated) |

Cross-model seeders (generated once from all blueprints):

| Scenario | Path |
|----------|------|
| Multi-tenant | `db/seeds/role_seeder.rb` + `user_role_seeder.rb` |
| Non-tenant | `db/seeds/user_permission_seeder.rb` |

### Manifest Tracking

The command stores a `.blueprint-manifest.json` in the blueprints directory that tracks SHA-256 hashes of each YAML file. On subsequent runs, only changed blueprints are regenerated. Use `--force` to bypass this check.

### Generated Policy Example

The PolicyGenerator creates role-based attribute permission methods:

```ruby
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def permitted_attributes_for_show(user)
    role = user&.role_slug_for_validation(@organization)
    return ['*'] if %w[owner editor].include?(role)
    return %w[id title status created_at] if role == 'viewer'
    []
  end

  def hidden_attributes_for_show(user)
    role = user&.role_slug_for_validation(@organization)
    return %w[total_value] if %w[editor viewer].include?(role)
    []
  end

  def permitted_attributes_for_create(user)
    role = user&.role_slug_for_validation(@organization)
    return ['*'] if role == 'owner'
    return %w[title content status] if role == 'editor'
    []
  end

  def permitted_attributes_for_update(user)
    role = user&.role_slug_for_validation(@organization)
    return ['*'] if role == 'owner'
    return %w[title content status] if role == 'editor'
    []
  end
end
```

Roles with identical field sets are grouped into a single `if`-branch.

### Generated Tests Example

The TestGenerator produces three categories of RSpec tests:

1. **CRUD access** — allowed endpoints return 200/201, blocked return 403
2. **Field visibility** — permitted fields are present, hidden fields are absent
3. **Forbidden fields** — restricted roles get 403 when submitting fields they can't write

---

## 15. Public Route Groups

### CRITICAL: Update the Policy

When making a model public, the policy MUST handle `nil` users:

```ruby
# config/initializers/rhino.rb
Rhino.configure do |config|
  config.model :posts, 'Post'

  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all
  config.route_group :public, prefix: 'public', middleware: [], models: [:posts]
end
```

```ruby
# app/policies/post_policy.rb
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  # MUST handle nil user for public endpoints
  def index?
    true  # Anyone can list posts
  end

  def show?
    true  # Anyone can view a post
  end

  def create?
    return false unless user  # Only authenticated users can create
    super
  end

  def update?
    return false unless user
    super
  end

  def destroy?
    return false unless user
    super
  end

  def permitted_attributes_for_show(user)
    if user.nil?
      ['id', 'title', 'excerpt', 'status', 'published_at']
    elsif has_role?(user, 'admin')
      ['*']
    else
      ['id', 'title', 'content', 'excerpt', 'status', 'published_at']
    end
  end

  def hidden_attributes_for_show(user)
    if user.nil?
      ['internal_notes', 'cost_price', 'user_id']
    else
      []
    end
  end
end
```

Without handling `nil` users, public endpoints will crash or return 500 errors.

---

## 16. Hybrid Multi-Tenant Architecture

A logistics platform with four user types:

```ruby
Rhino.configure do |config|
  config.model :trips, 'Trip'
  config.model :construction_sites, 'ConstructionSite'
  config.model :trucks, 'Truck'
  config.model :materials, 'Material'
  config.model :organizations, 'Organization'

  # Customer dashboard -- org-scoped, full CRUD
  config.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  # Driver app -- authenticated, not org-scoped
  config.route_group :driver, prefix: 'driver', middleware: [], models: [:trips, :construction_sites, :trucks]

  # Admin panel -- authenticated, global access
  config.route_group :admin, prefix: 'admin', middleware: [], models: :all

  # Public API -- no auth, read-only reference data
  config.route_group :public, prefix: 'public', middleware: [], models: [:materials]

  config.multi_tenant = { organization_identifier_column: 'slug' }
end
```

| Group | Example Route | Auth | Org Scoped |
|---|---|---|---|
| tenant | `GET /api/acme-corp/trips` | Yes | Yes |
| driver | `GET /api/driver/trips` | Yes | No |
| admin | `GET /api/admin/trips` | Yes | No |
| public | `GET /api/public/materials` | No | No |

### Permission Setup

```ruby
# Tenant: org-scoped permissions via roles
admin_role = Role.create!(name: 'Admin', slug: 'admin', permissions: ['*'])
UserRole.create!(user: user, organization: org, role: admin_role)

# Non-tenant: user-level permissions
driver.update!(permissions: ['trips.index', 'trips.show', 'trucks.*'])
platform_admin.update!(permissions: ['*'])
```

### Request Flow

**Customer:** `GET /api/acme-corp/trips`
1. Auth middleware -> ResolveOrganizationFromRoute -> org set
2. Policy checks `roles.permissions` via `user_roles`
3. Scope filters by organization_id
4. Returns only Acme Corp's trips

**Driver:** `GET /api/driver/trips`
1. Auth middleware -> no org middleware
2. Policy checks `users.permissions` directly
3. `DriverScopable` filters by `driver_id`
4. Returns only driver's trips

**Admin:** `GET /api/admin/trips`
1. Auth middleware -> no org middleware
2. Policy checks `users.permissions` (has `*`)
3. No scoping
4. Returns ALL trips

---

## 17. Nested Filtering & Including

### Filtering on Relationship Fields

You can only filter on fields declared in `rhino_filters`. For relationship-based filtering, use the foreign key:

```ruby
class Comment < Rhino::RhinoModel
  rhino_filters :post_id, :user_id, :status
end
```

```bash
GET /api/comments?filter[post_id]=42
GET /api/comments?filter[user_id]=5&filter[status]=approved
```

### Nested Includes

Load relationships of relationships:

```bash
GET /api/posts?include=comments.user
```

This loads posts with their comments, and each comment with its user. Requires:

```ruby
class Post < Rhino::RhinoModel
  rhino_includes :comments
  has_many :comments
end

class Comment < Rhino::RhinoModel
  rhino_includes :user
  belongs_to :user
end
```

Rhino checks permissions on each included resource. `?include=comments.user` verifies `comments.index` AND `users.index`.

### Search Across Relationships

```ruby
rhino_search :title, :content, 'user.name', 'category.name'
```

```bash
GET /api/posts?search=john
```

Searches across `posts.title`, `posts.content`, `users.name`, and `categories.name` using `left_outer_joins`.

---

## 18. Security: Organization ID Protection

### CRITICAL: Never Trust Client-Sent `organization_id`

Rhino automatically sets `organization_id` when creating records in a tenant context. You should NEVER include `organization_id` in `permitted_attributes_for_create`:

```ruby
# WRONG -- security vulnerability
def permitted_attributes_for_create(user)
  ['title', 'content', 'organization_id']  # NEVER allow this
end

# CORRECT -- Rhino sets organization_id automatically
def permitted_attributes_for_create(user)
  ['title', 'content']
end
```

If a client sends `organization_id` in the request body, it should be ignored or rejected. Rhino handles organization assignment through the middleware pipeline, ensuring records are always created in the correct organization.

### Why This Matters

If `organization_id` is writable by clients, a user in Organization A could create records in Organization B by sending `"organization_id": 2`. This is a critical multi-tenancy breach.

### The Same Applies to `user_id` in Many Cases

If you want to track which user created a record, set it in the controller or model callback, not through client input:

```ruby
class Post < Rhino::RhinoModel
  include Rhino::BelongsToOrganization

  before_create do
    self.user_id ||= RequestStore.store[:current_user]&.id
  end
end
```

---

## 19. Testing with RSpec

### CRITICAL: Every Code Change MUST Include Tests

Every model, policy, scope, and feature MUST have corresponding RSpec tests. No exceptions.

### Test Setup

```ruby
# Gemfile
group :test do
  gem 'rspec-rails'
  gem 'factory_bot_rails'
  gem 'faker'
end
```

```bash
rails generate rspec:install
```

### Helper Methods

Rhino provides `auth_headers(user)` and `json_response` helpers for request specs.

### Complete Test Example

```ruby
# spec/requests/posts_spec.rb
require 'rails_helper'

RSpec.describe 'Posts API', type: :request do
  let(:organization) { create(:organization) }
  let(:user) { create(:user) }
  let(:admin_role) { create(:role, permissions: ['*']) }
  let!(:user_role) { create(:user_role, user: user, organization: organization, role: admin_role) }
  let(:headers) { auth_headers(user) }

  describe 'GET /api/:organization/posts' do
    it 'lists posts for the organization' do
      create_list(:post, 3, organization: organization)
      get "/api/#{organization.slug}/posts", headers: headers
      expect(response).to have_http_status(:ok)
      expect(json_response.length).to eq(3)
    end

    it 'does not return posts from another organization' do
      other_org = create(:organization)
      create_list(:post, 3, organization: other_org)
      get "/api/#{organization.slug}/posts", headers: headers
      expect(json_response.length).to eq(0)
    end

    it 'filters posts by status' do
      create(:post, organization: organization, status: 'published')
      create(:post, organization: organization, status: 'draft')
      get "/api/#{organization.slug}/posts?filter[status]=published", headers: headers
      expect(json_response.length).to eq(1)
    end

    it 'sorts posts by title ascending' do
      create(:post, organization: organization, title: 'Zebra')
      create(:post, organization: organization, title: 'Apple')
      get "/api/#{organization.slug}/posts?sort=title", headers: headers
      expect(json_response.first['title']).to eq('Apple')
    end

    it 'searches posts by title' do
      create(:post, organization: organization, title: 'Rails Guide')
      create(:post, organization: organization, title: 'Python Tutorial')
      get "/api/#{organization.slug}/posts?search=rails", headers: headers
      expect(json_response.length).to eq(1)
      expect(json_response.first['title']).to eq('Rails Guide')
    end

    it 'paginates results' do
      create_list(:post, 30, organization: organization)
      get "/api/#{organization.slug}/posts?page=1&per_page=10", headers: headers
      expect(json_response.length).to eq(10)
      expect(response.headers['X-Total']).to eq('30')
      expect(response.headers['X-Current-Page']).to eq('1')
    end

    it 'includes related user' do
      create(:post, organization: organization, user: user)
      get "/api/#{organization.slug}/posts?include=user", headers: headers
      expect(json_response.first['user']).to be_present
      expect(json_response.first['user']['id']).to eq(user.id)
    end
  end

  describe 'GET /api/:organization/posts/:id' do
    it 'returns a single post' do
      post_record = create(:post, organization: organization)
      get "/api/#{organization.slug}/posts/#{post_record.id}", headers: headers
      expect(response).to have_http_status(:ok)
      expect(json_response['id']).to eq(post_record.id)
    end

    it 'returns 404 for post in another organization' do
      other_org = create(:organization)
      other_post = create(:post, organization: other_org)
      get "/api/#{organization.slug}/posts/#{other_post.id}", headers: headers
      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'POST /api/:organization/posts' do
    it 'creates a post with valid data' do
      post "/api/#{organization.slug}/posts",
        params: { title: 'Test', content: 'Content', status: 'draft' }.to_json,
        headers: headers
      expect(response).to have_http_status(:created)
      expect(Post.count).to eq(1)
      expect(Post.first.organization_id).to eq(organization.id)
    end

    it 'returns 422 for invalid data' do
      post "/api/#{organization.slug}/posts",
        params: { status: 'invalid' }.to_json,
        headers: headers
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'returns 403 when user lacks permission' do
      viewer_role = create(:role, permissions: ['posts.index', 'posts.show'])
      user_role.update(role: viewer_role)
      post "/api/#{organization.slug}/posts",
        params: { title: 'Test' }.to_json,
        headers: headers
      expect(response).to have_http_status(:forbidden)
    end

    it 'returns 403 when user submits forbidden fields' do
      editor_role = create(:role, permissions: ['posts.index', 'posts.show', 'posts.store', 'posts.update'])
      user_role.update(role: editor_role)
      # Assuming policy restricts editors from setting 'is_featured'
      post "/api/#{organization.slug}/posts",
        params: { title: 'Test', is_featured: true }.to_json,
        headers: headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe 'PUT /api/:organization/posts/:id' do
    let!(:post_record) { create(:post, organization: organization, title: 'Original') }

    it 'updates a post with valid data' do
      put "/api/#{organization.slug}/posts/#{post_record.id}",
        params: { title: 'Updated' }.to_json,
        headers: headers
      expect(response).to have_http_status(:ok)
      expect(post_record.reload.title).to eq('Updated')
    end

    it 'allows partial updates' do
      put "/api/#{organization.slug}/posts/#{post_record.id}",
        params: { title: 'New Title' }.to_json,
        headers: headers
      expect(response).to have_http_status(:ok)
      expect(post_record.reload.content).not_to be_nil  # unchanged
    end
  end

  describe 'DELETE /api/:organization/posts/:id' do
    it 'soft deletes a post' do
      post_record = create(:post, organization: organization)
      delete "/api/#{organization.slug}/posts/#{post_record.id}", headers: headers
      expect(post_record.reload.discarded_at).not_to be_nil
    end

    it 'excludes soft-deleted posts from listing' do
      post_record = create(:post, organization: organization)
      post_record.discard
      get "/api/#{organization.slug}/posts", headers: headers
      expect(json_response.length).to eq(0)
    end
  end

  describe 'GET /api/:organization/posts/trashed' do
    it 'lists only trashed posts' do
      active_post = create(:post, organization: organization)
      trashed_post = create(:post, organization: organization)
      trashed_post.discard
      get "/api/#{organization.slug}/posts/trashed", headers: headers
      expect(json_response.length).to eq(1)
      expect(json_response.first['id']).to eq(trashed_post.id)
    end
  end

  describe 'POST /api/:organization/posts/:id/restore' do
    it 'restores a soft-deleted post' do
      post_record = create(:post, organization: organization)
      post_record.discard
      post "/api/#{organization.slug}/posts/#{post_record.id}/restore", headers: headers
      expect(post_record.reload.discarded_at).to be_nil
    end
  end

  describe 'Audit Trail' do
    it 'creates audit log on post creation' do
      post "/api/#{organization.slug}/posts",
        params: { title: 'Audited Post', status: 'draft' }.to_json,
        headers: headers
      expect(AuditLog.count).to eq(1)
      expect(AuditLog.first.action).to eq('created')
    end

    it 'creates audit log on post update' do
      post_record = create(:post, organization: organization, title: 'Before')
      put "/api/#{organization.slug}/posts/#{post_record.id}",
        params: { title: 'After' }.to_json,
        headers: headers
      audit = AuditLog.find_by(action: 'updated')
      expect(audit).to be_present
      expect(audit.old_values['title']).to eq('Before')
      expect(audit.new_values['title']).to eq('After')
    end

    it 'creates audit log on soft delete' do
      post_record = create(:post, organization: organization)
      delete "/api/#{organization.slug}/posts/#{post_record.id}", headers: headers
      expect(AuditLog.find_by(action: 'deleted')).to be_present
    end
  end

  describe 'Field Visibility' do
    it 'hides fields for non-admin users' do
      viewer_role = create(:role, permissions: ['posts.index', 'posts.show'])
      user_role.update(role: viewer_role)
      post_record = create(:post, organization: organization)
      get "/api/#{organization.slug}/posts/#{post_record.id}", headers: headers
      # Assuming policy hides 'internal_notes' from non-admins
      expect(json_response).not_to have_key('internal_notes')
    end
  end
end
```

### Factory Example

```ruby
# spec/factories/posts.rb
FactoryBot.define do
  factory :post do
    title { Faker::Lorem.sentence }
    content { Faker::Lorem.paragraphs(number: 3).join("\n\n") }
    status { %w[draft published archived].sample }
    association :organization
    association :user
  end
end

# spec/factories/organizations.rb
FactoryBot.define do
  factory :organization do
    name { Faker::Company.name }
    slug { Faker::Internet.slug }
  end
end

# spec/factories/roles.rb
FactoryBot.define do
  factory :role do
    name { 'Admin' }
    slug { 'admin' }
    permissions { ['*'] }
  end
end

# spec/factories/user_roles.rb
FactoryBot.define do
  factory :user_role do
    association :user
    association :organization
    association :role
  end
end

# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    name { Faker::Name.name }
    email { Faker::Internet.unique.email }
    password { 'password123' }
  end
end
```

### Testing Patterns

**Test Organization Isolation:**

```ruby
it 'does not return records from another organization' do
  other_org = create(:organization)
  create(:post, organization: other_org)
  get "/api/#{organization.slug}/posts", headers: headers
  expect(json_response.length).to eq(0)
end
```

**Test Permission Denial:**

```ruby
it 'returns 403 for unauthorized action' do
  viewer_role = create(:role, permissions: ['posts.index', 'posts.show'])
  user_role.update(role: viewer_role)
  post "/api/#{organization.slug}/posts",
    params: { title: 'Test' }.to_json,
    headers: headers
  expect(response).to have_http_status(:forbidden)
end
```

**Test Validation Errors:**

```ruby
it 'returns 422 with field-level errors' do
  post "/api/#{organization.slug}/posts",
    params: { status: 'invalid_status' }.to_json,
    headers: headers
  expect(response).to have_http_status(:unprocessable_entity)
  expect(json_response['errors']['status']).to be_present
end
```

**Test Soft Delete:**

```ruby
it 'soft deletes and excludes from listing' do
  record = create(:post, organization: organization)
  delete "/api/#{organization.slug}/posts/#{record.id}", headers: headers
  expect(record.reload.discarded_at).not_to be_nil
  get "/api/#{organization.slug}/posts", headers: headers
  expect(json_response.length).to eq(0)
end
```

**Test Nested Operations:**

```ruby
describe 'POST /api/:organization/nested' do
  it 'creates related records atomically' do
    post "/api/#{organization.slug}/nested",
      params: {
        operations: [
          { action: 'create', model: 'posts', data: { title: 'Blog', status: 'draft' } },
          { action: 'create', model: 'comments', data: { content: 'Great!', post_id: '$0.id' } }
        ]
      }.to_json,
      headers: headers
    expect(response).to have_http_status(:ok)
    expect(Post.count).to eq(1)
    expect(Comment.count).to eq(1)
    expect(Comment.first.post_id).to eq(Post.first.id)
  end

  it 'rolls back all operations on failure' do
    post "/api/#{organization.slug}/nested",
      params: {
        operations: [
          { action: 'create', model: 'posts', data: { title: 'Blog', status: 'draft' } },
          { action: 'create', model: 'posts', data: { status: 'invalid' } }
        ]
      }.to_json,
      headers: headers
    expect(response).to have_http_status(:unprocessable_entity)
    expect(Post.count).to eq(0)
  end
end
```

**Test Invitations:**

```ruby
describe 'Invitations API' do
  describe 'POST /api/:organization/invitations' do
    it 'creates an invitation' do
      role = create(:role, permissions: ['posts.*'])
      post "/api/#{organization.slug}/invitations",
        params: { email: 'new@example.com', role_id: role.id }.to_json,
        headers: headers
      expect(response).to have_http_status(:created)
      expect(OrganizationInvitation.count).to eq(1)
      expect(OrganizationInvitation.first.status).to eq('pending')
    end
  end

  describe 'POST /api/invitations/accept' do
    it 'accepts a valid invitation' do
      invitation = create(:organization_invitation,
        organization: organization,
        email: user.email,
        status: 'pending',
        token: SecureRandom.hex(32))
      post '/api/invitations/accept',
        params: { token: invitation.token }.to_json,
        headers: headers
      expect(response).to have_http_status(:ok)
      expect(invitation.reload.status).to eq('accepted')
    end
  end
end
```

---

## 20. Q&A Reference

### Getting Started

**Q: How do I install Rhino on my Rails project?**
A: `bundle add rhino-rails -v "~> 4.0"` then `rails rhino:install`. The installer is interactive. After that, `rails db:migrate`.

**Q: How do I add a new resource/model?**
A: 1) Create model extending `RhinoModel`, 2) Register in `config/initializers/rhino.rb`, 3) `rails db:migrate`.

**Q: How do I make an endpoint public?**
A: Use a `:public` route group in config. CRITICAL: Update the policy to handle `nil` users.

**Q: What does `RhinoModel` give me out of the box?**
A: `HasRhino` (query DSL), `HasValidation`, `HidableColumns`, `HasAutoScope`. Add `HasAuditTrail`, `BelongsToOrganization`, `Discard::Model`, `HasUuid`, `HasPermissions` manually.

### Models

**Q: Why must every validation use `allow_nil: true`?**
A: Rhino validates using `Model.new(params)`. Without `allow_nil: true`, nil attributes on partial updates fail validation. This is the single most important validation pattern in Rhino Rails.

**Q: How do I hide sensitive columns?**
A: Use `rhino_additional_hidden` on the model for always-hidden. For per-user hiding, use policy's `hidden_attributes_for_show` and `permitted_attributes_for_show`.

**Q: How do I add computed/virtual attributes to API responses?**
A: Override `rhino_computed_attributes` in your model: `def rhino_computed_attributes; { 'my_attr' => my_method }; end`. These are merged BEFORE policy filtering so they respect blacklist/whitelist. Do NOT override `as_rhino_json` directly — `super.merge` bypasses policy security.

**Q: How do I exclude certain CRUD actions?**
A: `rhino_except_actions :store, :update, :destroy` makes a read-only resource.

**Q: How do I add a global scope?**
A: Create `app/models/scopes/post_scope.rb` with `Scopes::PostScope < Rhino::ResourceScope` and implement `def apply(relation)`. `HasAutoScope` (in `RhinoModel`) applies it automatically. You get access to `user`, `organization`, and `role` inside `apply` for role-based filtering.

**Q: Can I extend `ApplicationRecord` instead of `RhinoModel`?**
A: Yes. Include `Rhino::HasRhino`, `Rhino::HasValidation`, `Rhino::HidableColumns`, `Rhino::HasAutoScope` manually.

### Policies & Permissions

**Q: How do I create a basic policy?**
A: Extend `Rhino::ResourcePolicy` and set `self.resource_slug = 'posts'`. That is it. Parent handles all CRUD.

**Q: How do I set up roles?**
A: `Role.create!(name: 'Admin', slug: 'admin', permissions: ['*'])`. Assign users via `UserRole.create!(user: u, organization: org, role: role)`.

**Q: How do I restrict users to edit only their own records?**
A: Override the policy method: `def update?; return true if user.has_permission?('*'); super && record.user_id == user.id; end`

**Q: Can a user have different permissions in different organizations?**
A: Yes. `user_roles` table has `user_id`, `organization_id`, `role_id`. Same user can be admin in Org A and viewer in Org B.

**Q: What is the difference between `permitted_attributes_for_show` and `hidden_attributes_for_show`?**
A: `permitted_attributes_for_show` is a whitelist (only listed fields returned). `hidden_attributes_for_show` is a blacklist (listed fields removed). Both can be defined; whitelist first, then blacklist.

### Validation

**Q: What happens if I forget `allow_nil: true`?**
A: Partial updates break. When a user sends only `{ "title": "New" }`, other fields are `nil` on `Model.new`. Without `allow_nil: true`, those nil fields fail validation.

**Q: How do I make different roles set different fields?**
A: Define `permitted_attributes_for_create(user)` and `permitted_attributes_for_update(user)` in the policy with `has_role?` checks.

**Q: What is the difference between 403 and 422?**
A: 403 = user tried to set a forbidden field. 422 = field allowed but value failed format validation.

### Query Builder

**Q: How do I filter by multiple values?**
A: Comma-separate: `?filter[status]=draft,published` returns either draft OR published.

**Q: Why is my filter being ignored?**
A: Filters only work on fields in `rhino_filters`. Undeclared fields are silently ignored for security.

**Q: Where are pagination page numbers?**
A: Response headers: `X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`. Body is just data array. Pagination disabled by default.

**Q: Can I search across related model fields?**
A: Yes. Use dot notation: `rhino_search :title, 'user.name'`. Uses `left_outer_joins` under the hood.

**Q: How do I get a count of related records?**
A: `?include=commentsCount`. Response includes `comments_count`. Also `commentsExists` for boolean.

**Q: Can a user bypass permissions through includes?**
A: No. `?include=comments` checks `comments.index` permission. Denied if lacking.

### Multi-Tenancy

**Q: How do I enable multi-tenancy?**
A: `rails rhino:install`, select Yes for multi-tenant. Or configure manually with a `:tenant` route group.

**Q: My model does not have `organization_id`. How do I scope it?**
A: Include `BelongsToOrganization` and define `belongs_to` associations. Rhino auto-detects the ownership path.

**Q: Why 404 instead of 403 for wrong org?**
A: Prevents leaking information about which organization slugs exist.

### Soft Deletes

**Q: How do I enable soft deletes?**
A: If using `RhinoModel`, already included. Ensure migration has `discarded_at` datetime column with index. Rhino auto-detects.

**Q: How do I restrict who can permanently delete?**
A: Only give `posts.forceDelete` permission to admin roles.

**Q: Does the list endpoint include soft-deleted records?**
A: No. `GET /api/posts` excludes soft-deleted. Use `GET /api/posts/trashed` for trashed records.

### Audit Trail

**Q: How do I enable audit trail on a model?**
A: Include `Rhino::HasAuditTrail`. Ensure audit_logs migration ran.

**Q: How do I exclude sensitive fields from audit logs?**
A: `rhino_audit_exclude :password, :api_token`

**Q: Does audit trail log all fields on update?**
A: No, only changed fields.

**Q: How do I enable audit trail on all models?**
A: Publish `RhinoModel` base class and include `HasAuditTrail` there.

### Nested Operations

**Q: What happens if one operation fails?**
A: Everything rolls back via `ActiveRecord::Base.transaction`. All-or-nothing.

**Q: Can I reference fields other than `id`?**
A: Yes. `$0.slug`, `$1.name`, `$2.uuid`, etc.

**Q: Can I mix create, update, and delete?**
A: Yes. Mix freely within a single batch.

### Route Groups

**Q: What is special about `:tenant` and `:public`?**
A: `:tenant` gets invitation and nested routes. `:public` skips authentication.

**Q: How does permission checking work across route groups?**
A: `:tenant` uses `roles.permissions` via `user_roles`. All others use `users.permissions` JSON column.

### Generator

**Q: How do I scaffold a new model?**
A: `rails rhino:g`, select Model, name it, define columns. Creates model, migration, factory, auto-registers.

**Q: Does the generator auto-register in config?**
A: Yes. Adds `c.model :'slug', 'Class'` to `config/initializers/rhino.rb`.

### Security

**Q: Should I allow clients to set `organization_id`?**
A: NEVER. Rhino sets it automatically via middleware. Allowing client-set `organization_id` is a critical multi-tenancy breach.

**Q: How do I handle `user_id` assignment?**
A: Use a `before_create` callback: `self.user_id ||= RequestStore.store[:current_user]&.id`. Never accept `user_id` from client input unless intentional.

### Testing

**Q: What test framework should I use?**
A: RSpec (default). With FactoryBot and Faker.

**Q: How do I test organization isolation?**
A: Create records in another org, query from your org, assert they are not returned.

**Q: How do I test permissions?**
A: Create a restricted role, assign it, attempt the action, assert 403.

**Q: Must every change include tests?**
A: YES. Every code change MUST include tests. No exceptions.

---

## Complete Project Setup Example

```bash
# 1. Create Rails API app
rails new my-saas --api

# 2. Add Rhino
cd my-saas
bundle add rhino-rails -v "~> 4.0"

# 3. Run interactive installer
rails rhino:install
# -> Multi-tenancy: Yes
# -> Audit trail: Yes
# -> Organization identifier: slug
# -> Run migrations: Yes
# -> Seed database: Yes

# 4. Generate models
rails rhino:g  # -> Model: Post (title:string, content:text, status:string, user_id:references)
rails rhino:g  # -> Model: Comment (content:text, post_id:references, user_id:references)

# 5. Generate policies
rails rhino:g  # -> Policy: Post
rails rhino:g  # -> Policy: Comment

# 6. Run migrations
rails db:migrate

# 7. Configure models
```

```ruby
# app/models/post.rb
class Post < RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model

  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :content, length: { maximum: 50_000 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true

  rhino_filters   :status, :user_id
  rhino_sorts     :created_at, :title, :updated_at
  rhino_default_sort '-created_at'
  rhino_includes  :user, :comments
  rhino_search    :title, :content
  rhino_fields    :id, :title, :content, :status

  rhino_pagination_enabled true
  rhino_per_page 25

  belongs_to :user
  has_many :comments, dependent: :destroy
end
```

```ruby
# app/models/comment.rb
class Comment < RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model

  validates :content, length: { maximum: 5_000 }, allow_nil: true

  rhino_filters  :post_id, :user_id
  rhino_sorts    :created_at
  rhino_default_sort '-created_at'
  rhino_includes :post, :user
  rhino_search   :content

  belongs_to :post
  belongs_to :user
end
```

```ruby
# app/policies/post_policy.rb
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def permitted_attributes_for_create(user)
    if has_role?(user, 'admin')
      ['*']
    elsif has_role?(user, 'editor')
      ['title', 'content', 'status']
    else
      ['title', 'content']
    end
  end

  def permitted_attributes_for_update(user)
    if has_role?(user, 'admin')
      ['*']
    elsif has_role?(user, 'editor')
      ['title', 'content', 'status']
    else
      ['title', 'content']
    end
  end

  def hidden_attributes_for_show(user)
    if user.nil? || !has_role?(user, 'admin')
      ['internal_notes']
    else
      []
    end
  end
end
```

```ruby
# app/policies/comment_policy.rb
class CommentPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'comments'

  def update?
    return true if user.has_permission?('*')
    super && record.user_id == user.id
  end

  def destroy?
    return true if user.has_permission?('*')
    super && record.user_id == user.id
  end

  def permitted_attributes_for_create(user)
    ['content', 'post_id']
  end

  def permitted_attributes_for_update(user)
    ['content']
  end
end
```

```ruby
# config/initializers/rhino.rb
Rhino.configure do |c|
  c.model :posts, 'Post'
  c.model :comments, 'Comment'

  c.route_group :tenant, prefix: ':organization', middleware: [ResolveOrganizationFromRoute], models: :all

  c.multi_tenant = { organization_identifier_column: 'slug' }

  c.invitations = {
    expires_days: 7,
    allowed_roles: nil,
  }

  c.nested = {
    path: 'nested',
    max_operations: 50,
    allowed_models: nil,
  }
end
```

```ruby
# db/seeds.rb
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

```bash
# 8. Seed the database
rails db:seed

# 9. Start the server
rails server
```

Your API is now live with full CRUD, validation, authorization, multi-tenancy, audit trail, soft deletes, invitations, and nested operations.
