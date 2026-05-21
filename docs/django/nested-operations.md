---
sidebar_position: 10
title: Nested Operations
---

# Nested Operations

Rhino supports batch operations that execute multiple create, update, and delete actions in a single atomic transaction.

## Endpoint

```text title="Request"
POST /api/nested
```

With multi-tenancy (route prefix):
```text title="Request"
POST /api/{organization}/nested
```

## Configuration

```python title="settings.py"
RHINO = {
    'NESTED': {
        'PATH': 'nested',          # URL path
        'MAX_OPERATIONS': 50,      # Maximum operations per request
        'ALLOWED_MODELS': None,    # None = all registered models
    },
}
```

## Request Format

```json title="Request"
{
    "operations": [
        {
            "model": "posts",
            "action": "create",
            "data": {"title": "New Post", "content": "Hello"}
        },
        {
            "model": "posts",
            "action": "update",
            "id": 1,
            "data": {"title": "Updated Title"}
        },
        {
            "model": "categories",
            "action": "delete",
            "id": 5
        }
    ]
}
```

## Supported Actions

| Action   | Required Fields          | Description          |
|----------|--------------------------|----------------------|
| `create` | `model`, `data`          | Create a new record  |
| `update` | `model`, `id`, `data`    | Update an existing record |
| `delete` | `model`, `id`            | Delete a record      |

## Response Format

```json title="Response"
{
    "results": [
        {
            "action": "create",
            "model": "posts",
            "data": {"id": 10, "title": "New Post", "content": "Hello"}
        },
        {
            "action": "update",
            "model": "posts",
            "data": {"id": 1, "title": "Updated Title"}
        },
        {
            "action": "delete",
            "model": "post",
            "id": 5
        }
    ]
}
```

## Atomicity

All operations run inside a database transaction. If any operation fails:

1. All previous operations are rolled back
2. An error response is returned with details
3. No records are modified

```json title="Response"
HTTP/1.1 422 Unprocessable Entity
{
    "detail": "Transaction failed: Post matching query does not exist."
}
```

## Authorization

Each operation is checked individually. The authenticated user must have permission for each action on each model.

## Validation

Each operation validates its data against the model's validation rules before execution. If validation fails, the entire batch is rolled back.

## Examples

### E-Commerce: Create Order with Items

```json title="Request"
{
    "operations": [
        {
            "model": "orders",
            "action": "create",
            "data": {"customer_id": 1, "status": "pending"}
        },
        {
            "model": "order-items",
            "action": "create",
            "data": {"order_id": 1, "product_id": 5, "quantity": 2}
        },
        {
            "model": "order-items",
            "action": "create",
            "data": {"order_id": 1, "product_id": 8, "quantity": 1}
        }
    ]
}
```

### CMS: Update Page and Sections

```json title="Request"
{
    "operations": [
        {
            "model": "pages",
            "action": "update",
            "id": 1,
            "data": {"title": "Updated Page Title"}
        },
        {
            "model": "sections",
            "action": "create",
            "data": {"page_id": 1, "content": "New section", "position": 3}
        },
        {
            "model": "sections",
            "action": "delete",
            "id": 7
        }
    ]
}
```

:::warning
The `MAX_OPERATIONS` setting limits the number of operations per request to prevent abuse. Default is 50.
:::
