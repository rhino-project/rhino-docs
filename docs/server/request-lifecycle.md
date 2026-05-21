---
sidebar_position: 2
title: Request Lifecycle
---

# Request Lifecycle

Every API request flows through Rhino's pipeline — a series of layers that handle authentication, authorization, scoping, querying, and response formatting. Understanding this flow helps you debug issues and know exactly where to customize behavior.

```mermaid
flowchart TD
    A[HTTP Request] --> B[Middleware Layer]
    B --> C[Policy Layer]
    C --> D{Can user perform action?}
    D -->|Allowed| F[Scope Layer]
    D -->|Denied| E[403 Forbidden]
    F --> G{Which records visible?}
    G --> H[Filter by roles/permissions]
    H --> I[Query Builder]
    I --> J[Response Serialization]
    J --> K[Attribute Permissions via Policy]
    K --> L{Which columns visible?}
    L --> M[Filter by roles/permissions]
    M --> N[JSON Response]
```

## 1. Middleware Layer

The first layer your request hits. Middleware runs **before** any controller logic and can reject requests early.

Rhino applies middleware in this order:

1. **Global middleware** — Laravel's default stack (CORS, authentication, etc.)
2. **Model middleware** — Defined via `$middleware` on your model (applies to all actions)
3. **Action middleware** — Defined via `$middlewareActions` (applies to specific actions only)

```php title="app/Models/Post.php"
class Post extends Model
{
    // Applied to ALL routes for this model
    public static array $middleware = ['auth:sanctum'];

    // Applied only to specific actions
    public static array $middlewareActions = [
        'store'   => ['verified'],
        'destroy' => ['can:admin'],
    ];
}
```

If middleware rejects the request, the pipeline stops here and returns the appropriate error (401, 403, 429, etc.).

## 2. Policy Layer

After middleware passes, Rhino checks the **ResourcePolicy** to determine if the authenticated user can perform the requested action.

Each CRUD action maps to a policy method:

| HTTP Method | Action | Policy Method |
|-------------|--------|---------------|
| `GET /posts` | index | `viewAny($user)` |
| `GET /posts/{id}` | show | `view($user, $post)` |
| `POST /posts` | store | `create($user)` |
| `PUT /posts/{id}` | update | `update($user, $post)` |
| `DELETE /posts/{id}` | destroy | `delete($user, $post)` |

The policy checks the user's **roles and permissions** for the current organization. If the user lacks the required permission, a `403 Forbidden` response is returned immediately.

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    // Permission format: posts.viewAny, posts.create, etc.
    // Wildcards supported: posts.* or just *
}
```

See [Policies](./policies) for full details on permission configuration.

## 3. Scope Layer

Once authorized, Rhino determines **which records** the user can see. This is the multi-tenancy boundary.

Scoping ensures users only access data belonging to their current organization:

- Models with `organization_id` are filtered directly
- Nested models are auto-detected — Rhino introspects `BelongsTo` relationships to find the path to the organization
- Custom scopes (via `HasAutoScope`) can add additional filtering

```php title="app/Models/Blog.php"
// Direct: WHERE organization_id = ?
class Blog extends Model
{
    use BelongsToOrganization;
}

// Nested: auto-detected via Comment -> post() -> blog() -> organization_id
class Comment extends Model
{
    use BelongsToOrganization;

    public function post()
    {
        return $this->belongsTo(Post::class);
    }
}
```

See [Multi-Tenancy](./multi-tenancy) for full details.

## 4. Query Builder

With the scope applied, Rhino builds the database query using parameters from the request URL:

| Feature | Query Parameter | Example |
|---------|----------------|---------|
| **Filtering** | `?filter[field]=value` | `?filter[status]=published` |
| **Sorting** | `?sort=field` | `?sort=-created_at` |
| **Searching** | `?search=term` | `?search=laravel` |
| **Pagination** | `?page=N&per_page=N` | `?page=2&per_page=25` |
| **Includes** | `?include=relation` | `?include=user,tags` |
| **Fields** | `?fields[model]=f1,f2` | `?fields[posts]=id,title` |

Only fields declared in `$allowedFilters`, `$allowedSorts`, `$allowedSearch`, `$allowedIncludes`, and `$allowedFields` on your model are accepted. Anything else is silently ignored.

See [Querying](./querying) for full details.

## 5. Response Serialization

The query results are serialized into JSON. For `index` endpoints, Rhino adds pagination headers:

| Header | Description |
|--------|-------------|
| `X-Current-Page` | Current page number |
| `X-Last-Page` | Total number of pages |
| `X-Per-Page` | Items per page |
| `X-Total` | Total number of records |

## 6. Attribute Permissions via Policy

Before sending the response, Rhino checks the policy's `permittedAttributesForShow()` and `hiddenAttributesForShow()` methods to determine which columns are visible based on the user's role:

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasPermission('posts.*')) {
            return []; // Admin sees everything
        }

        return ['internal_notes', 'cost_price']; // Regular users can't see these
    }
}
```

This provides **column-level security** — different users see different fields in the same response, all controlled by permissions.

## 7. JSON Response

The final JSON response is returned to the client. For a single resource:

```json title="Response"
{
  "id": 1,
  "title": "My Post",
  "status": "published",
  "created_at": "2025-01-15T10:30:00Z"
}
```

For a collection (index), the response includes the data array with pagination headers in the HTTP response.

## Summary

```
Request → Middleware → Policy → Scope → Query → Serialize → Hide Columns → Response
```

Each layer is independently configurable through your model properties and policy methods. If something isn't working as expected, trace the request through these layers to identify where the issue occurs.
