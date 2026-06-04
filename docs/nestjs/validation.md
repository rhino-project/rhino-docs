---
sidebar_position: 4
title: Validation
---

# Validation

Rhino provides a two-layer validation system:

1. **Policy-driven field permissions** — the policy determines which fields each user is allowed to submit for create and update actions
2. **Zod schemas** (`validation` / `validationStore` / `validationUpdate`) — type and format validation using [Zod](https://zod.dev/)

## How It Works

When a store or update request is received, Rhino follows this process:

1. **Resolve permitted fields** — calls `permittedAttributesForCreate(user)` or `permittedAttributesForUpdate(user)` on the policy to determine which fields the user is allowed to submit
2. **Check for forbidden fields** — if the request contains fields not in the permitted list, returns **403 Forbidden** with a message listing the forbidden fields
3. **Run Zod validation** — validates the permitted fields against the resolved schema
4. **Return result** — `{ valid: true, data }` or `{ valid: false, errors }`

## Zod Schemas

Define per-field type constraints with a Zod object schema on the model registration in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
import { z } from 'zod';

posts: {
  model: 'post',
  validation: z.object({
    title: z.string().max(255),
    content: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
    email: z.string().email(),
    score: z.number().min(0).max(100),
    isActive: z.boolean(),
    startsAt: z.string().datetime({ offset: true }).or(z.date()),
  }),
},
```

Zod provides full TypeScript type inference and a rich set of built-in rules. See the [Zod documentation](https://zod.dev/) for all available schema types and rules.

### Store vs Update Schemas

`validation` applies to both create and update. To use different rules per action, set `validationStore` and/or `validationUpdate`, which override `validation` for that action:

```ts title="src/rhino.config.ts"
import { z } from 'zod';

posts: {
  model: 'post',
  validationStore: z.object({
    title: z.string().max(255),                 // required on create
    content: z.string(),
    status: z.string().optional(),
  }),
  validationUpdate: z.object({
    title: z.string().max(255).optional(),      // optional on update
    content: z.string().optional(),
    status: z.string().optional(),
  }),
},
```

### Role-Keyed Schemas

`validationStore` and `validationUpdate` can also be a `Record<string, ZodSchema>` keyed by role slug. The schema for the user's role is selected at runtime; a `'*'` key acts as the fallback:

```ts title="src/rhino.config.ts"
import { z } from 'zod';

const validationStore: Record<string, z.ZodTypeAny> = {
  admin: z.object({
    title: z.string(),
    status: z.string().optional(),
    budget: z.number().nullable().optional(),
  }),
  member: z.object({
    title: z.string(),
  }),
  '*': z.object({}), // fallback for any other role
};

projects: {
  model: 'project',
  validationStore,
},
```

This pairs naturally with role-based field permissions in the policy — the Zod schema enforces type/format, while the policy decides which fields each role may submit at all.

## Policy-Driven Field Permissions

Field permissions are defined on the **policy**, not the registration. See [Policies — Attribute Permissions](./policies#attribute-permissions) for full details.

```ts title="src/policies/PostPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class PostPolicy extends ResourcePolicy {
  override resourceSlug = 'posts';

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org) ? ['*'] : ['title', 'content'];
  }

  override permittedAttributesForUpdate(user: any, org?: any): string[] {
    if (!user) return [];
    if (this.hasRole(user, 'admin', org)) return ['*'];
    return ['title', 'content'];
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

When Zod format validation fails, the controller returns a `422 Unprocessable Entity` response:

```json title="Response"
{
  "errors": {
    "title": ["String must contain at most 255 character(s)"],
    "status": ["Invalid enum value. Expected 'draft' | 'published' | 'archived'"]
  }
}
```

Each field key maps to an array of error messages derived from Zod's issues.

## Complete Example

```ts title="src/rhino.config.ts"
import { z } from 'zod';
import { ArticlePolicy } from './policies/ArticlePolicy';

articles: {
  model: 'article',
  policy: ArticlePolicy,
  validation: z.object({
    title: z.string().max(255),
    body: z.string(),
    status: z.enum(['draft', 'review', 'published']),
    priority: z.number().min(1).max(10),
    authorEmail: z.string().email(),
  }),
},
```

```ts title="src/policies/ArticlePolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class ArticlePolicy extends ResourcePolicy {
  override resourceSlug = 'articles';

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (!user) return [];
    return this.hasRole(user, 'admin', org)
      ? ['title', 'body', 'status', 'priority', 'authorEmail']
      : ['title', 'body'];
  }

  override permittedAttributesForUpdate(user: any, org?: any): string[] {
    if (!user) return [];
    if (this.hasRole(user, 'admin', org)) return ['*'];
    return ['title', 'body', 'status'];
  }
}
```

In this example:

- **Creating** as an admin allows all five fields. Other users can only submit `title` and `body`. Submitting `status` as a non-admin returns 403.
- **Updating** as an admin allows all fields. Other users can update `title`, `body`, and `status`.
- Zod enforces that `title` is max 255 chars, `status` is one of the allowed values, `priority` is between 1-10, and `authorEmail` is a valid email — regardless of role.
