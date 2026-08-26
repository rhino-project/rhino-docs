---
sidebar_position: 8
title: Audit Trail
---

# Audit Trail

Track every change to your models with automatic audit logging. Know who changed what, when, and what the previous values were.

## Enabling Audit Trail

During `php artisan rhino:install`, select **Yes** when asked about audit trail. This creates the `audit_logs` migration.

Then add the `HasAuditTrail` trait to any model you want to track:

```php title="app/Models/Post.php"
use Rhino\LaravelApi\Traits\HasAuditTrail;

class Post extends Model
{
    use SoftDeletes, HasValidation, HasAuditTrail;
}
```

Run the migration:

```bash title="terminal"
php artisan migrate
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

By default, `password` and `remember_token` are excluded from audit logs. Add more fields with the `$auditExclude` property:

```php title="app/Models/User.php"
class User extends Model
{
    use HasAuditTrail;

    // These fields will never appear in audit logs
    protected $auditExclude = [
        'password',
        'remember_token',
        'api_token',
        'two_factor_secret',
        'stripe_id',
    ];
}
```

## Audit Log Fields

Each audit log entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-increment ID |
| `auditable_type` | string | Full model class (e.g., `App\Models\Post`) |
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
        "model_type": "App\\Models\\Post",
        "model_id": 42,
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
        "model_type": "App\\Models\\Post",
        "model_id": 42,
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
        "model_type": "App\\Models\\Post",
        "model_id": 42,
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

The `HasAuditTrail` trait adds an `auditLogs()` polymorphic relationship:

```php title="app/Models/Post.php"
// Get all audit logs for a post
$logs = $post->auditLogs()->latest()->get();

// Get only updates
$updates = $post->auditLogs()->where('action', 'updated')->get();

// Get changes by a specific user
$userChanges = $post->auditLogs()->where('user_id', 5)->get();

// Get recent changes (last 7 days)
$recent = $post->auditLogs()
    ->where('created_at', '>=', now()->subDays(7))
    ->latest()
    ->get();

// Get who deleted a record
$deletion = $post->auditLogs()->where('action', 'deleted')->first();
echo "Deleted by user #{$deletion->user_id} at {$deletion->created_at}";
```

## Complete Example

Here's how audit trail works in practice:

```php title="app/Models/Post.php"
// 1. User creates a post
$post = Post::create([
    'title' => 'Hello World',
    'content' => 'My first post',
    'status' => 'draft',
]);
// → Audit log: action=created, new_values={title, content, status}

// 2. User updates the status
$post->update(['status' => 'published']);
// → Audit log: action=updated, old_values={status: "draft"}, new_values={status: "published"}

// 3. User updates title and content
$post->update([
    'title' => 'Hello World (Revised)',
    'content' => 'Updated content here',
]);
// → Audit log: action=updated, old_values={title, content}, new_values={title, content}

// 4. User soft-deletes the post
$post->delete();
// → Audit log: action=deleted, old_values={all fields}

// 5. Admin restores the post
$post->restore();
// → Audit log: action=restored, new_values={all fields}

// 6. Admin permanently deletes
$post->forceDelete();
// → Audit log: action=force_deleted, old_values={all fields}
```

## Multi-Tenant Audit Logs

When multi-tenancy is enabled, the `organization_id` is automatically captured in each audit log entry. This means you can query audit logs per organization:

```php title="app/Models/AuditLog.php"
AuditLog::where('organization_id', $organization->id)
    ->latest()
    ->paginate(20);
```

:::tip
The audit trail endpoint respects the same authorization as the parent model. Users can only view audit logs for records they have permission to view.
:::
