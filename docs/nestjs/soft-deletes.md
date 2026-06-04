---
sidebar_position: 7
title: Soft Deletes
---

# Soft Deletes

Rhino supports soft deletes out of the box. When enabled on a model, the standard `DELETE` endpoint sets a `deleted_at` timestamp instead of permanently removing the record. Three additional endpoints are provided to list trashed records, restore them, and force-delete them permanently.

## Enabling Soft Deletes

Set `softDeletes: true` on the model registration in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  softDeletes: true,
},
```

Your Prisma model must include a nullable `deletedAt` column:

```prisma title="prisma/schema.prisma"
model Post {
  id        Int       @id @default(autoincrement())
  title     String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("posts")
}
```

Run `npx prisma migrate dev` to add the column to your database.

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

Lists all soft-deleted records. Supports the same query parameters as the index endpoint (filters, sorts, search, includes, pagination, fields). The query filters to records where `deletedAt` is not null.

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

Restores a soft-deleted record by setting `deletedAt` back to `null`. The record must be in the trashed state. Returns the restored record as JSON.

### Force Delete Endpoint

```bash title="terminal"
DELETE /api/posts/:id/force-delete
```

Permanently removes the record from the database via a hard Prisma `delete`. The record must be in the trashed state (soft-deleted first). Returns `204 No Content` on success.

## Authorization

Each soft-delete action has its own policy method:

```ts title="src/policies/PostPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  // Permission: posts.trashed
  override viewTrashed(user: any, org?: any): boolean {
    return this.checkPermission(user, 'trashed', org);
  }

  // Permission: posts.restore
  override restore(user: any, _record: any, org?: any): boolean {
    return this.checkPermission(user, 'restore', org);
  }

  // Permission: posts.forceDelete
  override forceDelete(user: any, _record: any, org?: any): boolean {
    return this.checkPermission(user, 'forceDelete', org);
  }
}
```

These methods are already implemented on `ResourcePolicy`, so you only need to override them if you require custom logic.

## Excluding Soft Delete Routes

If you want soft deletes but do not want certain endpoints (e.g., you want to prevent force deletion via the API), use `exceptActions`:

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  softDeletes: true,
  // Allow trashed listing and restore, but no force-delete via API
  exceptActions: ['forceDelete'],
},
```

## Audit Trail Integration

When `hasAuditTrail: true` is also set on the registration, soft delete operations are automatically logged with the appropriate action type:

- Standard `DELETE` -- logged as `deleted`
- `POST /:id/restore` -- logged as `restored`
- `DELETE /:id/force-delete` -- logged as `force_deleted`

Rhino records the restore entry after restoring and the force-delete entry before permanently deleting, so the audit trail captures the full lifecycle of soft-deleted records.

## Guard Behavior

If a request hits a trashed, restore, or force-delete endpoint on a model that does **not** have `softDeletes = true`, Rhino returns a `404` response:

```json title="Response"
{ "message": "This resource does not support soft deletes" }
```

This prevents accidental exposure of soft-delete routes on models that are not configured for it.
