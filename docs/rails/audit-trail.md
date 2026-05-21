---
sidebar_position: 8
title: Audit Trail
---

# Audit Trail

Track every change to your models with automatic audit logging. Know who changed what, when, and what the previous values were.

## Enabling Audit Trail

During `rails rhino:install`, select **Yes** when asked about audit trail. This creates the `audit_logs` migration.

Then add the `HasAuditTrail` concern to any model you want to track:

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation
  include Rhino::HasAuditTrail

  has_discard
end
```

Run the migration:

```bash title="terminal"
rails db:migrate
```

## What Gets Logged

Every model event is automatically captured:

| Event | Action | Old Values | New Values |
|-------|--------|------------|------------|
| Model created | `created` | `null` | All new field values |
| Model updated | `updated` | Changed fields (before) | Changed fields (after) |
| Model soft-deleted | `deleted` | All field values | `null` |
| Model force-deleted | `force_deleted` | All field values | `null` |
| Model restored | `restored` | `null` | All field values |

:::info Only Changed Fields
On updates, only the fields that actually changed are logged — not the entire model. This keeps audit logs clean and easy to read.
:::

## Excluding Sensitive Fields

By default, `password` and `remember_token` are excluded from audit logs. Add more fields with the `rhino_audit_exclude` DSL:

```ruby title="app/models/user.rb"
class User < ApplicationRecord
  include Rhino::HasAuditTrail

  # These fields will never appear in audit logs
  rhino_audit_exclude :password, :remember_token, :api_token, :two_factor_secret, :stripe_id
end
```

## Audit Log Fields

Each audit log entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-increment ID |
| `auditable_type` | string | Full model class (e.g., `Post`) |
| `auditable_id` | integer | Primary key of the audited record |
| `action` | string | `created`, `updated`, `deleted`, `force_deleted`, `restored` |
| `old_values` | JSON | Previous field values (null on create) |
| `new_values` | JSON | New field values (null on delete) |
| `user_id` | integer | ID of the user who made the change |
| `organization_id` | integer | Organization context (multi-tenant) |
| `ip_address` | string | IP address of the request |
| `user_agent` | string | Browser/client user agent string |
| `created_at` | datetime | When the change occurred |

## API Endpoint

Fetch the audit trail for any model instance:

```bash title="terminal"
GET /api/posts/42/audit
GET /api/posts/42/audit?page=1&per_page=20
```

Supports pagination via query parameters.

### Response Example

```json title="Response"
[
    {
        "id": 1,
        "action": "created",
        "user_id": 5,
        "auditable_type": "Post",
        "auditable_id": 42,
        "old_values": null,
        "new_values": {
            "title": "My First Post",
            "content": "Hello world!",
            "status": "draft"
        },
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0 ...",
        "created_at": "2025-01-15T10:30:00Z"
    },
    {
        "id": 2,
        "action": "updated",
        "user_id": 5,
        "auditable_type": "Post",
        "auditable_id": 42,
        "old_values": {
            "status": "draft"
        },
        "new_values": {
            "status": "published"
        },
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0 ...",
        "created_at": "2025-01-15T11:00:00Z"
    },
    {
        "id": 3,
        "action": "updated",
        "user_id": 8,
        "auditable_type": "Post",
        "auditable_id": 42,
        "old_values": {
            "title": "My First Post"
        },
        "new_values": {
            "title": "My First Post (Updated)"
        },
        "ip_address": "10.0.0.5",
        "user_agent": "PostmanRuntime/7.x",
        "created_at": "2025-01-16T14:22:00Z"
    }
]
```

## Querying Audit Logs in Code

The `HasAuditTrail` concern adds an `audit_logs` polymorphic association:

```ruby title="terminal"
# Get all audit logs for a post
logs = post.audit_logs.order(created_at: :desc)

# Get only updates
updates = post.audit_logs.where(action: 'updated')

# Get changes by a specific user
user_changes = post.audit_logs.where(user_id: 5)

# Get recent changes (last 7 days)
recent = post.audit_logs
  .where('created_at >= ?', 7.days.ago)
  .order(created_at: :desc)

# Get who deleted a record
deletion = post.audit_logs.find_by(action: 'deleted')
puts "Deleted by user ##{deletion.user_id} at #{deletion.created_at}"
```

## Context Tracking

Rhino automatically captures request context for each audit entry via `RequestStore`:

- **user_id** — The authenticated user making the change
- **ip_address** — The IP address of the request
- **user_agent** — The browser/client user agent string
- **organization_id** — The current organization (multi-tenant)

This context is set by Rhino's controller before any model operations occur, so audit logs always have the correct metadata.

## Complete Example

Here's how audit trail works in practice:

```ruby title="terminal"
# 1. User creates a post
post = Post.create!(
  title: 'Hello World',
  content: 'My first post',
  status: 'draft'
)
# → Audit log: action=created, new_values={title, content, status}

# 2. User updates the status
post.update!(status: 'published')
# → Audit log: action=updated, old_values={status: "draft"}, new_values={status: "published"}

# 3. User updates title and content
post.update!(
  title: 'Hello World (Revised)',
  content: 'Updated content here'
)
# → Audit log: action=updated, old_values={title, content}, new_values={title, content}

# 4. User soft-deletes the post
post.discard
# → Audit log: action=deleted, old_values={all fields}

# 5. Admin restores the post
post.undiscard
# → Audit log: action=restored, new_values={all fields}

# 6. Admin permanently deletes
post.destroy
# → Audit log: action=force_deleted, old_values={all fields}
```

## Multi-Tenant Audit Logs

When multi-tenancy is enabled, the `organization_id` is automatically captured in each audit log entry. This means you can query audit logs per organization:

```ruby title="terminal"
Rhino::AuditLog.where(organization_id: organization.id)
  .order(created_at: :desc)
  .page(1)
  .per(20)
```

:::tip
The audit trail endpoint respects the same authorization as the parent model. Users can only view audit logs for records they have permission to view.
:::
