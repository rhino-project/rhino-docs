---
sidebar_position: 5
title: Policies
---

# Policies & Permissions

Rhino uses Laravel's built-in policy system to authorize every API action. Rather than writing authorization logic by hand for each resource, Rhino provides a base `ResourcePolicy` class that automatically checks permissions against the authenticated user's role. All you need to do is create a policy class that extends it.

## How Policies Work

Every time a CRUD request hits a Rhino-generated endpoint, the corresponding policy method is invoked before the action executes. The flow looks like this:

1. A request comes in (e.g., `POST /api/posts`).
2. Laravel auto-resolves the policy for the `Post` model using its standard naming convention (`PostPolicy`).
3. The matching policy method is called (e.g., `create()`).
4. The base `ResourcePolicy` checks whether the authenticated user has the required permission (e.g., `posts.store`).
5. If the user has the permission, the action proceeds. If not, a `403 Forbidden` response is returned.

:::info
Policy resolution follows Laravel's conventions. A `Post` model automatically resolves to `App\Policies\PostPolicy`. You do not need to register policies manually as long as you follow this convention.
:::

## ResourcePolicy

`ResourcePolicy` is the base class that all Rhino policies extend. It provides default implementations for every CRUD action, each of which delegates to a permission check using the resource slug and action name.

**Action to Policy Method to Permission mapping:**

| API Action | Policy Method | Permission Checked |
|---|---|---|
| `GET /posts` (index) | `viewAny()` | `posts.index` |
| `GET /posts/{id}` (show) | `view()` | `posts.show` |
| `POST /posts` (store) | `create()` | `posts.store` |
| `PUT /posts/{id}` (update) | `update()` | `posts.update` |
| `DELETE /posts/{id}` (destroy) | `delete()` | `posts.destroy` |
| `GET /posts/trashed` | `viewTrashed()` | `posts.trashed` |
| `POST /posts/{id}/restore` | `restore()` | `posts.restore` |
| `DELETE /posts/{id}/force-delete` | `forceDelete()` | `posts.forceDelete` |

Each method in `ResourcePolicy` calls `hasPermission()` on the authenticated user with the corresponding permission string. You never need to write this logic yourself unless you want to customize it.

## Creating a Policy

A minimal policy requires no method implementations at all. The base class handles everything:

```php title="app/Policies/PostPolicy.php"
<?php

namespace App\Policies;

use Rhino\LaravelApi\Policies\ResourcePolicy;

class PostPolicy extends ResourcePolicy
{
    // The resource slug used for permission checks
    // If not set, auto-resolved from config/rhino.php
    protected $resourceSlug = 'posts';
}
```

That is the entire policy. The `ResourcePolicy` parent class checks `hasPermission()` automatically for every CRUD action. If the user has the matching permission, the action is allowed. If not, it is denied.

:::tip
If your resource slug in `config/rhino.php` matches what would be auto-resolved (the plural, lowercase, kebab-case form of the model name), you can omit the `$resourceSlug` property entirely. It is only needed when you want to override the default.
:::

## Permission Format

Permissions follow a consistent dot-notation format:

```
{resource_slug}.{action}
```

**Examples:**

- `posts.index` — can list posts
- `posts.show` — can view a single post
- `posts.store` — can create posts
- `posts.update` — can update posts
- `posts.destroy` — can delete posts
- `posts.trashed` — can view soft-deleted posts
- `posts.restore` — can restore soft-deleted posts
- `posts.forceDelete` — can permanently delete posts
- `blogs.index` — can list blogs
- `comments.store` — can create comments

## Wildcard Permissions

Rhino supports wildcard permissions for broad access grants:

| Permission | Meaning |
|---|---|
| `*` | Full access to everything (superadmin) |
| `posts.*` | All actions on posts (read, write, delete, trash, restore, etc.) |
| `posts.index` | Exact match — only the list action on posts |

Wildcards are checked hierarchically. When `hasPermission('posts.store')` is called, the system checks for an exact match first, then for `posts.*`, and finally for `*`.

:::warning
The `*` wildcard grants unrestricted access to every resource and every action. Only assign it to fully trusted administrator roles.
:::

## How Permissions Are Stored

Rhino supports two permission sources, used depending on whether the request is organization-scoped or not:

### User-level permissions (`users.permissions`)

For non-tenant route groups (e.g., `driver`, `admin`, `default`), permissions are stored directly on the `users` table as a JSON column:

```
id | name         | email              | permissions (JSON)
1  | Alice Driver | alice@example.com  | ["trips.index", "trips.show", "trucks.*"]
2  | Bob Admin    | bob@example.com    | ["*"]
3  | Carol User   | carol@example.com  | ["posts.index", "posts.show"]
```

This is the standard permission model and works for all apps, including non-multi-tenant apps.

### Organization-scoped permissions (`user_roles.permissions`)

For the `tenant` route group, permissions are stored per-organization via the `user_roles` pivot table:

```
id | user_id | organization_id | role_id | permissions (JSON)
1  | 1       | 1               | 1       | ["*"]
2  | 2       | 1               | 2       | ["posts.index", "posts.show", "posts.store"]
3  | 1       | 2               | 2       | ["posts.index", "posts.show"]
```

This enables multi-tenant permission models where the same user can hold different roles and permissions in different organizations.

### Resolution

When `hasPermission()` is called:

1. **Organization present** (tenant route group) → checks `user_roles.permissions` for that organization
2. **No organization** (any other route group) → checks `users.permissions` directly

## Complete Setup Examples

### Non-Tenant App (User-Level Permissions)

For apps without multi-tenancy, assign permissions directly on the user:

```php title="database/seeders/UserSeeder.php"
// Assign permissions to users
$admin->update(['permissions' => ['*']]);

$editor->update(['permissions' => [
    'posts.index', 'posts.show', 'posts.store', 'posts.update',
    'comments.*',
]]);

$viewer->update(['permissions' => [
    'posts.index', 'posts.show',
    'comments.index', 'comments.show',
]]);
```

### Multi-Tenant App (Organization-Scoped Permissions)

For multi-tenant apps, create roles and assign users to organizations with per-org permissions:

```php title="database/seeders/RoleSeeder.php"
// 1. Create roles
$admin = Role::create(['name' => 'Admin', 'slug' => 'admin']);
$editor = Role::create(['name' => 'Editor', 'slug' => 'editor']);

// 2. Assign user to organization with permissions
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $organization->id,
    'role_id' => $admin->id,
    'permissions' => ['*'],
]);
```

### Hybrid App (Both)

For hybrid apps with tenant and non-tenant route groups, use both:

```php title="database/seeders/UserSeeder.php"
// User-level permissions for non-tenant routes (e.g., driver app)
$driver->update(['permissions' => ['trips.index', 'trips.show', 'trucks.*']]);

// Organization-scoped permissions for tenant routes
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $organization->id,
    'role_id' => $admin->id,
    'permissions' => ['*'],
]);
```

### 3. What Each Role Can Do

Here is a breakdown of what each role is authorized to perform on the `posts` resource:

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| List posts | Yes | Yes | Yes |
| View post | Yes | Yes | Yes |
| Create post | Yes | Yes | No |
| Update post | Yes | Yes | No |
| Delete post | Yes | No | No |
| View trashed | Yes | No | No |
| Restore | Yes | No | No |
| Force delete | Yes | No | No |

The Admin role has `*`, so every action is allowed. The Editor role has explicit `posts.index`, `posts.show`, `posts.store`, and `posts.update` permissions, so they can read and write but not delete. The Viewer role only has `posts.index` and `posts.show`, restricting them to read-only access.

## Attribute Permissions

Beyond action-level authorization (can this user create/update/delete?), policies control **which fields** a user can read and write. This is handled through the `HasPermittedAttributes` contract, which `ResourcePolicy` implements by default.

### Field Visibility (Read)

Control which columns are visible in API responses using two complementary methods:

| Method | Purpose |
|---|---|
| `permittedAttributesForShow()` | Whitelist — only these fields are visible. Use `['*']` to allow all. |
| `hiddenAttributesForShow()` | Blacklist — these fields are always hidden, even if permitted. |

```php title="app/Policies/UserPolicy.php"
<?php

namespace App\Policies;

use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Policies\ResourcePolicy;

class UserPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'users';

    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) {
            return ['*']; // Admins see everything
        }

        return ['id', 'name', 'avatar']; // Others see limited fields
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) {
            return [];
        }

        return ['stripe_id', 'internal_notes']; // Always hidden for non-admins
    }
}
```

When `permittedAttributesForShow()` returns a specific list (not `['*']`), all columns **not** in that list are automatically hidden. The `hiddenAttributesForShow()` results are merged on top, so fields can be hidden via either method.

On the model side, the `HidableColumns` trait calls these methods when serializing. The hidden fields are stripped from every API response automatically.

:::info
Both methods receive `null` when there is no authenticated user (e.g., public endpoints). Always handle the `null` case.
:::

### Field Permissions (Write)

Control which fields a user can submit on `store` (create) and `update` actions:

| Method | Purpose |
|---|---|
| `permittedAttributesForCreate()` | Fields the user can set when creating a resource |
| `permittedAttributesForUpdate()` | Fields the user can set when updating a resource |

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) {
            return ['*']; // Admins can set any field
        }

        return ['title', 'content']; // Editors can only set title and content
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) {
            return ['*'];
        }

        return ['title', 'content'];
    }
}
```

When a user submits fields they are not permitted to set, the API returns a **403 Forbidden** with a clear error message:

```json title="Response"
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

:::info
Forbidden fields are explicitly rejected with a 403 response, making it clear to API consumers which fields they cannot set.
:::

### Default Behavior

By default, `ResourcePolicy` returns `['*']` for all permitted attribute methods and `[]` for hidden attributes. This means **all fields are allowed** unless you explicitly restrict them in your policy.

### Using `hasRole()` Helper

`ResourcePolicy` provides a `hasRole()` helper that checks the user's role within the current organization context:

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        // hasRole checks the user's role in the current request's organization
        if ($this->hasRole($user, 'admin')) {
            return ['*'];
        }

        if ($this->hasRole($user, 'editor')) {
            return ['title', 'content', 'category_id'];
        }

        return ['title', 'content'];
    }
}
```

## Include Authorization

When a request uses the `?include` query parameter to eager-load relationships, Rhino performs an additional authorization check. It verifies that the authenticated user has `viewAny` permission on the included resource before loading it.

**Example request:**

```
GET /api/posts?include=comments
```

Rhino checks whether the user has `comments.index` permission. If the user does not have that permission, the request is rejected with a `403 Forbidden`:

```json title="Response"
{
    "message": "You do not have permission to include comments."
}
```

This means that even if a user has full access to posts, they cannot eager-load relationships they are not authorized to view. Each included resource is independently authorized.

:::warning
This applies to all includes, including nested ones. A request like `?include=comments.author` checks permissions on both `comments` and the author resource.
:::

## Organization-Scoped Permissions

In multi-tenant applications, permissions are evaluated per organization. A user can hold different roles in different organizations, and permission checks respect this context.

```php title="app/Models/User.php"
// User is admin in Org A
$user->hasPermission('posts.store', $orgA);  // true

// Same user is viewer in Org B
$user->hasPermission('posts.store', $orgB);  // false
```

The organization context is automatically resolved from the current request in Rhino's middleware. When a user makes an API call scoped to a specific organization, the permission check uses the role assigned to that user within that organization.

:::tip
This means you do not need to manually pass the organization when using policies through Rhino's API endpoints. The organization is resolved from the request context (typically via a header or URL segment). The explicit `$organization` parameter is only needed when calling `hasPermission()` directly in your own code.
:::

## Custom Policy Methods

While the base `ResourcePolicy` handles most cases, you can override any policy method to add custom authorization logic. A common pattern is restricting users to only modify their own records:

```php title="app/Policies/PostPolicy.php"
<?php

namespace App\Policies;

use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Policies\ResourcePolicy;

class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    // Only allow users to update their own posts (unless admin)
    public function update(?Authenticatable $user, $post): bool
    {
        if ($user->hasPermission('*')) {
            return true;
        }

        return parent::update($user, $post) && $post->user_id === $user->id;
    }
}
```

In this example, the `update()` method first checks if the user is a superadmin (has the `*` permission). If not, it calls the parent method to verify the user has `posts.update` permission **and** checks that the post belongs to the user. Both conditions must be true for the update to proceed.

You can apply this pattern to any policy method:

```php title="app/Policies/PostPolicy.php"
// Only allow viewing unpublished posts if user is the author
public function view(?Authenticatable $user, $post): bool
{
    if (!parent::view($user, $post)) {
        return false;
    }

    if (!$post->is_published && $post->user_id !== $user->id) {
        return false;
    }

    return true;
}

// Only allow deletion within 24 hours of creation
public function delete(?Authenticatable $user, $post): bool
{
    if ($user->hasPermission('*')) {
        return true;
    }

    return parent::delete($user, $post)
        && $post->created_at->diffInHours(now()) < 24;
}
```

:::tip
Always call `parent::methodName()` in your overrides to preserve the base permission check. Skipping the parent call means the permission system is bypassed for that action.
:::

## Error Responses

When authorization fails for any reason -- missing permission, failed custom logic, or unauthenticated access -- Rhino returns a standard error response:

```json title="Response"
{
    "message": "This action is unauthorized."
}
```

**HTTP status:** `403 Forbidden`

If the user is not authenticated at all and the route requires authentication, Laravel's auth middleware returns:

```json title="Response"
{
    "message": "Unauthenticated."
}
```

**HTTP status:** `401 Unauthorized`
