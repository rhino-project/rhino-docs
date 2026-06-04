---
sidebar_position: 10
title: Nested Operations
---

# Nested Operations

Rhino provides a batch endpoint that allows multiple create and update operations to be executed atomically in a single database transaction. This is useful for saving complex forms, parent-child records, or any scenario where multiple models need to be modified together.

## Endpoint

```
POST /api/nested
```

When multi-tenancy is enabled with URL prefix mode:

```
POST /api/:organization/nested
```

## Request Body Format

The request body must contain an `operations` array. Each operation specifies the model, the action (`create` or `update`), and the data:

```json title="Request"
{
  "operations": [
    {
      "model": "posts",
      "action": "create",
      "data": {
        "title": "New Post",
        "content": "Post content here"
      }
    },
    {
      "model": "posts",
      "action": "update",
      "id": 5,
      "data": {
        "title": "Updated Title"
      }
    },
    {
      "model": "comments",
      "action": "create",
      "data": {
        "post_id": 5,
        "body": "A new comment"
      }
    }
  ]
}
```

### Operation Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | `string` | Yes | The model slug (must match a key in `src/rhino.config.ts` models) |
| `action` | `string` | Yes | Either `'create'` or `'update'` |
| `id` | `number \| string` | For updates | The ID of the record to update |
| `data` | `object` | Yes | The data payload for the operation |

## Response Format

On success, the endpoint returns a `results` array with the outcome of each operation:

```json title="Response"
{
  "results": [
    {
      "model": "posts",
      "id": 42,
      "action": "created",
      "data": { "id": 42, "title": "New Post", "content": "Post content here" }
    },
    {
      "model": "posts",
      "id": 5,
      "action": "updated",
      "data": { "id": 5, "title": "Updated Title", "content": "..." }
    },
    {
      "model": "comments",
      "id": 18,
      "action": "created",
      "data": { "id": 18, "post_id": 5, "body": "A new comment" }
    }
  ]
}
```

Each result includes:
- `model` -- the model slug
- `id` -- the record's primary key (assigned after creation or confirmed after update)
- `action` -- either `'created'` or `'updated'`
- `data` -- the full serialized record

## Transaction Wrapping

All operations in a single request are executed inside a database transaction. If any operation fails (validation error, authorization denial, database constraint violation), the entire transaction is rolled back and no changes are persisted.

This guarantees atomicity: either all operations succeed, or none of them do.

## Create vs Update Detection

The `action` field explicitly determines whether a create or update is performed:

- `action: 'create'` -- creates a new record via the Prisma delegate's `create`
- `action: 'update'` -- loads the existing record by `id`, merges the data, and updates it via `update`

For update operations, the `id` field is **required**. A `422` error is returned if `id` is missing on an update operation.

## Validation

Each operation is individually validated. The controller resolves permitted fields from the policy (`permittedAttributesForCreate` or `permittedAttributesForUpdate`) and then runs Zod format validation against the model's registered schema:

- Forbidden fields (not in the permitted list) return **403 Forbidden**
- Format validation failures return **422 Unprocessable Entity**

Validation errors are prefixed with the operation index for clarity:

```json title="Response"
{
  "message": "Validation failed.",
  "errors": {
    "operations.0.data.title": ["The title field is required."],
    "operations.2.data.body": ["The body field must be a string."]
  }
}
```

All operations are validated **before** any database writes begin. If any operation fails validation, the entire request is rejected.

## Authorization

Each operation is individually authorized:

- Create operations check the `create` policy method
- Update operations load the record (with organization scoping) and check the `update` policy method

Authorization is checked **after** validation but **before** the database transaction begins.

## Organization Scoping

When multi-tenancy is enabled:
- Create operations automatically receive the `organization_id` from the current context
- Update operations are scoped to the current organization (the record must belong to the org)

## Configuration

Configure nested operations in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
// Inside the RhinoConfig object passed to RhinoModule.forRoot()
nested: {
  path: 'nested',         // Route path (default: 'nested')
  maxOperations: 50,      // Maximum operations per request (default: 50)
  allowedModels: null,    // null = all registered models
},
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'nested'` | The URL path segment for the nested endpoint. |
| `maxOperations` | `number` | `50` | Maximum number of operations allowed in a single request. Requests exceeding this limit return a `422` error. |
| `allowedModels` | `string[] \| null` | `null` | When `null`, all registered models can be used. When an array, only the listed model slugs are permitted. |

### Restricting Allowed Models

To limit which models can be used in nested operations:

```ts title="src/rhino.config.ts"
nested: {
  allowedModels: ['posts', 'comments', 'tags'],
},
```

Operations targeting unlisted models return a `422` error:

```json title="Response"
{
  "message": "Operation not allowed.",
  "errors": {
    "operations.0.model": ["Model \"users\" is not allowed for nested operations."]
  }
}
```

## Error Handling

The endpoint validates at multiple levels and returns appropriate errors:

| Check | Status | When |
|-------|--------|------|
| Missing `operations` array | `422` | Request body does not contain a valid `operations` array |
| Invalid operation structure | `422` | An operation is missing required fields (`model`, `action`, `data`) |
| Invalid action value | `422` | Action is not `'create'` or `'update'` |
| Missing `id` for update | `422` | Update operation does not include an `id` |
| Exceeds `maxOperations` | `422` | Too many operations in a single request |
| Disallowed model | `422` | Model is not in `allowedModels` list |
| Unknown model | `422` | Model slug does not exist in `src/rhino.config.ts` |
| Validation failure | `422` | Operation data does not pass model validation |
| Authorization failure | `403` | User lacks permission for the operation |
| Record not found (update) | `404` | The `id` does not match an existing record in scope |

## Example: Saving a Form with Related Records

```bash title="terminal"
POST /api/nested

{
  "operations": [
    {
      "model": "blog-posts",
      "action": "create",
      "data": {
        "title": "My New Blog Post",
        "content": "Content here...",
        "status": "draft"
      }
    },
    {
      "model": "tags",
      "action": "create",
      "data": {
        "name": "NestJS",
        "slug": "nestjs"
      }
    }
  ]
}
```
