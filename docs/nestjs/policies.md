---
sidebar_position: 6
title: Policies
---

# Policies

Rhino uses a policy-based authorization system that automatically checks permissions before every CRUD action. Policies extend the `ResourcePolicy` base class and use a permission format of `{slug}.{action}` to determine access.

## ResourcePolicy Base Class

The `ResourcePolicy` class provides default implementations for all CRUD authorization methods. Each method checks whether the authenticated user holds the required permission string:

```ts title="src/policies/PostPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';
}
```

With this minimal setup, Rhino automatically checks these permissions:

| Action | Policy Method | Permission Checked |
|--------|--------------|-------------------|
| Index (list) | `viewAny(user, org?)` | `posts.index` |
| Show (single) | `view(user, record, org?)` | `posts.show` |
| Store (create) | `create(user, org?)` | `posts.store` |
| Update | `update(user, record, org?)` | `posts.update` |
| Destroy (delete) | `delete(user, record, org?)` | `posts.destroy` |
| Trashed (list deleted) | `viewTrashed(user, org?)` | `posts.trashed` |
| Restore | `restore(user, record, org?)` | `posts.restore` |
| Force Delete | `forceDelete(user, record, org?)` | `posts.forceDelete` |

## Permission Format

Permissions follow the pattern `{resourceSlug}.{action}`:

- `posts.index` -- can list posts
- `posts.store` -- can create posts
- `blogs.update` -- can update blogs
- `comments.destroy` -- can delete comments

The `resourceSlug` matches the key you use in `src/rhino.config.ts` when registering models:

```ts title="src/rhino.config.ts"
models: {
  posts:        { model: 'post' },        // slug = 'posts'
  'blog-posts': { model: 'blogPost' },    // slug = 'blog-posts'
},
```

### Wildcard Support

Permissions support two levels of wildcards:

- `*` -- grants access to **everything** across all resources and all actions
- `posts.*` -- grants access to **all actions** on the `posts` resource

```ts
import { userHasPermission } from '@rhino-dev/rhino-nestjs';

// Full admin access
const isAdmin = userHasPermission(user, '*', organization);

// All post actions
const hasAllPostPerms = userHasPermission(user, 'posts.*', organization);

// Specific action
const canCreate = userHasPermission(user, 'posts.store', organization);
```

## How Permissions Are Stored

Rhino supports two permission sources, used depending on whether the request is organization-scoped or not.

### User-level permissions (`users.permissions`)

For non-tenant route groups (e.g., `driver`, `admin`, default), permissions are stored directly on the `users` table as a JSON column:

```
id | name         | email              | permissions (JSON)
1  | Alice Driver | alice@example.com  | ["trips.index", "trips.show", "trucks.*"]
2  | Bob Admin    | bob@example.com    | ["*"]
3  | Carol User   | carol@example.com  | ["posts.index", "posts.show"]
```

This is the standard permission model and works for all apps, including non-multi-tenant apps.

### Organization-scoped permissions (`user_roles.permissions`)

For the `tenant` route group, permissions are stored on the `user_roles` join table, scoped per organization:

```
id | userId | organizationId | permissions (JSON)
1  | 1      | 1              | ["*"]
2  | 2      | 1              | ["posts.index", "posts.show", "posts.store"]
3  | 1      | 2              | ["posts.index", "posts.show"]
```

This enables multi-tenant permission models where the same user can hold different permissions in different organizations.

### Resolution

When a permission is checked:

1. **Organization present** (tenant route group) → checks `user_roles.permissions` for that organization
2. **No organization** (any other route group) → checks `users.permissions` directly

This is deterministic — the decision is based on the presence of an organization in the request, which is set by middleware in tenant route groups. There is no fallback chain.

The `permissions` value can be either a JSON string or a plain array of permission strings:

```json
["posts.index", "posts.show", "posts.store", "comments.*"]
```

### Permission Utilities

Rhino exports helpers for working with permissions outside the automatic guard path:

| Utility | Description |
|---|---|
| `userHasPermission(user, permission, organization?)` | Returns `true` if the user holds the permission. With an organization, checks `user_roles.permissions`; without, checks `users.permissions`. |
| `resolveUserRoleSlug(user, organizationId)` | Returns the user's role slug within an organization, used for role-based validation rules. |

## Custom Policies

Extend `ResourcePolicy` to add custom authorization logic. Override any method to implement your own checks:

```ts title="src/policies/PostPolicy.ts"
import { ResourcePolicy, userHasPermission } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  // Only allow the author to update their own posts
  override update(user: any, record: any, org?: any): boolean {
    if (record.userId === user?.id) {
      return true;
    }
    return super.update(user, record, org);
  }

  // Restrict deletion to admins only
  override delete(user: any, _record: any, _org?: any): boolean {
    return userHasPermission(user, '*');
  }

  // Custom logic for viewing trashed records
  override viewTrashed(user: any, org?: any): boolean {
    return this.checkPermission(user, 'trashed', org);
  }
}
```

You can call `super.methodName()` to compose your custom logic with the default permission check, or call `this.checkPermission(user, action, org)` directly to perform a permission lookup.

### Registering a Policy

Register the policy on the model registration via the `policy` field — a `ResourcePolicy` subclass reference:

```ts title="src/rhino.config.ts"
import { PostPolicy } from './policies/PostPolicy';

models: {
  posts: {
    model: 'post',
    policy: PostPolicy,
  },
},
```

## Attribute Permissions

Policies control which attributes are visible and writable on a per-user basis through four methods. Each receives the user and an optional organization.

### `hiddenAttributesForShow(user, org?)`

Returns an array of attribute names that should be **hidden** from API responses for this user. These are merged with the base hidden columns (`password`, `rememberToken`, etc.) and any `additionalHiddenColumns` on the registration.

```ts title="src/policies/UserPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class UserPolicy extends ResourcePolicy {
  override resourceSlug = 'users';

  override hiddenAttributesForShow(user: any, org?: any): string[] {
    if (!user) {
      return ['email', 'phone', 'apiToken'];
    }
    if (this.hasRole(user, 'admin', org)) {
      return [];
    }
    return ['apiToken'];
  }
}
```

### `permittedAttributesForShow(user, org?)`

Returns an array of attribute names the user is allowed to **see** in API responses. Acts as a whitelist — only listed attributes are returned. Return `['*']` (default) to allow all attributes.

```ts
override permittedAttributesForShow(user: any, org?: any): string[] {
  if (!user) return ['title', 'body'];
  if (this.hasRole(user, 'admin', org)) return ['*'];
  return ['title', 'body', 'status'];
}
```

### `permittedAttributesForCreate(user, org?)`

Returns an array of attribute names the user is allowed to **send** when creating a record. Fields not in this list trigger a **403 Forbidden** response. Return `['*']` (default) to allow all attributes.

```ts
override permittedAttributesForCreate(user: any, org?: any): string[] {
  if (!user) return [];
  if (this.hasRole(user, 'admin', org)) return ['*'];
  return ['title', 'body'];
}
```

### `permittedAttributesForUpdate(user, org?)`

Returns an array of attribute names the user is allowed to **send** when updating a record. Fields not in this list trigger a **403 Forbidden** response. Return `['*']` (default) to allow all attributes.

```ts
override permittedAttributesForUpdate(user: any, org?: any): string[] {
  if (!user) return [];
  if (this.hasRole(user, 'admin', org)) return ['*'];
  return ['title', 'body'];
}
```

### `hasRole(user, roleSlug, org?)`

A helper method available in all policies for checking the user's role within an organization:

```ts
override permittedAttributesForCreate(user: any, org?: any): string[] {
  if (!user) return [];
  return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'content'];
}
```

:::tip
When `permittedAttributesForShow` returns a non-wildcard list and `hiddenAttributesForShow` also hides some of those fields, the **blacklist wins** — fields in both lists are hidden.
:::

## No Policy Behavior

If a model registration does not define a `policy`, **all actions are allowed**. This is useful during development or for public resources. Once you are ready to add authorization, create a policy and set it on the registration.

## Slug Resolution

The `resourceSlug` property on the policy tells Rhino which permission prefix to use. If you do not set it, the guard injects it from the model registry at runtime by matching the policy against the `models` map in `src/rhino.config.ts`.

```ts title="src/policies/PostPolicy.ts"
// Explicit slug (recommended)
export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';
}

// Auto-resolved from config (works, but explicit is clearer)
export class PostPolicy extends ResourcePolicy {
  // Rhino injects 'posts' from src/rhino.config.ts at runtime
}
```

:::tip
Always set `resourceSlug` explicitly on your policy classes to avoid ambiguity and make permissions easy to audit.
:::

---

## Layered Permissions

By default Rhino resolves a user's effective permissions from **three layers**, so you don't have to copy a full permission set onto every user.

```
effective = (role ∪ granted) − denied        // deny always wins
```

| Layer | Where it lives | Purpose |
|-------|----------------|---------|
| **role** | `OrgRolePermission(organizationId, roleId, permissions)` | The shared set every user with that role in that org inherits. Defined **once** per (org, role). |
| **granted** | `userRoles.grantedPermissions` | Extra abilities for one user (additive). |
| **denied** | `userRoles.deniedPermissions` | Abilities removed from one user (subtractive). **Deny wins over everything**, even a role `*`. |
| **legacy** | `userRoles.permissions` | The pre-4.3 per-user list, still honored as an allow layer. |

Wildcards (`*`, `posts.*`) work on every layer.

### Prisma schema

Add the `OrgRolePermission` model, the `role.orgRolePermissions` relation, and the two delta columns on `UserRole`:

```prisma
model OrgRolePermission {
  id             Int          @id @default(autoincrement())
  organizationId Int
  roleId         Int
  permissions    Json         @default("[]")
  organization   Organization @relation(fields: [organizationId], references: [id])
  role           Role         @relation(fields: [roleId], references: [id])

  @@unique([organizationId, roleId])
}

model UserRole {
  // ...existing fields...
  permissions         Json @default("[]")
  grantedPermissions  Json @default("[]")
  deniedPermissions   Json @default("[]")
}

model Role {
  // ...existing fields...
  orgRolePermissions OrgRolePermission[]
}
```

`JwtAuthGuard` eager-loads `role.orgRolePermissions` automatically, with a graceful fallback for apps that haven't added the relation yet — so existing apps keep working unchanged.

### Why this exists

Previously the only org-scoped source was `userRoles.permissions`, so teams stored the **full** set on every user, and a one-off exception meant inventing a new role. With the role layer:

- **Add a table** → grant `widgets.*` on the role layer once; every member inherits it.
- **Give one user extra access** → add to their `grantedPermissions`.
- **Take one ability from one user** → add it to their `deniedPermissions` — no new role needed.

### Resolution rules

1. If the permission matches `deniedPermissions` → **DENY** (deny always wins).
2. Else if it matches `role ∪ granted ∪ legacy` → **ALLOW**.
3. Else → **DENY** (default-deny).

Deny is intentionally **deny-overrides**, not "most-specific-wins": a denied permission stays denied even under a role `*`. `userHasPermission()` enforces this in one place; every guard goes through it.

### Migrating an existing app

To lift your existing per-user permissions into the role layer, run from your app root:

```bash
npx rhino permissions-migrate           # dry-run preview
npx rhino permissions-migrate --apply   # write the changes
```

For each `(organization, role)` group it computes the common subset of every user's permissions, writes it to `OrgRolePermission`, and reduces each user row to just its delta. Effective permissions are preserved exactly. It is idempotent and skips groups that already have a role layer.
