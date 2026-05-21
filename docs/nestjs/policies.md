---
sidebar_position: 6
title: Policies
---

# Policies

Rhino uses a policy-based authorization system that automatically checks permissions before every CRUD action. Policies extend the `ResourcePolicy` base class and use a permission format of `{slug}.{action}` to determine access.

## ResourcePolicy Base Class

The `ResourcePolicy` class provides default implementations for all CRUD authorization methods. Each method checks whether the authenticated user holds the required permission string:

```ts title="app/policies/post_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'
}
```

With this minimal setup, Rhino automatically checks these permissions:

| Action | Policy Method | Permission Checked |
|--------|--------------|-------------------|
| Index (list) | `viewAny(user)` | `posts.index` |
| Show (single) | `view(user, record)` | `posts.show` |
| Store (create) | `create(user)` | `posts.store` |
| Update | `update(user, record)` | `posts.update` |
| Destroy (delete) | `delete(user, record)` | `posts.destroy` |
| Trashed (list deleted) | `viewTrashed(user)` | `posts.trashed` |
| Restore | `restore(user, record)` | `posts.restore` |
| Force Delete | `forceDelete(user, record)` | `posts.forceDelete` |

## Permission Format

Permissions follow the pattern `{resource_slug}.{action}`:

- `posts.index` -- can list posts
- `posts.store` -- can create posts
- `blogs.update` -- can update blogs
- `comments.destroy` -- can delete comments

The `resource_slug` matches the key you use in `src/rhino.config.ts` when registering models:

```ts title="src/rhino.config.ts"
models: {
  posts: () => import('#models/post'),       // slug = 'posts'
  'blog-posts': () => import('#models/blog_post'),  // slug = 'blog-posts'
}
```

### Wildcard Support

Permissions support two levels of wildcards:

- `*` -- grants access to **everything** across all resources and all actions
- `posts.*` -- grants access to **all actions** on the `posts` resource

```ts
// Full admin access
const isAdmin = await user.hasPermission('*', organization)

// All post actions
const hasAllPostPerms = await user.hasPermission('posts.*', organization)

// Specific action
const canCreate = await user.hasPermission('posts.store', organization)
```

## HasPermissions Mixin

The `HasPermissions` mixin is applied to your **User** model and provides the `hasPermission()` and `getRoleSlugForValidation()` methods:

```ts title="app/models/user.ts"
import { compose } from '@nestjs/core/helpers'
import { BaseModel, column, hasMany } from '@nestjs/lucid/orm'
import type { HasMany } from '@nestjs/lucid/types/relations'
import { HasPermissions } from '@rhino-dev/rhino-nestjs/mixins/has_permissions'
import UserRole from '#models/user_role'

export default class User extends compose(BaseModel, HasPermissions) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare email: string

  @column()
  declare permissions: string[] | null

  @hasMany(() => UserRole)
  declare userRoles: HasMany<typeof UserRole>
}
```

### How Permissions Are Stored

Rhino supports two permission sources, used depending on whether the request is organization-scoped or not:

#### User-level permissions (`users.permissions`)

For non-tenant route groups (e.g., `driver`, `admin`, `default`), permissions are stored directly on the `users` table as a JSON column:

```
id | name         | email              | permissions (JSON)
1  | Alice Driver | alice@example.com  | ["trips.index", "trips.show", "trucks.*"]
2  | Bob Admin    | bob@example.com    | ["*"]
3  | Carol User   | carol@example.com  | ["posts.index", "posts.show"]
```

This is the standard permission model and works for all apps, including non-multi-tenant apps.

#### Organization-scoped permissions (`userRoles.permissions`)

For the `tenant` route group, permissions are stored on the `userRoles` join table, scoped per organization:

```
id | userId | organizationId | permissions (JSON)
1  | 1      | 1              | ["*"]
2  | 2      | 1              | ["posts.index", "posts.show", "posts.store"]
3  | 1      | 2              | ["posts.index", "posts.show"]
```

This enables multi-tenant permission models where the same user can hold different permissions in different organizations.

#### Resolution

When `hasPermission(permission, organization?)` is called:

1. **Organization present** (tenant route group) → checks `userRoles.permissions` for that organization
2. **No organization** (any other route group) → checks `users.permissions` directly

This is deterministic — the decision is based on the presence of an organization in the request, which is set by middleware in tenant route groups. There is no fallback chain.

The `permissions` property can be either a JSON string or a plain array of permission strings:

```json
["posts.index", "posts.show", "posts.store", "comments.*"]
```

### Methods

| Method | Description |
|---|---|
| `hasPermission(permission, organization?)` | Returns `true` if the user has the given permission. With organization: checks `userRoles.permissions`. Without: checks `users.permissions`. |
| `getRoleSlugForValidation(organization?)` | Returns the user's role slug within an organization, used for role-based validation rules. |

## Custom Policies

Extend `ResourcePolicy` to add custom authorization logic. Override any method to implement your own checks:

```ts title="app/policies/post_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'

  // Only allow the author to update their own posts
  async update(user: any, record: any): Promise<boolean> {
    if (record.userId === user.id) {
      return true
    }
    return super.update(user, record)
  }

  // Restrict deletion to admins only
  async delete(user: any, record: any): Promise<boolean> {
    const isAdmin = await user.hasPermission('*')
    if (isAdmin) {
      return true
    }
    return false
  }

  // Custom logic for viewing trashed records
  async viewTrashed(user: any): Promise<boolean> {
    return this.checkPermission(user, 'trashed')
  }
}
```

You can call `super.methodName()` to compose your custom logic with the default permission check, or call `this.checkPermission(user, action)` directly to perform a permission lookup.

### Registering a Policy

Register your policy on the model via the static `policy` property:

```ts title="app/models/post.ts"
export default class Post extends compose(BaseModel, HasRhino) {
  static policy = () => import('#policies/post_policy')

  // ... model definition
}
```

The `policy` property can be:
- An async import function (recommended): `() => import('#policies/post_policy')`
- A policy class reference: `PostPolicy`
- A policy instance: `new PostPolicy()`

## Attribute Permissions

Policies control which attributes are visible and writable on a per-user basis through four methods:

### `hiddenAttributesForShow(user)`

Returns an array of attribute names that should be **hidden** from API responses for this user. These are merged with the base hidden columns (`password`, `rememberToken`, etc.) and any `additionalHiddenColumns` on the model.

```ts title="app/policies/user_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class UserPolicy extends ResourcePolicy {
  static resourceSlug = 'users'

  hiddenAttributesForShow(user: any | null): string[] {
    if (!user) {
      return ['email', 'phone', 'api_token']
    }
    if (this.hasRole(user, 'admin')) {
      return []
    }
    return ['api_token']
  }
}
```

### `permittedAttributesForShow(user)`

Returns an array of attribute names the user is allowed to **see** in API responses. Acts as a whitelist — only listed attributes are returned. Return `['*']` (default) to allow all attributes.

```ts
permittedAttributesForShow(user: any | null): string[] {
  if (!user) return ['title', 'body']
  if (this.hasRole(user, 'admin')) return ['*']
  return ['title', 'body', 'status']
}
```

### `permittedAttributesForCreate(user)`

Returns an array of attribute names the user is allowed to **send** when creating a record. Fields not in this list will trigger a **403 Forbidden** response. Return `['*']` (default) to allow all attributes.

```ts
permittedAttributesForCreate(user: any | null): string[] {
  if (!user) return []
  if (this.hasRole(user, 'admin')) return ['*']
  return ['title', 'body']
}
```

### `permittedAttributesForUpdate(user)`

Returns an array of attribute names the user is allowed to **send** when updating a record. Fields not in this list will trigger a **403 Forbidden** response. Return `['*']` (default) to allow all attributes.

```ts
permittedAttributesForUpdate(user: any | null): string[] {
  if (!user) return []
  if (this.hasRole(user, 'admin')) return ['*']
  return ['title', 'body']
}
```

### `hasRole(user, roleSlug)`

A helper method available in all policies for checking the user's role:

```ts
permittedAttributesForCreate(user: any | null): string[] {
  if (!user) return []
  return this.hasRole(user, 'admin') ? ['*'] : ['title', 'content']
}
```

:::tip
When `permittedAttributesForShow` returns a non-wildcard list and `hiddenAttributesForShow` also hides some of those fields, the **blacklist wins** — fields in both lists are hidden.
:::

## No Policy Behavior

If a model does not define a `policy` property, **all actions are allowed**. This is useful during development or for public resources. Once you are ready to add authorization, create a policy and register it on the model.

## Slug Resolution

The `resourceSlug` static property on the policy tells Rhino which permission prefix to use. If you do not set it, Rhino attempts to resolve the slug automatically by matching the model class against the `models` map in `src/rhino.config.ts`.

```ts title="app/policies/post_policy.ts"
// Explicit slug (recommended)
export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'
}

// Auto-resolved from config (works, but explicit is clearer)
export default class PostPolicy extends ResourcePolicy {
  // Rhino resolves 'posts' from src/rhino.config.ts models map
}
```

:::tip
Always set `resourceSlug` explicitly on your policy classes to avoid ambiguity and make permissions easy to audit.
:::
