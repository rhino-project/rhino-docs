---
sidebar_position: 1
title: Getting Started
---

# Rails Server — Getting Started

Install Rhino and go from zero to a full REST API in under 5 minutes.

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
  # Validation (ActiveModel — use allow_nil: true for all validators)
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true

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

## Next Steps

- [Model Configuration](./models) — concerns, DSL, relationships
- [Validation](./validation) — per-action and role-based validation rules
- [Querying](./querying) — filters, sorts, search, pagination, includes
- [Policies](./policies) — role-based authorization and permissions
- [Multi-Tenancy](./multi-tenancy) — organization scoping and roles
