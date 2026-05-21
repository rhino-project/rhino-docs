---
sidebar_position: 10
title: Generator
---

# Interactive Generator

Scaffold models, policies, scopes, and more with interactive CLI commands.

## Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `rails rhino:install` | — | Interactive project setup |
| `rails rhino:generate` | `rails rhino:g` | Scaffold resources (models, policies, scopes) |
| `rails rhino:export_postman` | — | Generate Postman collection |
| `rails invitation:link` | — | Generate invitation link for testing |

## rhino:install

Interactive installer that sets up the entire Rhino framework:

```bash title="terminal"
rails rhino:install
```

The installer walks you through:

### 1. Core Setup
- Creates `config/initializers/rhino.rb`
- Sets up route configuration

### 2. Feature Selection
- **Multi-tenant support** — creates organizations, roles, user_roles tables, and middleware
- **Audit trail** — creates audit_logs migration

### 3. Multi-Tenant Options (if enabled)
- **Resolution strategy**: route prefix vs subdomain
- **Organization identifier**: `id`, `slug`, or `uuid`
- **Default roles**: creates seeder with admin, editor, viewer roles

### 4. Post-Setup
- Optionally runs migrations
- Optionally seeds the database
- Prints remaining manual steps

## rhino:generate

Interactively scaffold resources:

```bash title="terminal"
rails rhino:generate
# or
rails rhino:g
```

### Generating a Model

```
+ Rhino :: Generate :: Scaffold your resources +

 What type of resource would you like to generate?
 > Model (with migration and factory)

 What is the resource name?
 > BlogPost

 Define your columns:

 Column name: title
 Column type: string
 Nullable? No
 Has index? No

 Column name: content
 Column type: text
 Nullable? No

 Column name: status
 Column type: string
 Default value: draft

 Column name: user_id
 Column type: references

 Column name: published_at
 Column type: datetime
 Nullable? Yes

 Add another column? No

 Creating BlogPost model, migration, and factory .............. done
```

This generates:

**Model** (`app/models/blog_post.rb`):
```ruby title="app/models/blog_post.rb"
class BlogPost < Rhino::RhinoModel
  # Validation (ActiveModel — use allow_nil: true)
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :user_id, numericality: { only_integer: true }, allow_nil: true

  # Field permissions are controlled by the policy.
  # See: app/policies/blog_post_policy.rb

  rhino_filters  :status, :user_id
  rhino_sorts    :created_at, :title
  rhino_default_sort '-created_at'
  rhino_includes :user
  rhino_search   :title, :content

  belongs_to :user
end
```

**Migration** (`db/migrate/xxxx_create_blog_posts.rb`):
```ruby title="db/migrate/create_blog_posts.rb"
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

**Factory** (`spec/factories/blog_posts.rb` or `test/factories/blog_posts.rb`):
```ruby title="spec/factories/blog_posts.rb"
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

**Auto-registration** in `config/initializers/rhino.rb`:
```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :'blog-posts', 'BlogPost'
end
```

### Generating a Policy

```bash title="terminal"
rails rhino:generate
# Select: Policy
# Resource name: BlogPost
```

Generates `app/policies/blog_post_policy.rb`:

```ruby title="app/policies/blog_post_policy.rb"
class BlogPostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'blog-posts'

  # All CRUD methods inherited from ResourcePolicy
  # Override for custom authorization logic

  # Attribute Permissions — override to control field access:
  # def permitted_attributes_for_create(user)
  #   has_role?(user, 'admin') ? ['*'] : ['title', 'content']
  # end
end
```

### Generating a Scope

```bash title="terminal"
rails rhino:generate
# Select: Scope
# Resource name: BlogPost
```

Generates `app/models/scopes/blog_post_scope.rb`:

```ruby title="app/models/scopes/blog_post_scope.rb"
module Scopes
  class BlogPostScope < Rhino::ResourceScope
    # Available methods: user, organization, role
    def apply(relation)
      # Add your global scope logic
      # e.g., relation.where(is_visible: true)
      relation
    end
  end
end
```

The generated scope extends `Rhino::ResourceScope`, giving you access to `user`, `organization`, and `role` inside the `apply` method for role-based or user-specific filtering. If the model uses the `HasAutoScope` concern (included in `RhinoModel` by default), this scope is automatically applied.

## Supported Column Types

| Type | Migration | Factory | Example |
|------|-----------|---------|---------|
| `string` | `t.string :name` | `Faker::Lorem.sentence` | Titles, slugs, emails |
| `text` | `t.text :body` | `Faker::Lorem.paragraphs(number: 3).join` | Long content |
| `integer` | `t.integer :count` | `Faker::Number.between(from: 0, to: 100)` | Counts, quantities |
| `boolean` | `t.boolean :active` | `Faker::Boolean.boolean` | Flags, toggles |
| `date` | `t.date :published_at` | `Faker::Date.backward(days: 30)` | Dates without time |
| `datetime` | `t.datetime :starts_at` | `Faker::Time.backward(days: 30)` | Dates with time |
| `decimal` | `t.decimal :price, precision: 10, scale: 2` | `Faker::Commerce.price` | Prices, amounts |
| `uuid` | `t.uuid :external_id` | `SecureRandom.uuid` | External IDs |
| `references` | `t.references :user, foreign_key: true` | `association :user` | Relationships |

## rhino:export_postman

Generate a complete Postman Collection v2.1 for all registered models:

```bash title="terminal"
rails rhino:export_postman
```

This creates a JSON file you can import directly into Postman. The collection includes:

- All CRUD endpoints for every registered model
- Soft delete endpoints (trashed, restore, force-delete)
- Authentication endpoints (login, logout, register)
- Invitation endpoints (if multi-tenant)
- Nested operations endpoint
- Pre-configured authorization headers
- Example request bodies with validation rules

## invitation:link

Generate an invitation link for testing:

```bash title="terminal"
rails invitation:link user@example.com acme-corp
```

Options:

```bash title="terminal"
rails invitation:link user@example.com acme-corp --role=editor --create
```

| Option | Description |
|--------|-------------|
| `--role=ROLE` | The role slug to assign (default: first available role) |
| `--create` | Create the organization if it doesn't exist |

Creates a new invitation and outputs the acceptance URL. Useful for testing the invitation flow without sending emails.
