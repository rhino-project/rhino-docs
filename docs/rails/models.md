---
sidebar_position: 2
title: Models
---

# Models

Rhino models are standard ActiveRecord models enhanced with declarative DSL methods and concerns that control how REST API endpoints are generated and behave. By configuring these methods directly on your model, Rhino automatically builds fully-featured API endpoints with filtering, sorting, searching, pagination, validation, and authorization — all without writing controllers or routes.

## RhinoModel Base Class

The recommended way to create Rhino models is to extend `Rhino::RhinoModel` — a convenience base class that pre-includes all the core concerns you need:

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  rhino_filters :status, :user_id
  rhino_sorts :created_at, :title
  rhino_search :title, :content

  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published] }, allow_nil: true

  # Field permissions are controlled by the policy.
end
```

`Rhino::RhinoModel` extends `ApplicationRecord` and includes these concerns automatically:

| Concern | Purpose |
|---|---|
| `Rhino::HasRhino` | Query builder DSL (filters, sorts, includes, etc.) |
| `Rhino::HasValidation` | Role-based field allowlisting and validation |
| `Rhino::HidableColumns` | Dynamic column hiding from API responses |
| `Rhino::HasAutoScope` | Auto-discovery of `Scopes::{Model}Scope` classes (with `Rhino::ResourceScope` base) |

You no longer need to manually `include` these concerns on every model.

### Optional Concerns

These concerns are **not** included in `Rhino::RhinoModel` because they require additional database columns, gems, or relationships. Add them manually when needed:

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model  # Soft deletes via discard gem
  # ...
end
```

| Concern | Purpose |
|---|---|
| `Rhino::HasAuditTrail` | Automatic change logging to `audit_logs` table |
| `Rhino::HasUuid` | Auto-generated UUID on creation |
| `Rhino::BelongsToOrganization` | Multi-tenant organization scoping |
| `Rhino::HasPermissions` | Permission checking (User model only) |
| `Discard::Model` | Soft deletes via the Discard gem |

### Customizing RhinoModel

You can publish and customize the base class for your application:

```bash title="terminal"
rails rhino:install --publish-model
```

This creates `app/models/rhino_model.rb` in your project, which extends the gem's base class. Add your own concerns or configuration that should apply to all Rhino models:

```ruby title="app/models/rhino_model.rb"
class RhinoModel < Rhino::RhinoModel
  include Rhino::HasAuditTrail  # Now all models get audit trail
end
```

:::tip
You can still extend `ApplicationRecord` directly and include concerns manually if you prefer full control. `Rhino::RhinoModel` is a convenience, not a requirement.
:::

## Model Configuration DSL

Below is a complete model example demonstrating **all** available DSL methods that Rhino recognizes:

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model  # Soft deletes via discard gem

  # ── Query Builder ────────────────────────────────────────────
  rhino_filters   :status, :user_id, :category_id
  rhino_sorts     :created_at, :title, :updated_at
  rhino_default_sort '-created_at'
  rhino_fields    :id, :title, :content, :status
  rhino_includes  :user, :comments, :tags
  rhino_search    :title, :content

  # ── Pagination ───────────────────────────────────────────────
  rhino_pagination_enabled true
  rhino_per_page 25

  # ── Middleware ────────────────────────────────────────────────
  rhino_middleware 'throttle:60,1'
  rhino_middleware_actions(
    store:   ['verified'],
    destroy: ['admin']
  )

  # ── Route Exclusion ──────────────────────────────────────────
  rhino_except_actions :destroy  # skip DELETE endpoint

  # ── Relationships ────────────────────────────────────────────
  belongs_to :user
  belongs_to :blog
  has_many :comments
  has_many :tags
end
```

### DSL Reference

| DSL Method | Type | Description |
|---|---|---|
| `rhino_filters` | `*symbols` | Fields available for query-string filtering via `?filter[field]=value`. Only the fields listed here can be filtered on. |
| `rhino_sorts` | `*symbols` | Fields available for sorting via `?sort=field`. Prefix with `-` for descending order (e.g., `?sort=-created_at`). |
| `rhino_default_sort` | `string` | The sort applied when no `?sort` parameter is provided. Use the `-` prefix for descending (e.g., `'-created_at'`). |
| `rhino_fields` | `*symbols` | Fields that can be selected via sparse fieldsets (`?fields[model]=field1,field2`). Limits which columns are returned. |
| `rhino_includes` | `*symbols` | Relationships that can be eager-loaded via `?include=relation`. Must correspond to defined ActiveRecord associations on the model. |
| `rhino_search` | `*symbols/strings` | Fields searched when `?search=term` is used. Rhino performs a case-insensitive `LIKE` search across all listed fields. Supports dot-notation for relationships (e.g., `'user.name'`). |
| `rhino_pagination_enabled` | `bool` | Enables or disables pagination for the index endpoint. Defaults to `false`. |
| `rhino_per_page` | `integer` | Number of records per page when pagination is enabled. Defaults to `25`. |
| `rhino_middleware` | `*strings` | Middleware applied to **all** routes for this model. |
| `rhino_middleware_actions` | `hash` | Middleware applied to **specific** actions only. Keys are action names (`:index`, `:show`, `:store`, `:update`, `:destroy`). |
| `rhino_except_actions` | `*symbols` | List of CRUD actions to exclude from route generation. Valid values: `:index`, `:show`, `:store`, `:update`, `:destroy`. |

:::tip
You only need to declare DSL methods that differ from their defaults. For example, if you do not need filtering, simply omit `rhino_filters` entirely.
:::

## Available Concerns

Rhino provides a collection of concerns that add specific behaviors to your models. When using `Rhino::RhinoModel`, the core concerns (HasRhino, HasValidation, HidableColumns, HasAutoScope) are already included. The concerns documented below can be added individually when needed.

### HasRhino

The core concern that provides all query-related DSL methods. It sets up class attributes for filters, sorts, includes, fields, search, pagination, middleware, and more.

**Included in RhinoModel** — no need to add manually.

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  # HasRhino is already included
end
```

**Also provides:**
- `uses_soft_deletes?` — Detects if the model has a `discarded_at` or `deleted_at` column

---

### HasValidation

Adds format validation to your model. Rhino calls `validate_for_action()` automatically during `store` and `update` actions.

Format constraints are defined using standard ActiveModel `validates` declarations. Field permissions (which fields each role can set) are defined on the policy.

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
end
```

:::info
For a complete breakdown of validation behavior, see the [Validation](./validation) page.
:::

---

### HasPermissions

Adds role-based permission checking to the **User** model. Rhino uses this concern to authorize API actions automatically when policies are in place.

**Methods:**

| Method | Description |
|---|---|
| `has_permission?(permission, organization = nil)` | Returns `true` if the user has the given permission within the specified organization. |
| `role_slug_for_validation(organization = nil)` | Returns the user's role slug within an organization, used for role-based validation rules. |

**Permission format:** `{resource_slug}.{action}`

Permissions follow the pattern of the resource slug (the key in your `Rhino.configure` models block) combined with the CRUD action:

- `posts.index` — can list posts
- `posts.store` — can create posts
- `blogs.update` — can update blogs
- `posts.destroy` — can delete posts

**Wildcard support:**

- `*` — grants access to everything across all resources
- `posts.*` — grants access to all actions on posts

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  include Rhino::HasPermissions

  has_many :user_roles
end

# Check if a user can create posts within an organization
if user.has_permission?('posts.store', organization)
  # User can create posts
end

# Check for full access
if user.has_permission?('*', organization)
  # User has unrestricted access to everything
end

# Check for all post actions
if user.has_permission?('posts.*', organization)
  # User can index, show, store, update, and destroy posts
end
```

---

### HasAuditTrail

Automatically records changes to your model in an audit log. Rhino tracks creation, updates, deletion, force-deletion, and restoration events and stores the old and new values for each change.

**Tracked events:** `created`, `updated`, `deleted`, `force_deleted`, `restored`

**DSL Methods:**

| Method | Type | Default | Description |
|---|---|---|---|
| `rhino_audit_exclude` | `*symbols/strings` | `['password', 'remember_token']` | Fields excluded from audit log entries. Use this to prevent sensitive data from being recorded. |

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  include Rhino::HasAuditTrail

  # Exclude sensitive fields from audit logs
  rhino_audit_exclude :password, :remember_token, :api_token
end

# Query the audit trail for any model instance
logs = post.audit_logs.order(created_at: :desc)

# Each log entry contains:
# - action (created, updated, deleted, etc.)
# - old_values (previous state)
# - new_values (current state)
# - user_id (who made the change)
# - timestamps
```

The `audit_logs` method is a polymorphic association, so it works identically on any model that uses the concern.

:::info
For full details on querying and managing audit logs, see the [Audit Trail](./audit-trail) page.
:::

---

### HasUuid

Automatically generates a UUID for the model when it is created. The concern hooks into ActiveRecord's `before_create` callback and fills the `uuid` column if it is empty.

```ruby title="app/models/invoice.rb"
class Invoice < Rhino::RhinoModel
  include Rhino::HasUuid

  # No additional configuration needed.
  # A UUID is generated and assigned to the `uuid` column on creation.
end
```

:::warning
Your database table must have a `uuid` column. Add it in your migration:

```ruby title="db/migrate/create_invoices.rb"
t.uuid :uuid, null: true
add_index :invoices, :uuid, unique: true
```
:::

---

### BelongsToOrganization

Provides multi-tenant organization scoping. This concern automatically filters all queries to the current organization and sets the `organization_id` when creating new records.

**Adds:**

| Member | Type | Description |
|---|---|---|
| `organization` | BelongsTo association | Links the model to its owning organization. |
| `for_organization(org)` | Class method | Returns an unscoped query filtered to a specific organization. |
| Default scope | Automatic | All queries are automatically filtered by `organization_id`. |
| Auto-set on create | Automatic | `organization_id` is filled from the current request context on creation. |

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  include Rhino::BelongsToOrganization

  # All queries are now scoped to the current organization automatically.
  # GET /api/acme-corp/posts -> only returns posts where organization_id matches acme-corp
end
```

**Nested ownership:**

Not every model has a direct `organization_id` column. For nested models, Rhino auto-detects the path to the organization by walking `belongs_to` relationships.

```ruby title="app/models/comment.rb"
class Comment < Rhino::RhinoModel
  include Rhino::BelongsToOrganization

  # Comment → post → blog → organization is auto-detected
  belongs_to :post
end
```

In this example, Rhino traverses `Comment -> post -> blog` to find the organization. The chain can be as deep as needed.

:::info
For a full explanation of multi-tenancy and organization scoping, see the [Multi-Tenancy](./multi-tenancy) page.
:::

---

### HidableColumns

Controls which columns are hidden from API responses. This concern provides multiple layers of column visibility control: base defaults, model-level configuration, and policy-based per-user hiding.

**Layers of hidden columns (applied in order):**

1. **Base hidden columns** (always hidden): `password`, `password_digest`, `remember_token`, `created_at`, `updated_at`, `deleted_at`, `discarded_at`, `email_verified_at`
2. **Model-level hidden columns** via `rhino_additional_hidden`: additional fields to always hide for this model
3. **Policy-level visibility** via `hidden_attributes_for_show()` / `permitted_attributes_for_show()` methods on the policy: per-user dynamic hiding

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  # Always hide these columns from API responses (in addition to base defaults)
  rhino_additional_hidden :api_token, :stripe_id
end
```

:::tip
Hidden columns are resolved per request based on the current user. The policy's `hidden_attributes_for_show` and `permitted_attributes_for_show` methods let you return different lists for different users.
:::

:::info
For policy-based column hiding (showing different fields to different users), see the [Policies](./policies) page.
:::

#### Computed Attributes with `rhino_computed_attributes`

Override `rhino_computed_attributes` in your model to add virtual (computed) attributes to API responses. These attributes are not database columns — they are calculated at runtime and merged into the serialized output.

```ruby title="app/models/contract.rb"
class Contract < Rhino::RhinoModel
  def days_until_expiry
    return nil unless expiry_date
    (expiry_date - Date.current).to_i
  end

  def risk_score
    calculate_risk
  end

  def rhino_computed_attributes
    {
      'days_until_expiry' => days_until_expiry,
      'risk_score' => risk_score
    }
  end
end
```

The returned hash is merged into the JSON response **before** policy filtering is applied. This means computed attributes are always subject to policy-level blacklist and whitelist — just like database columns. The controller calls `as_rhino_json` automatically when rendering responses.

:::warning
Do **not** override `as_rhino_json` directly. Use `rhino_computed_attributes` instead. Overriding `as_rhino_json` with `super.merge(...)` would add attributes **after** policy filtering, bypassing `hidden_attributes_for_show` and `permitted_attributes_for_show` — a security risk.
:::

Computed attributes can be controlled per-role via policy:

```ruby title="app/policies/contract_policy.rb"
class ContractPolicy < Rhino::ResourcePolicy
  def hidden_attributes_for_show(user)
    return [] if has_role?(user, 'admin')
    ['risk_score'] # Only admins see the risk score
  end
end
```

You can also use `permitted_attributes_for_show` to whitelist which attributes (including computed ones) each role can see.

---

### HasAutoScope

Automatically applies a global scope to the model based on a naming convention. When this concern is used, Rhino looks for a scope class at `Scopes::{ModelName}Scope` (or `ModelScopes::{ModelName}Scope` as fallback) and applies it if found. No manual registration is needed.

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  # HasAutoScope is already included — automatically loads Scopes::PostScope (if it exists)
end
```

#### ResourceScope Base Class (Recommended)

Extend `Rhino::ResourceScope` to get access to the current `user`, `organization`, and `role` inside your scope. This enables role-based or user-specific query filtering:

```ruby title="app/models/scopes/post_scope.rb"
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

Available methods inside `apply`:
- **`user`** — the current authenticated user (or `nil`)
- **`organization`** — the current organization (or `nil`)
- **`role`** — shortcut for the user's role slug in the current org (or `nil`)

#### Legacy Class-Method Scopes

You can also use a plain class with `self.apply` as a class method. This approach doesn't provide access to user/org context:

```ruby title="app/models/scopes/post_scope.rb"
module Scopes
  class PostScope
    def self.apply(scope)
      scope.where(is_visible: true)
    end
  end
end
```

With either approach, every query for `Post` automatically includes the scope filter. This is useful for soft-visibility flags, status filtering, role-based access, or any default constraint you want applied globally.

:::tip
The scope is only applied if the class exists. You can safely add the `HasAutoScope` concern to any model without creating the scope class until you need it.
:::

---

## Complete Model Example

Below is a full real-world model that combines multiple Rhino concerns into a feature-rich API resource:

```ruby title="app/models/blog_post.rb"
class BlogPost < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::HasUuid
  include Rhino::BelongsToOrganization
  include Discard::Model  # Soft deletes via discard gem

  # ── Validation ───────────────────────────────────────────────
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :slug, length: { maximum: 255 }, allow_nil: true
  validates :content, length: { maximum: 50_000 }, allow_nil: true
  validates :excerpt, length: { maximum: 500 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true

  # Field permissions are controlled by the policy.

  # ── Audit Trail ──────────────────────────────────────────────
  # No extra exclusions beyond the defaults (password, remember_token)

  # ── Query Configuration ──────────────────────────────────────
  rhino_filters   :status, :user_id, :category_id
  rhino_sorts     :created_at, :title, :published_at
  rhino_default_sort '-published_at'
  rhino_includes  :user, :category, :comments, :tags
  rhino_search    :title, :content, :excerpt
  rhino_fields    :id, :title, :slug, :excerpt, :status, :published_at

  # ── Pagination ───────────────────────────────────────────────
  rhino_pagination_enabled true
  rhino_per_page 20

  # ── Relationships ────────────────────────────────────────────
  belongs_to :user
  belongs_to :category
  has_many :comments
  has_and_belongs_to_many :tags
end
```

This single model definition gives you:

- **REST endpoints** for listing, showing, creating, updating, and soft-deleting blog posts
- **Filtering** by status, user, and category (`?filter[status]=published`)
- **Sorting** by creation date, title, or publish date (`?sort=-published_at`)
- **Full-text search** across title, content, and excerpt (`?search=rails`)
- **Eager loading** of user, category, comments, and tags (`?include=user,comments`)
- **Sparse fieldsets** to reduce payload size (`?fields[blog_posts]=id,title,excerpt`)
- **Pagination** at 20 records per page
- **Format validation** with ActiveModel validators
- **Audit logging** of every change with before/after values
- **UUID generation** for external-facing identifiers
- **Organization scoping** for multi-tenant data isolation
- **Column hiding** to keep sensitive fields out of API responses

## Registration

Models are registered in `config/initializers/rhino.rb`. The key becomes the URL slug and the permission prefix:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :'blog-posts', 'BlogPost'
  c.model :comments, 'Comment'
  c.model :categories, 'Category'
  c.model :tags, 'Tag'
end
```

With this configuration, Rhino generates routes such as:

```
GET    /api/{organization}/blog-posts
GET    /api/{organization}/blog-posts/{id}
POST   /api/{organization}/blog-posts
PUT    /api/{organization}/blog-posts/{id}
DELETE /api/{organization}/blog-posts/{id}
```

:::warning
The model key (e.g., `blog-posts`) is used as the permission prefix. Make sure it matches what you use in your role permission definitions (e.g., `blog-posts.store`, `blog-posts.index`).
:::
