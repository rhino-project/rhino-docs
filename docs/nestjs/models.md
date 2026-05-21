---
sidebar_position: 3
title: Models
---

# Models

Rhino models are standard NestJS Prisma models enhanced with declarative static properties and mixins that control how REST API endpoints are generated and behave. By configuring these properties directly on your model, Rhino automatically builds fully-featured API endpoints with filtering, sorting, searching, pagination, validation, and authorization -- all without writing controllers or routes.

## RhinoModel Base Class

The recommended way to create Rhino models is to extend `RhinoModel` — a pre-composed base class that includes all the core mixins you need:

```ts title="app/models/post.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { column } from '@nestjs/lucid/orm'

export default class Post extends RhinoModel {
  static allowedFilters = ['status', 'user_id']
  static allowedSorts = ['created_at', 'title']
  static allowedSearch = ['title', 'content']

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
}
```

`RhinoModel` extends `BaseModel` via `compose()` and includes these mixins automatically:

| Mixin | Purpose |
|---|---|
| `HasRhino` | Query builder DSL (`allowedFilters`, `allowedSorts`, etc.) |
| `HasValidation` | VineJS type/format validation with policy-driven field permissions |
| `HidableColumns` | Dynamic column hiding from API responses |
| `HasAutoScope` | Auto-discovery of `app/models/scopes/{Model}Scope` classes |

You no longer need to manually compose these mixins on every model.

### Optional Mixins

These mixins are **not** included in `RhinoModel` because they require additional database columns or relationships. Add them via `compose()` on top of `RhinoModel`:

```ts title="app/models/invoice.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { compose } from '@nestjs/core/helpers'
import { HasAuditTrail } from '@rhino-dev/rhino-nestjs/mixins/has_audit_trail'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'

export default class Invoice extends compose(RhinoModel, HasAuditTrail, BelongsToOrganization) {
  // ...
}
```

| Mixin | Purpose |
|---|---|
| `HasAuditTrail` | Automatic change logging to `audit_logs` table |
| `HasUuid` | Auto-generated UUID on creation |
| `BelongsToOrganization` | Multi-tenant organization scoping |
| `HasPermissions` | Permission checking (User model only) |

### Customizing RhinoModel

You can publish a customizable base class to your application:

```ts title="app/models/rhino_model.ts"
import BaseRhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class RhinoModel extends BaseRhinoModel {
  // Add application-wide concerns here
}
```

Then import from your local file instead of the package.

:::tip
You can still use the `compose(BaseModel, HasRhino, HasValidation, ...)` pattern directly if you prefer full control. `RhinoModel` is a convenience, not a requirement.
:::

### The `compose()` Pattern (Advanced)

For advanced use cases, NestJS's `compose()` helper lets you mix-and-match individual mixins:

```ts title="app/models/post.ts"
import { BaseModel } from '@nestjs/lucid/orm'
import { compose } from '@nestjs/core/helpers'
import { HasRhino } from '@rhino-dev/rhino-nestjs/mixins/has_rhino'
import { HasValidation } from '@rhino-dev/rhino-nestjs/mixins/has_validation'

export default class Post extends compose(BaseModel, HasRhino, HasValidation) {
  // Model definition...
}
```

This is equivalent to extending `RhinoModel` but gives you explicit control over which mixins are applied.

## Model Configuration Properties

Below is a complete model example demonstrating **all** available static properties that Rhino recognizes:

```ts title="app/models/post.ts"
import { DateTime } from 'luxon'
import { column, belongsTo, hasMany } from '@nestjs/lucid/orm'
import type { BelongsTo, HasMany } from '@nestjs/lucid/types/relations'
import { compose } from '@nestjs/core/helpers'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { HasAuditTrail } from '@rhino-dev/rhino-nestjs/mixins/has_audit_trail'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'
import User from '#models/user'
import Comment from '#models/comment'

export default class Post extends compose(
  RhinoModel,
  HasAuditTrail,
  BelongsToOrganization
) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare status: string

  @column()
  declare userId: number

  @column()
  declare categoryId: number

  @column()
  declare organizationId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // -- Query Builder --
  static allowedFilters = ['status', 'user_id', 'category_id']
  static allowedSorts = ['created_at', 'title', 'updated_at']
  static defaultSort = '-created_at'
  static allowedFields = ['id', 'title', 'content', 'status']
  static allowedIncludes = ['user', 'comments', 'tags']
  static allowedSearch = ['title', 'content']

  // -- Pagination --
  static paginationEnabled = true
  static perPage = 25

  // -- Soft Deletes --
  static softDeletes = true

  // -- Middleware --
  static routeMiddleware = ['throttle:60,1']
  static middlewareActions = {
    store: ['verified'],
    destroy: ['admin'],
  }

  // -- Route Exclusion --
  static exceptActions = ['destroy'] // skip DELETE endpoint

  // -- Relationships --
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>
}
```

### Property Reference

| Property | Type | Default | Description |
|---|---|---|---|
| `allowedFilters` | `string[]` | `[]` | Fields available for query-string filtering via `?filter[field]=value`. Only the fields listed here can be filtered on. |
| `allowedSorts` | `string[]` | `[]` | Fields available for sorting via `?sort=field`. Prefix with `-` for descending order (e.g., `?sort=-created_at`). |
| `defaultSort` | `string` | `'-created_at'` | The sort applied when no `?sort` parameter is provided. Use the `-` prefix for descending. |
| `allowedFields` | `string[]` | `[]` | Fields that can be selected via sparse fieldsets (`?fields[model]=field1,field2`). Limits which columns are returned. |
| `allowedIncludes` | `string[]` | `[]` | Relationships that can be eager-loaded via `?include=relation`. Must correspond to defined Prisma relationships on the model. |
| `allowedSearch` | `string[]` | `[]` | Fields searched when `?search=term` is used. Rhino performs a case-insensitive `ILIKE` search across all listed fields. Supports dot notation for relations (e.g., `'user.name'`). |
| `paginationEnabled` | `boolean` | `true` | Enables or disables pagination for the index endpoint. |
| `perPage` | `number` | `15` | Number of records per page when pagination is enabled. |
| `softDeletes` | `boolean` | `false` | Enables soft delete endpoints (trashed, restore, force-delete). Requires a `deletedAt` column on the model. |
| `routeMiddleware` | `string[]` | `[]` | Middleware names applied to **all** routes for this model. |
| `middlewareActions` | `Record<string, string[]>` | `{}` | Middleware applied to **specific** actions only. Keys are action names (`index`, `show`, `store`, `update`, `destroy`). |
| `exceptActions` | `string[]` | `[]` | List of CRUD actions to exclude from route generation. Valid values: `'index'`, `'show'`, `'store'`, `'update'`, `'destroy'`, `'trashed'`, `'restore'`, `'forceDelete'`. |

:::tip
You only need to declare properties that differ from their defaults. For example, if you do not need filtering, simply omit `allowedFilters` entirely.
:::

## Available Mixins

Rhino provides a collection of mixins that add specific behaviors to your models. When using `RhinoModel`, the core mixins (HasRhino, HasValidation, HidableColumns, HasAutoScope) are already included. The mixins documented below can be added individually when needed.

### HasRhino

The core mixin that adds all the static DSL properties for the Rhino REST API layer. This mixin provides the foundation for filters, sorts, includes, fields, search, pagination, middleware, and route exclusion.

**Included in RhinoModel** — no need to add manually.

```ts title="app/models/post.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class Post extends RhinoModel {
  static allowedFilters = ['status', 'user_id']
  static allowedSorts = ['created_at', 'title']
  static defaultSort = '-created_at'
  static allowedIncludes = ['user', 'comments']
  static allowedSearch = ['title', 'content']
  static allowedFields = ['id', 'title', 'content', 'status']
  static paginationEnabled = true
  static perPage = 20
  static routeMiddleware = []
  static middlewareActions = {}
  static exceptActions = []
}
```

---

### HasValidation

Adds VineJS type/format validation to your model via the `validateForAction()` static method. Field permissions (which fields each user can submit) are controlled by the **policy**, not the model.

**Included in RhinoModel** — no need to add manually.

```ts title="app/models/post.ts"
import vine from '@vinejs/vine'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class Post extends RhinoModel {
  static validationSchema = {
    title: vine.string().maxLength(255),
    content: vine.string(),
    status: vine.enum(['draft', 'published', 'archived']),
  }

  // Field permissions are controlled by the policy.
}
```

:::info
For a complete breakdown of validation behavior, see the [Validation](./validation) page. For field permissions, see [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

---

### HasPermissions

Adds role-based permission checking to the **User** model. Rhino uses this mixin to authorize API actions automatically when policies are in place.

```ts title="app/models/user.ts"
import { compose } from '@nestjs/core/helpers'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { hasMany } from '@nestjs/lucid/orm'
import type { HasMany } from '@nestjs/lucid/types/relations'
import { HasPermissions } from '@rhino-dev/rhino-nestjs/mixins/has_permissions'
import UserRole from '#models/user_role'

export default class User extends compose(RhinoModel, HasPermissions) {
  @hasMany(() => UserRole)
  declare userRoles: HasMany<typeof UserRole>
}

// Check if a user can create posts within an organization
const canCreate = await user.hasPermission('posts.store', organization)
```

:::info
See the [Policies](./policies) page for full details on the permission system.
:::

---

### HasAuditTrail

Automatically records changes to your model in an audit log. Uses Prisma model hooks (`after:create`, `after:update`, `after:delete`) to track creation, updates, deletion, force-deletion, and restoration events with old and new values.

```ts title="app/models/user.ts"
import { compose } from '@nestjs/core/helpers'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { HasAuditTrail } from '@rhino-dev/rhino-nestjs/mixins/has_audit_trail'

export default class User extends compose(RhinoModel, HasAuditTrail) {
  static auditExclude = ['password', 'remember_token', 'api_token']
}
```

:::info
See the [Audit Trail](./audit-trail) page for full details.
:::

---

### HasUuid

Automatically generates a UUID for the model when it is created. The mixin hooks into Prisma's `before:create` event and fills the `uuid` column if it is empty. Uses Node.js's built-in `crypto.randomUUID()`.

```ts title="app/models/invoice.ts"
import { compose } from '@nestjs/core/helpers'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { column } from '@nestjs/lucid/orm'
import { HasUuid } from '@rhino-dev/rhino-nestjs/mixins/has_uuid'

export default class Invoice extends compose(RhinoModel, HasUuid) {
  @column()
  declare uuid: string
}
```

:::warning
Your database table must have a `uuid` column. Add it in your migration:

```ts
table.uuid('uuid').unique().nullable()
```
:::

---

### HasAutoScope

Automatically applies a global scope to the model based on a naming convention. When this mixin is used, Rhino looks for a scope class at `app/models/scopes/{model_name}_scope.ts` and applies it if found.

```ts title="app/models/post.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class Post extends RhinoModel {
  // Automatically loads app/models/scopes/post_scope.ts (if it exists)
}
```

The scope file name is derived by converting the model's PascalCase name to snake_case and appending `_scope`. For example, `BlogPost` becomes `blog_post_scope`.

:::tip
The scope is only applied if the class file exists. You can safely add the `HasAutoScope` mixin to any model without creating the scope class until you need it.
:::

---

### BelongsToOrganization

Provides multi-tenant organization scoping. This mixin automatically filters all queries to the current organization and sets the `organizationId` when creating new records.

```ts title="app/models/post.ts"
import { compose } from '@nestjs/core/helpers'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { column, belongsTo } from '@nestjs/lucid/orm'
import type { BelongsTo } from '@nestjs/lucid/types/relations'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'
import Organization from '#models/organization'

export default class Post extends compose(RhinoModel, BelongsToOrganization) {
  @column()
  declare organizationId: number

  @belongsTo(() => Organization)
  declare organization: BelongsTo<typeof Organization>
}
```

:::info
See the [Multi-Tenancy](./multi-tenancy) page for full details on organization scoping. Organization ownership is auto-detected from `belongsTo` relationships.
:::

---

### HidableColumns

Controls which columns are hidden from API responses. This mixin provides multiple layers of column visibility control: base defaults, model-level configuration, and policy-based per-user hiding.

```ts title="app/models/user.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class User extends RhinoModel {
  static additionalHiddenColumns = ['api_token', 'stripe_id']
}
```

**Layers of hidden columns (applied in order):**

1. **Base hidden columns** (always hidden): `password`, `rememberToken`, `createdAt`, `updatedAt`, `deletedAt`
2. **Model-level hidden columns** via `additionalHiddenColumns`: additional fields to always hide for this model
3. **Policy-level hidden columns** via the `hiddenAttributesForShow()` method on the model's policy: per-user dynamic hiding
4. **Policy-level whitelist** via the `permittedAttributesForShow()` method: only listed attributes are returned

#### Computed Attributes with `rhinoComputedAttributes()`

Override `rhinoComputedAttributes()` in your model to add virtual (computed) attributes to API responses. These attributes are not database columns — they are calculated at runtime and merged into the serialized output.

```ts title="app/models/contract.ts"
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { column } from '@nestjs/lucid/orm'
import { DateTime } from 'luxon'
import { differenceInDays } from 'date-fns'

export default class Contract extends RhinoModel {
  @column()
  declare expiryDate: DateTime

  rhinoComputedAttributes(): Record<string, any> {
    return {
      days_until_expiry: this.expiryDate ? differenceInDays(this.expiryDate.toJSDate(), new Date()) : null,
      risk_score: this.calculateRisk(),
    }
  }
}
```

The returned object is merged into the JSON response **before** policy filtering is applied. This means computed attributes are always subject to policy-level blacklist and whitelist — just like database columns. The controller calls `serializeWithHidden()` automatically when rendering responses.

:::warning
Do **not** override `serializeWithHidden()` directly. Use `rhinoComputedAttributes()` instead. Overriding `serializeWithHidden()` with `{ ...super.serializeWithHidden(), ... }` would add attributes **after** policy filtering, bypassing `hiddenAttributesForShow()` and `permittedAttributesForShow()` — a security risk.
:::

Computed attributes can be controlled per-role via policy:

```ts title="app/policies/contract_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class ContractPolicy extends ResourcePolicy {
  hiddenAttributesForShow(user: any): string[] {
    if (this.hasRole(user, 'admin')) return []
    return ['risk_score'] // Only admins see the risk score
  }
}
```

You can also use `permittedAttributesForShow()` to whitelist which attributes (including computed ones) each role can see. Both blacklist and whitelist policies apply to computed attributes.

## Registration

Models are registered in `src/rhino.config.ts`. The key becomes the URL slug and the permission prefix:

```ts title="src/rhino.config.ts"
import { RhinoModule } from "@rhino-dev/rhino-nestjs";  // wire via RhinoModule.forRoot() in your AppModule

RhinoModule.forRoot({
  models: {
    'blog-posts': () => import('#models/blog_post'),
    comments: () => import('#models/comment'),
    categories: () => import('#models/category'),
    tags: () => import('#models/tag'),
  },
})
```

With this configuration, Rhino generates routes such as:

```
GET    /api/blog-posts
GET    /api/blog-posts/:id
POST   /api/blog-posts
PUT    /api/blog-posts/:id
DELETE /api/blog-posts/:id
```

:::warning
The model key (e.g., `blog-posts`) is used as the permission prefix. Make sure it matches what you use in your role permission definitions (e.g., `blog-posts.store`, `blog-posts.index`).
:::
