---
sidebar_position: 4
title: Validation
---

# Validation

Rhino provides a two-layer validation system:

1. **Policy-driven field permissions** — the policy determines which fields each user is allowed to submit for create and update actions
2. **VineJS schemas** (`validationSchema`) — type and format validation using NestJS's native [VineJS](https://vinejs.dev/) library

## How It Works

When a store or update request is received, Rhino follows this process:

1. **Resolve permitted fields** — calls `permittedAttributesForCreate(user)` or `permittedAttributesForUpdate(user)` on the policy to determine which fields the user is allowed to submit
2. **Check for forbidden fields** — if the request contains fields not in the permitted list, returns **403 Forbidden** with a message listing the forbidden fields
3. **Run VineJS validation** — for non-null values that have a `validationSchema` entry, validates type/format constraints
4. **Return result** — `{ valid: true, data }` or `{ valid: false, errors }`

## VineJS Schema (`validationSchema`)

Define per-field type constraints using VineJS schema builders on your model:

```ts title="app/models/post.ts"
import vine from '@vinejs/vine'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class Post extends RhinoModel {
  static validationSchema = {
    title: vine.string().maxLength(255),
    content: vine.string(),
    status: vine.enum(['draft', 'published', 'archived']),
    email: vine.string().email(),
    score: vine.number().min(0).max(100),
    is_active: vine.boolean(),
    starts_at: vine.date(),
  }
}
```

VineJS provides full TypeScript type inference, async validation support, and robust built-in rules. See the [VineJS documentation](https://vinejs.dev/docs/introduction) for all available schema types and rules.

:::info
Do not add `.optional()` or `.nullable()` — presence is controlled by the policy's permitted fields. Only fields present in the request and in the permitted list are validated.
:::

## Policy-Driven Field Permissions

Field permissions are defined on the **policy**, not the model. See [Policies — Attribute Permissions](./policies#attribute-permissions) for full details.

```ts title="app/policies/post_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'

  permittedAttributesForCreate(user: any | null): string[] {
    if (!user) return []
    return this.hasRole(user, 'admin') ? ['*'] : ['title', 'content']
  }

  permittedAttributesForUpdate(user: any | null): string[] {
    if (!user) return []
    if (this.hasRole(user, 'admin')) return ['*']
    return ['title', 'content']
  }
}
```

### Default Behavior

By default, all `ResourcePolicy` attribute permission methods return `['*']` (all fields permitted). Override them in your policy subclass to restrict access.

### Forbidden Fields → 403

If the user submits a field that is **not** in their permitted list, the controller returns a **403 Forbidden** response:

```json title="Response"
{
  "message": "Forbidden: you are not allowed to set the following fields: status, priority"
}
```

This is different from validation errors (422) — forbidden fields mean the user does not have permission, while validation errors mean the data format is wrong.

## Validation Response

When VineJS format validation fails, the controller returns a `422 Unprocessable Entity` response:

```json title="Response"
{
  "errors": {
    "title": ["The title field must have a maximum length of 255"],
    "status": ["The value of status field must be one of draft, published, archived"]
  }
}
```

Each field key maps to an array of error messages from VineJS.

## Complete Example

```ts title="app/models/article.ts"
import { DateTime } from 'luxon'
import { column } from '@nestjs/lucid/orm'
import vine from '@vinejs/vine'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'

export default class Article extends RhinoModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare body: string

  @column()
  declare status: string

  @column()
  declare priority: number

  @column()
  declare authorEmail: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // -- Type/format schemas (VineJS) --
  static validationSchema = {
    title: vine.string().maxLength(255),
    body: vine.string(),
    status: vine.enum(['draft', 'review', 'published']),
    priority: vine.number().min(1).max(10),
    author_email: vine.string().email(),
  }
}
```

```ts title="app/policies/article_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class ArticlePolicy extends ResourcePolicy {
  static resourceSlug = 'articles'

  permittedAttributesForCreate(user: any | null): string[] {
    if (!user) return []
    return this.hasRole(user, 'admin')
      ? ['title', 'body', 'status', 'priority', 'author_email']
      : ['title', 'body']
  }

  permittedAttributesForUpdate(user: any | null): string[] {
    if (!user) return []
    if (this.hasRole(user, 'admin')) return ['*']
    return ['title', 'body', 'status']
  }
}
```

In this example:

- **Creating** as an admin allows all five fields. Other users can only submit `title` and `body`. Submitting `status` as a non-admin returns 403.
- **Updating** as an admin allows all fields. Other users can update `title`, `body`, and `status`.
- VineJS enforces that `title` is max 255 chars, `status` is one of the allowed values, `priority` is between 1-10, and `author_email` is a valid email — regardless of role.
