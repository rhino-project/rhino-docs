---
sidebar_position: 1
title: Getting Started
---

# Rails Server — Getting Started

Install Rhino and go from zero to a full REST API in under 5 minutes.

:::info Start here — this page summarizes the whole library
This is the entry point for the Rails docs. The [Feature Map](#feature-map) below is a complete
summary of every feature Rhino ships, each with its canonical declaration and a link to its deep-dive
page. If you are an AI agent picking up this codebase, read this page first — it tells you what exists
so you never hand-write something Rhino already generates.
:::

## Requirements

- Ruby 3.3+
- Rails 8.0+
- Bundler

## Installation

```bash title="terminal"
bundle add rhino-rails -v "~> 4.0"
```

Then run the interactive installer:

```bash title="terminal"
rails rhino:install
```

The installer will walk you through:

- Publishing config and routes
- Enabling multi-tenant support (organizations, roles)
- Enabling audit trail (change logging)

## The mental model

Rhino **derives your API from declarations**, not from controllers. You register a model, declare what
is queryable on it with the `rhino_*` DSL, and declare who may do what in a policy. Rhino generates the
routes, applies tenant scoping, authorizes the action, builds the query, serializes the response, and
strips columns the user may not see — the same way for every model.

```
Declare (model + policy + initializer)  →  Rhino generates and enforces  →  REST API
```

The practical consequence: **if you are writing a controller, check the [Feature Map](#feature-map)
first.** Counts, filters, per-role field visibility, batch writes and trash/restore all have
declarative answers already.

## Configuration

After installation, your config file is at `config/initializers/rhino.rb`:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  # Model registration — slug => model class name
  c.model :posts, 'Post'
  c.model :comments, 'Comment'

  # Models that don't require authentication
  c.public_model :posts  # These endpoints skip auth middleware

  # Multi-tenancy settings
  c.multi_tenant[:enabled] = false                        # Enable organization scoping
  c.multi_tenant[:use_subdomain] = false                  # true = subdomain, false = URL prefix
  c.multi_tenant[:organization_identifier_column] = 'id'  # 'id', 'slug', or 'uuid'
  c.multi_tenant[:middleware] = nil                        # Custom middleware class

  # Column matched by :id on member routes (default: each model's primary key)
  # c.route_key = :hash_id

  # Invitation system
  c.invitations[:expires_days] = 7
  c.invitations[:allowed_roles] = nil  # nil = all roles, or ['admin', 'editor']

  # Nested operations
  c.nested[:path] = 'nested'         # Route path
  c.nested[:max_operations] = 50     # Max ops per request
  c.nested[:allowed_models] = nil    # nil = all registered models

  # Generator settings
  c.test_framework = 'rspec'  # 'rspec' or 'minitest'
end
```

## Environment Variables

Add these to your `.env` file as needed:

```env title=".env"
# Invitation expiration (days)
INVITATION_EXPIRES_DAYS=7
```

## Register Your First Model

Create a model (or use the [generator](./generator)):

```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  # Validation lives in app/requests/post_store_request.rb and
  # post_update_request.rb — see Validation.

  # Field permissions are controlled by the policy (PostPolicy).

  # Query configuration
  rhino_filters  :status, :user_id
  rhino_sorts    :created_at, :title, :updated_at
  rhino_default_sort '-created_at'
  rhino_includes :user, :comments
  rhino_search   :title, :content

  # Relationships
  belongs_to :user
  has_many :comments
end
```

:::tip RhinoModel
`Rhino::RhinoModel` extends `ApplicationRecord` and includes `HasRhino`, `HasValidation`, `HidableColumns`, and `HasAutoScope` out of the box. Open the base class to see all available class attributes with YARD documentation and examples.

For additional features, include concerns manually:
```ruby title="app/models/post.rb"
class Post < Rhino::RhinoModel
  include Rhino::HasAuditTrail
  include Rhino::BelongsToOrganization
  include Discard::Model  # Soft deletes
  # ...
end
```
:::

Register it in `config/initializers/rhino.rb`:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :posts, 'Post'
end
```

That's it. You now have a full REST API for posts:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/{id}` | Show single record with relationships |
| `PUT` | `/api/posts/{id}` | Update with validation |
| `DELETE` | `/api/posts/{id}` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/{id}/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanent delete |

:::tip Multi-Tenant Routes
When multi-tenancy is enabled, all routes are prefixed with `{organization}`:

```
GET /api/{organization}/posts
POST /api/{organization}/posts
```
:::

## Authentication Endpoints

Rhino also provides auth routes out of the box:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns API token |
| `POST` | `/api/auth/logout` | Regenerate token (invalidates old) |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

## Run Migrations

```bash title="terminal"
rails db:migrate
```

This will create the necessary tables for audit logs, invitations, and any model tables you've defined.

## Scaffold with the Generator

Use the interactive generator to create models, migrations, factories, policies, and scopes:

```bash title="terminal"
rails rhino:generate
```

```
+ Rhino :: Generate :: Scaffold your resources +

 What type of resource would you like to generate?
 > Model (with migration and factory)

 What is the resource name?
 > Post

 Creating Post model, migration, and factory ..................... done
```

See the [Generator docs](./generator) for all options.

---

## Feature Map

Everything Rhino for Rails does, in one place. Each row names the declaration you write and links to
the page that explains it in full.

### 1. Model declaration surface

Every DSL call below is optional — declare only what differs from the default. Full reference:
[Models](./models).

| DSL | Purpose |
|---|---|
| ActiveModel `validates` | **Deprecated**, removed in 5.0 — validation belongs in a request class ([Validation](./validation)) |
| `rhino_filters` | Fields usable with `?filter[field]=value` |
| `rhino_sorts` / `rhino_default_sort` | Fields usable with `?sort=`, plus the fallback sort |
| `rhino_search` | Fields swept by `?search=` (dot-notation allowed, e.g. `'user.name'`) |
| `rhino_includes` | Associations loadable with `?include=` |
| `rhino_fields` | Columns selectable with `?fields[model]=` |
| `rhino_scopes` / `rhino_default_scope` | Named scopes selectable with `?scope=` (with optional declared parameters), and the one applied by default ([Querying](./querying#named-scopes)) |
| `rhino_pagination_enabled` / `rhino_per_page` | Pagination toggle (default `false`) and page size (default 25) |
| `rhino_middleware` / `rhino_middleware_actions` | Middleware for all routes, or per action |
| `rhino_except_actions` | CRUD actions to *not* generate |
| `rhino_route_key` | Column matched by the `:id` segment on member routes ([Route Key](./models#route-key)) |
| `rhino_additional_hidden` | Columns always stripped from responses |
| `rhino_audit_exclude` | Fields kept out of audit entries |

:::warning Whitelists are the security boundary
A field not declared in a `rhino_*` list is silently ignored — clients cannot filter, sort or select
by columns you didn't opt in. Adding a column to a whitelist is an authorization decision.
:::

### 2. Concerns

Included automatically in `Rhino::RhinoModel`: `Rhino::HasRhino`, `Rhino::HasValidation`,
`Rhino::HidableColumns`, `Rhino::HasAutoScope`.

| Concern | Include it when |
|---|---|
| `Rhino::HasAuditTrail` | The model needs change logging ([Audit Trail](./audit-trail)) |
| `Rhino::BelongsToOrganization` | The model holds tenant data ([Multi-Tenancy](./multi-tenancy)) |
| `Rhino::HasUuid` | You want an auto-generated `uuid` column |
| `Rhino::HasPermissions` | On the **User** model, to enable permission checks |
| `Discard::Model` | Soft deletes — Rhino auto-detects `discarded_at`/`deleted_at` ([Soft Deletes](./soft-deletes)) |

### 3. Generated endpoints

| Method | Endpoint | Policy method | Notes |
|---|---|---|---|
| `GET` | `/api/{resource}` | `index?` | Filters, sorts, search, includes, fields, pagination |
| `POST` | `/api/{resource}` | `create?` | Validated; field permissions enforced |
| `GET` | `/api/{resource}/{id}` | `show?` | Not narrowed by `?scope=` |
| `PUT` | `/api/{resource}/{id}` | `update?` | |
| `DELETE` | `/api/{resource}/{id}` | `destroy?` | Soft delete when the model is discardable |
| `GET` | `/api/{resource}/trashed` | `view_trashed?` | [Soft Deletes](./soft-deletes) |
| `POST` | `/api/{resource}/{id}/restore` | `restore?` | |
| `DELETE` | `/api/{resource}/{id}/force-delete` | `force_delete?` | Permanent |
| `GET` | `/api/{resource}/computed` | `index?` | Only when collection attributes are declared ([Computed Attributes](./computed-attributes)) |
| `GET` | `/api/{resource}/{id}/audit` | — | Only for `HasAuditTrail` models ([Audit Trail](./audit-trail)) |
| `POST` | `/api/nested` | per-operation | Atomic multi-model writes ([Nested Operations](./nested-operations)) |

Auth routes ship out of the box: `POST /api/auth/login`, `…/logout`, `…/password/recover`,
`…/password/reset`, `…/register`. Invitation routes are registered under the `:tenant` route group; a
group can also opt into its own prefixed auth route set — see
[Route Groups](./route-groups#group-membership--auth). Exact policy method names are listed in
[Policies](./policies).

### 4. Query parameters

All of these compose in a single request. Full reference: [Querying](./querying).

| Parameter | Example | Behavior on an unknown value |
|---|---|---|
| `?filter[field]=` | `?filter[status]=draft,published` (comma = OR) | Ignored; **403** if the policy hides the attribute |
| `?sort=` | `?sort=status,-created_at` | Ignored; **403** if the policy hides the attribute |
| `?search=` | `?search=rails` | — |
| `?include=` | `?include=user,comments` | **403** if the user lacks index permission on the included resource |
| `?fields[model]=` | `?fields[posts]=id,title` | Ignored |
| `?page=` / `?per_page=` | `?page=2&per_page=25` | — |
| `?scope=` | `?scope=availableForDrivers` (camelCase on the wire), `?scope[window][from]=a&scope[window][to]=b` | **403** if not whitelisted, not permitted by the policy, or the arguments do not match the declared parameters |
| `?computed_attributes=` | `?computed_attributes=avatar_url`, `?computed_attributes[tickets_since][since]=a` | **403** if undeclared, denied, or the arguments do not match the declared parameters |

Pagination metadata comes back in **headers**: `X-Current-Page`, `X-Last-Page`, `X-Per-Page`,
`X-Total`.

### 5. Validation

Each model validates `store` and `update` with a **request class** — `{Model}StoreRequest` and
`{Model}UpdateRequest` in `app/requests/`, extending `Rhino::ResourceRequest`. Zeitwerk autoloads the
directory, so there is nothing to register:

```ruby title="app/requests/post_store_request.rb"
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string
  attribute :category_id, :integer

  validates :title, presence: true, length: { maximum: 255 }
  validates :category_id, presence: true

  def authorize? = route_group != "public"

  # prepare runs before the validations and sees raw client input, so every
  # string operation is guarded. Note that `attribute :title, :string` casts
  # whatever survives — add a `validate` that inspects the raw value when the
  # shape matters. See Validation.
  def prepare(input)
    title = input["title"]
    input.merge("title" => title.is_a?(String) ? title.strip : title)
  end
end
```

Rules are ordinary ActiveModel declarations and can branch on `user`, `organization`, `route_group`,
`action` and — on update — `record`, the row as it was before the write. `authorize?` returning false is
a `403` indistinguishable from a policy denial; failing validations are a `422` with field-level errors,
merged with the cross-tenant foreign-key check.

**The declared attributes present in the input are the write payload**: a field with no `attribute` is
silently dropped, not saved. **Which fields a role may write** still lives on the policy, and a
forbidden field is a `403` before the request class runs. See [Validation](./validation).

### 6. Authorization

Policies extend Rhino's `ResourcePolicy`, which maps each action to a `{resource}.{action}` permission
(`posts.index`, `posts.store`, `posts.force_delete`…). Wildcards: `posts.*` and `*`.

Effective permissions resolve from **three layers**, with deny always winning:

```
effective = (role ∪ granted) − denied
```

- **role** — `org_role_permissions(organization_id, role_id, permissions)`, shared by everyone with
  that role in that org
- **granted** / **denied** — per-user deltas on `user_roles`
- **legacy** — `user_roles.permissions`, still honored as an allow layer; the global
  `roles.permissions` column is a fallback consulted only when the layers above are empty

Outside a tenant context, permissions come from `users.permissions`. Use
`user.explain_permission(perm, org)` to see which layer decided, and `rake rhino:permissions_migrate`
(`APPLY=1` to write) to lift per-user sets into the role layer. Full detail: [Policies](./policies).

**Attribute-level permissions** are part of the same policy:

| Policy method | Controls |
|---|---|
| `permitted_attributes_for_show` | Read whitelist (`['*']` = all) |
| `hidden_attributes_for_show` | Read blacklist — always wins |
| `permitted_attributes_for_create` | Writable fields on create |
| `permitted_attributes_for_update` | Writable fields on update |
| `permitted_scopes` | Named scopes this user may select with `?scope=` (`['*']` = all declared) |

A hidden attribute is hidden from **queries** too: it cannot be used as a `?filter[]` or a `?sort`,
and `?search=` skips it.

### 7. Multi-tenancy

`Rhino::BelongsToOrganization` scopes every query to the current organization and fills
`organization_id` on create. Models without an org column are scoped through their `belongs_to` chain.
The organization is resolved from a URL prefix (`/api/{organization}/…`) or a subdomain, matched on
`id`, `slug` or `uuid`. Unknown org, or an org the user doesn't belong to → `404`. See
[Multi-Tenancy](./multi-tenancy).

### 8. Route groups

One set of models, several URL contexts — a tenant dashboard, a driver app, an admin panel, a public
read-only API — each with its own `prefix:`, optional `domain:`, `middleware:`, model subset, `auth:`
route set, lifecycle `hooks:` and tenant boundary (`tenant: false` for a group that spans every
organization). `:tenant` and `:public` are reserved names. Conflicting groups raise at boot. See
[Route Groups](./route-groups).

### 9. Data lifecycle

- **Soft deletes** — via the `discard` gem; trash, restore and force-delete are separate endpoints with
  separate permissions ([Soft Deletes](./soft-deletes))
- **Audit trail** — `created`, `updated`, `deleted`, `force_deleted`, `restored` with before/after
  values, actor, IP and user agent ([Audit Trail](./audit-trail))
- **Nested operations** — up to 50 create/update/delete operations in one transaction, with `$N.field`
  references between them; any failure rolls the whole batch back
  ([Nested Operations](./nested-operations))

### 10. Computed attributes

Three kinds, chosen by cost — none of them needs a controller
([Computed Attributes](./computed-attributes)):

| Kind | Hook | Evaluated |
|---|---|---|
| Always-on, per record | `rhino_computed_attributes` | Every row of every read |
| Opt-in, per record | `rhino_record_computed_attributes` | Only when the client sends `?computed_attributes=` |
| Collection-level aggregate | `self.rhino_collection_computed_attributes` | Once per request, via `GET /{resource}/computed` |

All three pass through the same policy gate as database columns. Never override `as_rhino_json` —
doing so appends values *after* policy filtering.

Either opt-in kind can declare **parameters** the client fills in, so one `revenue` replaces a family
of fixed-window attributes:

```ruby
"revenue" => {
  params: %i[from to],
  with: ->(scope, _user, from, to) { scope.where(created_at: from..to).sum(:total) }
}
```

```bash
GET /api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01
```

Arguments bind by name — matched **verbatim**, unlike scope parameters — `"true"`/`"false"` arrive as
real booleans, and a mismatch is a `403`. A bare `GET /{resource}/computed` skips attributes with a
required parameter rather than erroring.

### 11. Custom controllers

When the shape genuinely isn't "attributes of one resource" — cross-model reports, workflows, bulk
actions — write a controller, but build its queries through the resolver so tenant isolation and your
global scopes still apply:

```ruby
open_tasks = Rhino.query(Task).where(status: 'open').count
```

`Rhino.query` returns an org-scoped `ActiveRecord::Relation` and raises `Rhino::MissingTenantContext`
rather than returning every tenant's rows when there is no tenant. Use `Rhino.for_user(user).in_organization(org).run { ... }`
to establish that context outside a request — or, in a route group declared `tenant: false`, query
without one and get every organization's rows on purpose. See
[Custom Controllers](./custom-controllers).

### 12. Code generation & tooling

| Command | What it does |
|---|---|
| `rails rhino:install` | Interactive setup: initializer, routes, multi-tenancy, audit trail, test framework |
| `rails rhino:generate` (`rhino:g`) | Scaffold a model + migration + factory, a policy, or a scope ([Generator](./generator)) |
| `rails rhino:blueprint` | Generate models, policies, specs and seeders from YAML specs — deterministic, no AI tokens ([Blueprint](./blueprint)) |
| `rails rhino:export_types` | TypeScript interfaces for the client and mobile apps ([Export Types](./export-types)) |
| `rails rhino:export_postman` | Postman collection covering every endpoint |
| `rake rhino:permissions_migrate` | Lift per-user permissions into the role layer (`APPLY=1` to write) |
| `rails invitation:link` | Generate an invitation link for testing |

### 13. Request pipeline

```
Request → Middleware → Policy → Scope → Query Builder → Serialize → Attribute permissions → Response
```

Knowing which layer you're debugging is usually the whole fix. See
[Request Lifecycle](./request-lifecycle).

---

## Which tool for which problem

| You want to… | Do this — not a controller |
|---|---|
| Return a count or a sum | `self.rhino_collection_computed_attributes` → `GET /{resource}/computed` |
| Add a derived field to each row | `rhino_computed_attributes`, or `rhino_record_computed_attributes` if it costs a query |
| Hide a column from some roles | `hidden_attributes_for_show` on the policy |
| Let clients pick a complex predefined query | `rhino_scopes` + an AR scope or `Rhino::ResourceScope` class |
| Always restrict rows (tenancy, visibility) | A **global** scope — never `rhino_default_scope` |
| Create related records atomically | `POST /api/nested` with `$N.id` references |
| Expose the same models to a second app | A [route group](./route-groups) |
| Serve records at a non-`id` URL | `rhino_route_key` |
| Restrict who can write a field | `permitted_attributes_for_create` / `…_for_update` |

## Documentation map

| Page | Read it for |
|---|---|
| [Models](./models) | Every DSL call and concern, route keys |
| [Validation](./validation) | Request classes, the write payload, field permissions, error shapes |
| [Querying](./querying) | Filters, sorts, search, includes, fields, named scopes |
| [Computed Attributes](./computed-attributes) | Derived values and aggregates |
| [Request Lifecycle](./request-lifecycle) | The layers of a request |
| [Policies](./policies) | Permissions, wildcards, layered resolution, attribute permissions |
| [Route Groups](./route-groups) | Multiple URL contexts, group auth, hooks, membership |
| [Nested Operations](./nested-operations) | Atomic multi-model writes |
| [Soft Deletes](./soft-deletes) | Trash, restore, force delete |
| [Multi-Tenancy](./multi-tenancy) | Organizations, roles, scoping |
| [Custom Controllers](./custom-controllers) | Tenant-safe hand-written endpoints |
| [Audit Trail](./audit-trail) | Change logging and querying it |
| [Generator](./generator) | All Rake/Rails commands |
| [Blueprint](./blueprint) | YAML-driven, deterministic codegen |
| [Export Types](./export-types) | TypeScript types for the client |
| [Upgrading](./upgrading) | Version-to-version upgrade notes |
| [Release Notes](./release-notes) | What changed, newest first |

The [React client docs](../react/getting-started) cover the hooks that consume this API.
