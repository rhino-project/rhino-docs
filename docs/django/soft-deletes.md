---
sidebar_position: 7
title: Soft Deletes
---

# Soft Deletes

Rhino provides built-in soft delete support via the `SoftDeleteMixin`.

## Setup

Add `SoftDeleteMixin` to your model:

```python title="blog/models.py"
from rhino.mixins import SoftDeleteMixin

class Post(SoftDeleteMixin, models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
```

The mixin adds a `deleted_at` field automatically. Create a migration:

```bash title="terminal"
python manage.py makemigrations
python manage.py migrate
```

## Auto-Generated Endpoints

When a model uses `SoftDeleteMixin`, Rhino automatically registers these additional endpoints:

| Method   | Endpoint                        | Description                |
|----------|---------------------------------|----------------------------|
| `DELETE` | `/api/posts/{id}`               | Soft delete (sets deleted_at) |
| `GET`    | `/api/posts/trashed`            | List soft-deleted records  |
| `POST`   | `/api/posts/{id}/restore`       | Restore a soft-deleted record |
| `DELETE` | `/api/posts/{id}/force-delete`  | Permanently delete         |

## Behavior

### Default Queries Exclude Deleted Records

```python title="terminal"
Post.objects.all()           # Only active records
Post.all_objects.all()       # All records including deleted
Post.objects.only_trashed()  # Only soft-deleted records
```

### Soft Delete

```text title="Request"
DELETE /api/posts/1

HTTP/1.1 204 No Content
```

The record's `deleted_at` is set to the current timestamp. It no longer appears in `GET /api/posts`.

### List Trashed

```text title="Response"
GET /api/posts/trashed

HTTP/1.1 200 OK
[
  {
    "id": 1,
    "title": "Deleted Post",
    "deleted_at": "2025-01-15T10:30:00Z"
  }
]
```

### Restore

```text title="Response"
POST /api/posts/1/restore

HTTP/1.1 200 OK
{
  "id": 1,
  "title": "Restored Post",
  "deleted_at": null
}
```

### Force Delete

```text title="Request"
DELETE /api/posts/1/force-delete

HTTP/1.1 204 No Content
```

The record is permanently removed from the database.

## Authorization

Soft delete actions have their own policy methods:

```python title="blog/policies.py"
class PostPolicy(ResourcePolicy):
    slug = 'posts'

    def view_trashed(self, user, organization=None):
        return self._check_permission(user, 'trashed', organization)

    def restore(self, user, obj, organization=None):
        return self._check_permission(user, 'restore', organization)

    def force_delete(self, user, obj, organization=None):
        return self._check_permission(user, 'force_delete', organization)
```

## Audit Trail Integration

When combined with `AuditTrailMixin`, soft delete operations are logged:

| Action          | Logged When              |
|-----------------|--------------------------|
| `updated`       | Record soft-deleted      |
| `restored`      | Record restored          |
| `force_deleted` | Record permanently deleted |
