---
sidebar_position: 9
title: Nested Operations
---

# Nested Operations

Execute multiple model operations in a single atomic transaction. Create related records, update existing ones, and reference results from previous operations — all in one request.

## Endpoint

```bash title="terminal"
# Without multi-tenancy
POST /api/nested

# With multi-tenancy
POST /api/{organization}/nested
```

:::info Route Path
The route path is configurable in `config/rhino.php`:
```php title="config/rhino.php"
'nested' => [
    'path' => 'nested',  // Change to 'batch' or 'bulk' if you prefer
],
```
:::

## Configuration

```php title="config/rhino.php"
'nested' => [
    'path' => 'nested',            // Route path
    'max_operations' => 50,        // Max operations per request
    'allowed_models' => null,      // null = all registered models, or ['posts', 'comments']
],
```

## Request Format

```json title="Request"
{
    "operations": [
        {
            "action": "create",
            "model": "blogs",
            "data": {
                "title": "My Blog",
                "slug": "my-blog"
            }
        },
        {
            "action": "create",
            "model": "posts",
            "data": {
                "title": "First Post",
                "blog_id": "$0.id"
            }
        }
    ]
}
```

## Supported Actions

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `create` | Create a new record | `model`, `data` |
| `update` | Update an existing record | `model`, `id`, `data` |
| `delete` | Delete a record | `model`, `id` |

## Referencing Previous Results

Use `$N.field` syntax to reference the result of a previous operation:

- `$0.id` — the `id` from the **first** operation's result
- `$1.slug` — the `slug` from the **second** operation's result
- `$2.name` — the `name` from the **third** operation's result

This is essential for creating related records in a single request:

```json title="Request"
{
    "operations": [
        {
            "action": "create",
            "model": "blogs",
            "data": { "title": "Tech Blog", "slug": "tech-blog" }
        },
        {
            "action": "create",
            "model": "posts",
            "data": {
                "title": "Getting Started with Laravel",
                "blog_id": "$0.id",
                "slug": "getting-started"
            }
        },
        {
            "action": "create",
            "model": "comments",
            "data": {
                "content": "Great article!",
                "post_id": "$1.id"
            }
        },
        {
            "action": "update",
            "model": "blogs",
            "id": "$0.id",
            "data": { "description": "A blog about tech" }
        }
    ]
}
```

In this example:
1. Creates a blog → gets `id` (e.g., 5)
2. Creates a post referencing `$0.id` → `blog_id: 5`
3. Creates a comment referencing `$1.id` → `post_id` from the post
4. Updates the blog using `$0.id` → updates blog 5

## Response Format

```json title="Response"
{
    "results": [
        {
            "model": "blogs",
            "action": "create",
            "id": 5,
            "data": {
                "id": 5,
                "title": "Tech Blog",
                "slug": "tech-blog",
                "created_at": "2025-01-15T10:00:00Z"
            }
        },
        {
            "model": "posts",
            "action": "create",
            "id": 12,
            "data": {
                "id": 12,
                "title": "Getting Started with Laravel",
                "blog_id": 5,
                "slug": "getting-started",
                "created_at": "2025-01-15T10:00:00Z"
            }
        },
        {
            "model": "comments",
            "action": "create",
            "id": 1,
            "data": {
                "id": 1,
                "content": "Great article!",
                "post_id": 12,
                "created_at": "2025-01-15T10:00:00Z"
            }
        },
        {
            "model": "blogs",
            "action": "update",
            "id": 5,
            "data": {
                "id": 5,
                "title": "Tech Blog",
                "slug": "tech-blog",
                "description": "A blog about tech",
                "updated_at": "2025-01-15T10:00:00Z"
            }
        }
    ]
}
```

## Atomicity

All operations run inside a database transaction. If **any** operation fails — validation error, authorization failure, or database error — the **entire batch is rolled back**. No partial results.

```json title="Request"
// If operation 2 fails validation, operation 0 and 1 are also rolled back
{
    "operations": [
        { "action": "create", "model": "blogs", "data": { "title": "Blog" } },
        { "action": "create", "model": "posts", "data": { "title": "Post", "blog_id": "$0.id" } },
        { "action": "create", "model": "posts", "data": { } }  // ← Missing required fields
    ]
}
```

Response (422):
```json title="Response"
{
    "message": "Validation failed.",
    "errors": {
        "operations.2.data.title": ["The title field is required"]
    }
}
```

Nothing is created — the blog and first post are rolled back.

## Authorization

Each operation is individually authorized using the model's policy. The user must have permission for every action:

- `create` on `blogs` → checks `blogs.store` permission
- `create` on `posts` → checks `posts.store` permission
- `update` on `blogs` → checks `blogs.update` permission
- `delete` on `posts` → checks `posts.destroy` permission

If any permission check fails, the entire batch is rejected with a 403.

## Validation

Each operation is validated by the [request class](./validation) of its own model and action: a `create`
operation runs `{Model}StoreRequest`, an `update` operation runs `{Model}UpdateRequest` with `record()`
populated by an organization-scoped lookup of the row being updated. `action()` is `'store'` / `'update'`
as usual, and the class's `validated()` output — merged with the resolved references — is what gets
written. A model with no request class for that action falls back to its model-level rules. All
operations are validated before any of them execute.

:::warning `routeGroup()` is `null` inside nested operations
`POST /nested` is registered as a single route outside the per-group loop, so it carries no `route_group`
default and `$this->routeGroup()` returns `null` for every operation in the batch — even though the route
sits under the tenant prefix and `$this->organization()` **is** populated from it.

A rule written as `$this->routeGroup() === 'admin' ? … : …` therefore takes its non-admin branch in a
nested write. If a rule must vary by group, key it off something that survives the trip —
`$this->organization()`, `$this->user()`'s role, or `$this->action()` — or make the group-restricted
branch the stricter one so the nested path fails closed.
:::

:::note `$N.field` references never reach the request class
A cross-operation reference such as `"blog_id": "$0.id"` is stripped from the data before validation and
merged back into the write payload afterwards, so a request class can never see — or reject — a
placeholder. The rules declared for a referenced field are skipped for that operation, `required`
included, because the client did supply a value; it just is not known yet.
:::

Failures keep the nested envelope, keyed by operation index:

```json title="422 Unprocessable Entity"
{
    "message": "Validation failed.",
    "errors": { "operations.0.data.title": ["Every post needs a title."] }
}
```

A request class whose `authorize()` returns false rejects the whole batch with the same `403` a policy
denial returns: `{"message":"This action is unauthorized."}`.

## Real-World Examples

### E-Commerce: Create Order with Items

```json title="Request"
{
    "operations": [
        {
            "action": "create",
            "model": "orders",
            "data": {
                "customer_name": "John Doe",
                "shipping_address": "123 Main St",
                "status": "pending"
            }
        },
        {
            "action": "create",
            "model": "order_items",
            "data": {
                "order_id": "$0.id",
                "product_id": 42,
                "quantity": 2,
                "unit_price": 29.99
            }
        },
        {
            "action": "create",
            "model": "order_items",
            "data": {
                "order_id": "$0.id",
                "product_id": 15,
                "quantity": 1,
                "unit_price": 49.99
            }
        }
    ]
}
```

### CMS: Create Page with Sections

```json title="Request"
{
    "operations": [
        {
            "action": "create",
            "model": "pages",
            "data": { "title": "About Us", "slug": "about-us" }
        },
        {
            "action": "create",
            "model": "sections",
            "data": {
                "page_id": "$0.id",
                "title": "Our Mission",
                "content": "We build great software.",
                "order": 1
            }
        },
        {
            "action": "create",
            "model": "sections",
            "data": {
                "page_id": "$0.id",
                "title": "Our Team",
                "content": "Meet the people behind it all.",
                "order": 2
            }
        }
    ]
}
```

### Update Multiple Records

```json title="Request"
{
    "operations": [
        {
            "action": "update",
            "model": "posts",
            "id": 1,
            "data": { "status": "archived" }
        },
        {
            "action": "update",
            "model": "posts",
            "id": 2,
            "data": { "status": "archived" }
        },
        {
            "action": "update",
            "model": "posts",
            "id": 3,
            "data": { "status": "archived" }
        }
    ]
}
```

:::warning Operation Limits
The default maximum is 50 operations per request. This can be changed in config, but keep it reasonable for database performance.
:::
