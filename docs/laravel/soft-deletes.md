---
sidebar_position: 6
title: Soft Deletes
---

# Soft Deletes

Models using Laravel's `SoftDeletes` trait automatically get trash, restore, and force-delete endpoints — each with its own authorization policy.

## Setup

Add the `SoftDeletes` trait to your model and ensure the migration has the `softDeletes` column:

```php title="app/Models/Post.php"
use Illuminate\Database\Eloquent\SoftDeletes;

class Post extends Model
{
    use SoftDeletes, HasValidation;
}
```

```php title="database/migrations/create_posts_table.php"
Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->string('title');
    $table->text('content');
    $table->softDeletes(); // adds deleted_at column
    $table->timestamps();
});
```

## Endpoints

| Method | Endpoint | Description | Policy Method |
|--------|----------|-------------|---------------|
| `DELETE` | `/api/posts/{id}` | Soft delete (move to trash) | `delete()` |
| `GET` | `/api/posts/trashed` | List all trashed items | `viewTrashed()` |
| `POST` | `/api/posts/{id}/restore` | Restore from trash | `restore()` |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanently delete | `forceDelete()` |

## Behavior

- **`GET /api/posts`** — excludes soft-deleted records (standard Laravel behavior)
- **`DELETE /api/posts/1`** — sets `deleted_at` timestamp, record stays in database
- **`GET /api/posts/trashed`** — returns only soft-deleted records, with full pagination
- **`POST /api/posts/1/restore`** — clears `deleted_at`, record becomes visible again
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
    "deleted_at": "2025-01-15T10:30:00Z"
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
        "deleted_at": "2025-01-15T10:30:00Z"
    },
    {
        "id": 5,
        "title": "Old Draft",
        "deleted_at": "2025-01-14T08:00:00Z"
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
    "deleted_at": null
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

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    // Permission: posts.trashed
    public function viewTrashed(?Authenticatable $user): bool
    {
        return parent::viewTrashed($user);
    }

    // Permission: posts.restore
    public function restore(?Authenticatable $user, $model): bool
    {
        return parent::restore($user, $model);
    }

    // Permission: posts.forceDelete
    public function forceDelete(?Authenticatable $user, $model): bool
    {
        return parent::forceDelete($user, $model);
    }
}
```

### Role-Based Example

Set up different levels of soft-delete access per role:

```php title="database/seeders/RoleSeeder.php"
// Roles and their permissions
$admin = Role::create([
    'name' => 'Admin',
    'slug' => 'admin',
    'permissions' => ['*'],  // Can do everything
]);

$editor = Role::create([
    'name' => 'Editor',
    'slug' => 'editor',
    'permissions' => [
        'posts.index', 'posts.show', 'posts.store', 'posts.update',
        'posts.destroy',   // Can soft-delete
        'posts.trashed',   // Can view trash
        'posts.restore',   // Can restore from trash
        // NO posts.forceDelete — editors can't permanently delete
    ],
]);

$viewer = Role::create([
    'name' => 'Viewer',
    'slug' => 'viewer',
    'permissions' => [
        'posts.index', 'posts.show',
        // NO delete/trash/restore/forceDelete — viewers are read-only
    ],
]);
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

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    // Only allow users to soft-delete their own posts (unless admin)
    public function delete(?Authenticatable $user, $model): bool
    {
        if ($user->hasPermission('*')) {
            return true;
        }

        return parent::delete($user, $model) && $model->user_id === $user->id;
    }

    // Only admins can force delete
    public function forceDelete(?Authenticatable $user, $model): bool
    {
        return $user && $user->hasPermission('posts.forceDelete');
    }
}
```

## Audit Trail Integration

If your model uses both `SoftDeletes` and `HasAuditTrail`, all soft-delete operations are logged:

- **Soft delete** → audit action: `deleted`
- **Restore** → audit action: `restored`
- **Force delete** → audit action: `force_deleted`

See [Audit Trail](./audit-trail) for details.
