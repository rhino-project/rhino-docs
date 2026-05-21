---
sidebar_position: 9
title: Audit Trail
---

# Audit Trail

Rhino can automatically log all create, update, and delete operations on your models.

## Setup

Add `AuditTrailMixin` to your model:

```python title="blog/models.py"
from rhino.mixins import AuditTrailMixin

class Post(AuditTrailMixin, models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
```

Add the audit middleware:

```python title="settings.py"
MIDDLEWARE = [
    # ...
    'rhino.signals.AuditMiddleware',
]
```

Run migrations (Rhino's `AuditLog` model is included):

```bash title="terminal"
python manage.py migrate
```

## Logged Events

| Action          | When                         | Old Values | New Values |
|-----------------|------------------------------|------------|------------|
| `created`       | Record created               | —          | All fields |
| `updated`       | Record updated               | Changed fields | Changed fields |
| `deleted`       | Record soft-deleted          | —          | —          |
| `force_deleted` | Record permanently deleted   | All fields | —          |
| `restored`      | Record restored from trash   | —          | All fields |

## Excluding Fields

Exclude sensitive fields from audit logs:

```python title="blog/models.py"
class User(AuditTrailMixin, models.Model):
    rhino_audit_exclude = ['password', 'api_key', 'secret_token']
```

Default excluded fields: `['password']`

## Audit Log Fields

| Field          | Description                          |
|----------------|--------------------------------------|
| `content_type` | Model type (polymorphic)             |
| `object_id`    | Record ID                            |
| `action`       | created, updated, deleted, etc.      |
| `old_values`   | JSON of previous values              |
| `new_values`   | JSON of new values                   |
| `user`         | User who performed the action        |
| `organization_id` | Organization context              |
| `ip_address`   | Request IP address                   |
| `user_agent`   | Browser/client user agent            |
| `created_at`   | When the action occurred             |

## Querying Audit Logs

```python title="terminal"
from rhino.models import AuditLog
from django.contrib.contenttypes.models import ContentType

# Get all audit logs for a specific post
ct = ContentType.objects.get_for_model(Post)
logs = AuditLog.objects.filter(content_type=ct, object_id=post.pk)

# Get all create actions
creates = AuditLog.objects.filter(action='created')

# Get all actions by a specific user
user_actions = AuditLog.objects.filter(user=user)

# Get audit logs for an organization
org_logs = AuditLog.objects.filter(organization_id=org.pk)
```

## Example Audit Trail

```text title="Response"
1. POST /api/posts {"title": "Hello"}
   → AuditLog: action=created, new_values={"title": "Hello", "status": "draft"}

2. PUT /api/posts/1 {"title": "Hello World"}
   → AuditLog: action=updated, old_values={"title": "Hello"}, new_values={"title": "Hello World"}

3. DELETE /api/posts/1
   → AuditLog: action=updated (soft delete sets deleted_at)

4. POST /api/posts/1/restore
   → AuditLog: action=restored, new_values={...all fields...}

5. DELETE /api/posts/1/force-delete
   → AuditLog: action=force_deleted, old_values={...all fields...}
```

:::info
The audit middleware stores the current request in thread-local storage, so audit logs automatically capture the user, IP address, and user agent.
:::
