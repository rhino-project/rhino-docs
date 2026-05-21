---
sidebar_position: 6
title: Soft Deletes
---

# Soft Deletes

Models using the [discard](https://github.com/jhawthorn/discard) gem automatically get trash, restore, and force-delete endpoints — each with its own authorization policy.

## Setup

Add the `discard` gem's `has_discard` to your model and ensure the migration has a `discarded_at` column:

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation

  has_discard  # Enables soft deletes
end
```

```ruby title="db/migrate/create_posts.rb"
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

:::info
Rhino auto-detects the `discarded_at` or `deleted_at` column on your model and automatically registers the soft-delete routes. No extra configuration needed.
:::

## Endpoints

| Method | Endpoint | Description | Policy Method |
|--------|----------|-------------|---------------|
| `DELETE` | `/api/posts/{id}` | Soft delete (move to trash) | `destroy?` |
| `GET` | `/api/posts/trashed` | List all trashed items | `view_trashed?` |
| `POST` | `/api/posts/{id}/restore` | Restore from trash | `restore?` |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanently delete | `force_delete?` |

## Behavior

- **`GET /api/posts`** — excludes soft-deleted records (standard discard behavior)
- **`DELETE /api/posts/1`** — sets `discarded_at` timestamp, record stays in database
- **`GET /api/posts/trashed`** — returns only soft-deleted records, with full pagination
- **`POST /api/posts/1/restore`** — clears `discarded_at`, record becomes visible again
- **`DELETE /api/posts/1/force-delete`** — permanently removes from database

## Request & Response Examples

### Soft Delete

```bash title="terminal"
DELETE /api/posts/1
```

```json title="Response"
{
    "id": 1,
    "title": "My Post",
    "discarded_at": "2025-01-15T10:30:00Z"
}
```

### List Trashed

```bash title="terminal"
GET /api/posts/trashed?page=1&per_page=10
```

Response headers:
```
X-Current-Page: 1
X-Last-Page: 2
X-Per-Page: 10
X-Total: 15
```

```json title="Response"
[
    {
        "id": 1,
        "title": "My Post",
        "discarded_at": "2025-01-15T10:30:00Z"
    },
    {
        "id": 5,
        "title": "Old Draft",
        "discarded_at": "2025-01-14T08:00:00Z"
    }
]
```

### Restore

```bash title="terminal"
POST /api/posts/1/restore
```

```json title="Response"
{
    "id": 1,
    "title": "My Post",
    "discarded_at": null
}
```

### Force Delete

```bash title="terminal"
DELETE /api/posts/1/force-delete
```

```json title="Response"
{
    "message": "Resource permanently deleted."
}
```

## Authorization

Each soft-delete action has its own policy method, mapped to specific permissions:

```ruby title="app/policies/post_policy.rb"
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  # Permission: posts.trashed
  def view_trashed?
    super
  end

  # Permission: posts.restore
  def restore?
    super
  end

  # Permission: posts.forceDelete
  def force_delete?
    super
  end
end
```

### Role-Based Example

Set up different levels of soft-delete access per role:

```ruby title="db/seeds.rb"
admin = Role.create!(
  name: 'Admin',
  slug: 'admin',
  permissions: ['*']  # Can do everything
)

editor = Role.create!(
  name: 'Editor',
  slug: 'editor',
  permissions: [
    'posts.index', 'posts.show', 'posts.store', 'posts.update',
    'posts.destroy',   # Can soft-delete
    'posts.trashed',   # Can view trash
    'posts.restore',   # Can restore from trash
    # NO posts.forceDelete — editors can't permanently delete
  ]
)

viewer = Role.create!(
  name: 'Viewer',
  slug: 'viewer',
  permissions: [
    'posts.index', 'posts.show',
    # NO delete/trash/restore/forceDelete — viewers are read-only
  ]
)
```

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| Soft delete | Yes | Yes | No |
| View trashed | Yes | Yes | No |
| Restore | Yes | Yes | No |
| Force delete | Yes | **No** | No |

:::warning Force Delete is Permanent
Force delete permanently removes the record from the database. There is no way to recover it. Use appropriate permissions to restrict this action.
:::

## Custom Authorization Logic

Override policy methods for custom behavior:

```ruby title="app/policies/post_policy.rb"
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  # Only allow users to soft-delete their own posts (unless admin)
  def destroy?
    if user.has_permission?('*')
      true
    else
      super && record.user_id == user.id
    end
  end

  # Only admins can force delete
  def force_delete?
    user&.has_permission?('posts.forceDelete')
  end
end
```

## Audit Trail Integration

If your model uses both `has_discard` and `HasAuditTrail`, all soft-delete operations are logged:

- **Soft delete** → audit action: `deleted`
- **Restore** → audit action: `restored`
- **Force delete** → audit action: `force_deleted`

See [Audit Trail](./audit-trail) for details.
