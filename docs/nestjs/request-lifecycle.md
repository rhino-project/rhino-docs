---
sidebar_position: 2
title: Request Lifecycle
---

# Request Lifecycle

Every Rhino API request follows a predictable pipeline from route matching to JSON response. Understanding this flow helps you debug issues and know where to hook in custom behavior.

## Request Flow Overview

```mermaid
flowchart TD
    A[HTTP Request] --> B[Route Match - NestJS router]
    B --> C[Auth Middleware - skipped for public group]
    C --> D[Route Group Middleware]
    D --> E[Model Middleware]
    E --> F[ResourcesController]
    F --> G{Policy Check}
    G -->|Denied| H[403 Forbidden]
    G -->|Allowed| I[Organization Scope - tenant group only]
    I --> J[Validation - store/update only]
    J --> K[Query Builder]
    K --> L[Response Serialization]
    L --> M[JSON Response]
```

## Step-by-Step Breakdown

### 1. Route Matching

When you register a model in `src/rhino.config.ts`, Rhino generates a set of routes automatically. Each route is bound to a specific action on the `ResourcesController`:

| Action | Route | Controller Method |
|--------|-------|-------------------|
| Index | `GET /api/:model` | `index()` |
| Store | `POST /api/:model` | `store()` |
| Show | `GET /api/:model/:id` | `show()` |
| Update | `PUT /api/:model/:id` | `update()` |
| Destroy | `DELETE /api/:model/:id` | `destroy()` |
| Trashed | `GET /api/:model/trashed` | `trashed()` |
| Restore | `POST /api/:model/:id/restore` | `restore()` |
| Force Delete | `DELETE /api/:model/:id/force-delete` | `forceDelete()` |

The model slug and route group key are stored in the route metadata, so the controller knows which model class to resolve. Routes are named `rhino.{group}.{slug}.{action}` (e.g., `rhino.tenant.posts.index`). See [Route Groups](./route-groups) for details.

### 2. Auth Middleware

For route groups other than `public`, the NestJS auth middleware runs first. It verifies the API token from the `Authorization: Bearer <token>` header and attaches the authenticated user to `ctx.auth.user`.

Routes in the `public` route group skip this step entirely.

### 3. Route Group Middleware & Organization Resolution

Middleware defined in the route group config runs next. For the `tenant` route group, this typically includes one of two organization-resolving middleware classes:

- **`ResolveOrganizationFromRoute`** -- Extracts the `:organization` route parameter and looks up the Organization model by the configured identifier column (`id`, `slug`, or `uuid`). Verifies the authenticated user belongs to the organization.

- **`ResolveOrganizationFromSubdomain`** -- Extracts the subdomain from the `Host` header (e.g., `acme` from `acme.example.com`). Skips known non-tenant subdomains (`www`, `app`, `api`, `localhost`). Looks up by `domain` column first, then by the identifier column.

Both middleware classes set `ctx.organization` for downstream consumers.

### 4. Model Middleware

If the model defines `routeMiddleware` or `middlewareActions`, those middleware names are applied to the appropriate routes during registration:

```ts title="app/models/post.ts"
export default class Post extends compose(BaseModel, HasRhino) {
  // Applied to all routes for this model
  static routeMiddleware = ['throttle:60,1']

  // Applied only to specific actions
  static middlewareActions = {
    store: ['verified'],
    destroy: ['admin'],
  }
}
```

### 5. Model Resolution

The `ResourcesController` extracts the model slug from the route metadata and uses the `models` map in `src/rhino.config.ts` to dynamically import the model class:

```ts
const loader = config.models[slug]  // e.g. () => import('#models/post')
const module = await loader()
const modelClass = module.default    // The Prisma model class
```

### 6. Authorization

The controller resolves the policy class from the model's static `policy` property (if defined) and calls the appropriate policy method:

| Action | Policy Method | Arguments |
|--------|--------------|-----------|
| Index | `viewAny(user, modelClass)` | Model class |
| Show | `view(user, record)` | Loaded record |
| Store | `create(user, modelClass)` | Model class |
| Update | `update(user, record)` | Loaded record |
| Destroy | `delete(user, record)` | Loaded record |
| Trashed | `viewTrashed(user, modelClass)` | Model class |
| Restore | `restore(user, record)` | Loaded record |
| Force Delete | `forceDelete(user, record)` | Loaded record |

If no policy is defined, all actions are allowed.

For `?include=` parameters, the controller also checks `viewAny` permission on each related model's policy. A 403 is returned if the user lacks permission for any requested include.

### 7. Organization Scoping

When an organization is present in the request context (set by middleware in the `tenant` route group), the controller applies organization filtering to the query. Non-tenant route groups skip this step. The scoping strategy follows this order of precedence:

1. **Resource IS the Organization model** -- restrict to the current org's primary key
2. **Model has `scopeForOrganization` static method** -- delegate to it
3. **Model has `organization_id` column** -- simple `WHERE organization_id = ?`
4. **Auto-detected `belongsTo` chain** -- Rhino walks `belongsTo` relationships to find a model with `organization_id`
5. **Model has `organization` relationship** -- use `whereHas`
6. **No relationship found** -- model is global (no scope applied)

### 8. Validation

For `store` and `update` actions, the controller resolves permitted fields from the policy (`permittedAttributesForCreate` or `permittedAttributesForUpdate`), checks for forbidden fields (returns 403), then calls the model's `validateForAction()` method (provided by the `HasValidation` mixin) for VineJS format validation. If validation fails, a 422 response is returned with the error details:

```json title="Response"
{
  "errors": {
    "title": ["The title field is required."],
    "content": ["The content field must be a string."]
  }
}
```

### 9. Query Execution

The `RhinoQueryBuilder` translates URL query parameters into Prisma operations:

1. `applyFilters()` -- `?filter[status]=published`
2. `applySorts()` -- `?sort=-created_at,title`
3. `applySearch()` -- `?search=nestjs`
4. `applyIncludes()` -- `?include=user,comments`
5. `applyFields()` -- `?fields[posts]=id,title`
6. `applyPagination()` -- `?page=1&per_page=20`

### 10. Response

The controller returns a JSON response. For paginated results, metadata is sent in response headers:

```
X-Current-Page: 1
X-Last-Page: 10
X-Per-Page: 20
X-Total: 195
```

The response body contains the data array (for index endpoints) or a single object (for show/store/update). Delete operations return a `204 No Content` response.

## Action Exclusion

Models can opt out of specific routes using `exceptActions`:

```ts title="app/models/setting.ts"
export default class Setting extends compose(BaseModel, HasRhino) {
  // Only allow index and show -- no create, update, or delete
  static exceptActions = ['store', 'update', 'destroy', 'trashed', 'restore', 'forceDelete']
}
```

Valid action names: `index`, `show`, `store`, `update`, `destroy`, `trashed`, `restore`, `forceDelete`.

## Error Responses

Rhino uses a consistent JSON error format across all actions:

| Status | Meaning | Example |
|--------|---------|---------|
| `403` | Authorization denied | `{ "message": "This action is unauthorized." }` |
| `404` | Resource not found | `{ "message": "Organization not found" }` |
| `422` | Validation failed | `{ "errors": { "title": ["..."] } }` |
| `204` | Success (no content) | Empty body (delete operations) |
