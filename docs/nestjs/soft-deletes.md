---
sidebar_position: 7
title: Soft Deletes
---

# Soft Deletes

Rhino supports soft deletes out of the box. When enabled on a model, the standard `DELETE` endpoint sets a `deleted_at` timestamp instead of permanently removing the record. Three additional endpoints are provided to list trashed records, restore them, and force-delete them permanently.

## Enabling Soft Deletes

Set the `softDeletes` static property on your model:

```ts title="app/models/post.ts"
import { DateTime } from 'luxon'
import { BaseModel, column } from '@nestjs/lucid/orm'
import { compose } from '@nestjs/core/helpers'
import { HasRhino } from '@rhino-dev/rhino-nestjs/mixins/has_rhino'

export default class Post extends compose(BaseModel, HasRhino) {
  static softDeletes = true

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
```

Your database migration must include the `deleted_at` column:

```ts title="database/migrations/create_posts_table.ts"
import { BaseSchema } from '@nestjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'posts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('title').notNullable()
      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }
}
```

## Soft Delete Endpoints

When `softDeletes = true`, Rhino registers three additional routes beyond the standard CRUD set:

| Method | Endpoint | Description | Policy Method |
|--------|----------|-------------|---------------|
| `GET` | `/api/posts/trashed` | List soft-deleted records | `viewTrashed(user)` |
| `POST` | `/api/posts/:id/restore` | Restore a soft-deleted record | `restore(user, record)` |
| `DELETE` | `/api/posts/:id/force-delete` | Permanently delete a record | `forceDelete(user, record)` |

The standard `DELETE /api/posts/:id` endpoint performs a soft delete (sets `deleted_at`) rather than a hard delete.

### Trashed Endpoint

```bash title="terminal"
GET /api/posts/trashed
```

Lists all soft-deleted records. Supports the same query parameters as the index endpoint (filters, sorts, search, includes, pagination, fields). The query uses Prisma's `onlyTrashed()` scope to return only records where `deleted_at` is not null.

```bash title="terminal"
# List trashed posts with sorting
GET /api/posts/trashed?sort=-deleted_at

# Search within trashed posts
GET /api/posts/trashed?search=old+draft

# Paginate trashed posts
GET /api/posts/trashed?page=1&per_page=10
```

### Restore Endpoint

```bash title="terminal"
POST /api/posts/:id/restore
```

Restores a soft-deleted record by setting `deleted_at` back to `null`. The record must be in the trashed state. Returns the restored record as JSON.

If the model has a `restore()` instance method, Rhino calls it. Otherwise, it manually sets `deletedAt` (and `discardedAt` if present) to `null` and saves.

### Force Delete Endpoint

```bash title="terminal"
DELETE /api/posts/:id/force-delete
```

Permanently removes the record from the database. The record must be in the trashed state (soft-deleted first). Returns `204 No Content` on success.

If the model has a `forceDelete()` instance method, Rhino calls it. Otherwise, it performs a raw delete query.

## Authorization

Each soft-delete action has its own policy method:

```ts title="app/policies/post_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'

  // Permission: posts.trashed
  async viewTrashed(user: any): Promise<boolean> {
    return this.checkPermission(user, 'trashed')
  }

  // Permission: posts.restore
  async restore(user: any, record: any): Promise<boolean> {
    return this.checkPermission(user, 'restore')
  }

  // Permission: posts.forceDelete
  async forceDelete(user: any, record: any): Promise<boolean> {
    return this.checkPermission(user, 'forceDelete')
  }
}
```

These methods are already implemented on `ResourcePolicy`, so you only need to override them if you require custom logic.

## Excluding Soft Delete Routes

If you want soft deletes but do not want certain endpoints (e.g., you want to prevent force deletion via the API), use `exceptActions`:

```ts title="app/models/post.ts"
export default class Post extends compose(BaseModel, HasRhino) {
  static softDeletes = true

  // Allow trashed listing and restore, but no force-delete via API
  static exceptActions = ['forceDelete']
}
```

## Audit Trail Integration

When the `HasAuditTrail` mixin is also applied, soft delete operations are automatically logged with the appropriate action type:

- Standard `DELETE` -- logged as `deleted`
- `POST /:id/restore` -- logged as `restored`
- `DELETE /:id/force-delete` -- logged as `force_deleted`

The `ResourcesController` calls `logRestore()` after restoring and `logForceDelete()` before permanently deleting, so the audit trail captures the full lifecycle of soft-deleted records.

## Guard Behavior

If a request hits a trashed, restore, or force-delete endpoint on a model that does **not** have `softDeletes = true`, Rhino returns a `404` response:

```json title="Response"
{ "message": "This resource does not support soft deletes" }
```

This prevents accidental exposure of soft-delete routes on models that are not configured for it.
