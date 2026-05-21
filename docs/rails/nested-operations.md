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
The route path is configurable in `config/initializers/rhino.rb`:
```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.nested[:path] = 'nested'  # Change to 'batch' or 'bulk' if you prefer
end
```
:::

## Configuration

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.nested[:path] = 'nested'            # Route path
  c.nested[:max_operations] = 50        # Max operations per request
  c.nested[:allowed_models] = nil       # nil = all registered models, or ['posts', 'comments']
end
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
                "title": "Getting Started with Rails",
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
                "title": "Getting Started with Rails",
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

All operations run inside an `ActiveRecord::Base.transaction` block. If **any** operation fails — validation error, authorization failure, or database error — the **entire batch is rolled back**. No partial results.

```json title="Request"
// If operation 2 fails validation, operation 0 and 1 are also rolled back
{
    "operations": [
        { "action": "create", "model": "blogs", "data": { "title": "Blog" } },
        { "action": "create", "model": "posts", "data": { "title": "Post", "blog_id": "$0.id" } },
        { "action": "create", "model": "posts", "data": { } }
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

Each operation's data is validated against the model's validation rules (including role-based rules). All validations run before any operations execute.

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
