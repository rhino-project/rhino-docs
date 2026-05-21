---
sidebar_position: 13
title: Generator
---

# Generator

Rhino includes an interactive Ace command that scaffolds resources with all the Rhino conventions pre-configured. Generate models with migrations, policies, and scopes in seconds.

## Usage

```bash title="terminal"
npx rhino rhino:generate
```

Or use the shorthand alias:

```bash title="terminal"
npx rhino rhino:g
```

The command launches an interactive prompt that walks you through the entire scaffolding process.

## What It Generates

The generator can create three types of resources:

### Model (with Migration)

Generates a complete Rhino-ready model file and its corresponding database migration. The model extends `RhinoModel` and includes:
- `allowedFilters`, `allowedSorts`, `defaultSort`, `allowedIncludes`, `allowedFields`, `allowedSearch`
- `validationSchema` (VineJS type/format schemas)
- Prisma column decorators with proper TypeScript types
- Relationship declarations for foreign key columns
- Soft delete support (optional)
- Automatic registration in `src/rhino.config.ts`

**Generated files:**
- `app/models/{model_name}.ts` -- The Prisma model
- `database/migrations/{timestamp}_create_{table}_table.ts` -- The migration
- `src/rhino.config.ts` -- Updated with the new model registration

### Policy

Generates a policy class that extends `ResourcePolicy`:

```ts title="app/policies/post_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class PostPolicy extends ResourcePolicy {
  static resourceSlug = 'posts'

  // All CRUD methods inherited from ResourcePolicy.
  // Override for custom authorization logic.
}
```

**Generated file:** `app/policies/{model_name}_policy.ts`

### Scope

Generates a global query scope class for use with the `HasAutoScope` mixin:

```ts title="app/models/scopes/post_scope.ts"
import type { ModelQueryBuilderContract } from '@nestjs/lucid/types/model'

export default class PostScope {
  static apply(query: ModelQueryBuilderContract<any>) {
    // Add your global scope logic here
    // e.g., query.where('is_visible', true)
    return query
  }
}
```

**Generated file:** `app/models/scopes/{model_name}_scope.ts`

## Interactive Walkthrough

### Step 1: Choose Resource Type

```
What type of resource would you like to generate?
> Model (with migration)
  Policy (extends ResourcePolicy)
  Scope (global query scope)
```

### Step 2: Enter Resource Name

```
What is the resource name?
> Post
```

Use PascalCase singular (e.g., `Post`, not `posts`). The generator derives the table name, file name, and slug automatically.

### Step 3: Organization Ownership (Multi-Tenant Only)

If multi-tenancy is enabled in your config, you are asked:

```
Does this model belong to an organization? (Y/n)
```

Organization ownership is auto-detected from `belongsTo` relationships at runtime.

### Step 4: Define Columns

```
Would you like to define columns interactively? (Y/n)
```

For each column, you specify:

| Prompt | Description |
|--------|-------------|
| Column name | Snake_case name (e.g., `title`, `user_id`, `is_published`) |
| Column type | One of: `string`, `text`, `integer`, `boolean`, `date`, `datetime`, `decimal`, `uuid`, `references` |
| Foreign model | For `references` type only -- which model does this column reference |
| Nullable? | Whether the column allows null values |
| Unique? | Whether the column has a unique constraint |
| Has index? | Whether to add a database index |
| Default value | Optional default value |

## Column Definitions

The generator supports the following column types:

| Type | Database Column | TypeScript Type | VineJS Schema |
|------|----------------|-----------------|---------------|
| `string` | `VARCHAR(255)` | `string` | `vine.string().maxLength(255)` |
| `text` | `TEXT` | `string` | `vine.string()` |
| `integer` | `INTEGER` | `number` | `vine.number()` |
| `boolean` | `BOOLEAN` | `boolean` | `vine.boolean()` |
| `date` | `DATE` | `DateTime` | `vine.date()` |
| `datetime` | `TIMESTAMP` | `DateTime` | `vine.date()` |
| `decimal` | `DECIMAL(10,2)` | `number` | `vine.number()` |
| `uuid` | `UUID` | `string` | `vine.string()` |
| `references` | `INTEGER` (FK) | `number` | `vine.number()` |

For `references` columns, the generator automatically:
- Creates a foreign key constraint in the migration
- Generates a `@belongsTo` relationship on the model
- Adds the related model name to `allowedIncludes`

### Step 5: Additional Options

```
Additional options
> [ ] Add soft deletes
  [ ] Generate policy
  [ ] Add audit trail
```

- **Soft deletes** -- adds `static softDeletes = true` and a `deleted_at` column
- **Generate policy** -- creates a policy file alongside the model
- **Audit trail** -- adds the `HasAuditTrail` mixin

## Usage Examples

### Basic Model

```bash title="terminal"
$ npx rhino rhino:generate

? What type of resource would you like to generate? Model (with migration)
? What is the resource name? Post
? Would you like to define columns interactively? Yes

? Column name: title
? Column type for 'title': string (VARCHAR 255)
? Is 'title' nullable? No
? Should 'title' be unique? No
? Should 'title' have an index? No
? Default value for 'title'?

? Add another column? Yes

? Column name: content
? Column type for 'content': text (TEXT)
? Is 'content' nullable? No
...

? Additional options: Add soft deletes, Generate policy

CREATE app/models/post.ts
CREATE database/migrations/2026_02_23_120000_create_posts_table.ts
UPDATE src/rhino.config.ts
CREATE app/policies/post_policy.ts
```

### Policy Only

```bash title="terminal"
$ npx rhino rhino:generate

? What type of resource would you like to generate? Policy (extends ResourcePolicy)
? What is the resource name? Post

CREATE app/policies/post_policy.ts
```

### Scope Only

```bash title="terminal"
$ npx rhino rhino:generate

? What type of resource would you like to generate? Scope (global query scope)
? What is the resource name? Post

CREATE app/models/scopes/post_scope.ts
```

## Auto-Registration

When generating a model, the command automatically registers it in `src/rhino.config.ts` by inserting a new entry into the `models` map:

```ts title="src/rhino.config.ts"
models: {
  // existing models...
  posts: () => import('#models/post'),  // <-- added by generator
},
```

If the model slug already exists in the config, the registration step is skipped.

## Generated Model Example

For a `BlogPost` model with `title` (string), `content` (text), and `user` (references User) columns, soft deletes, and organization ownership, the generator produces:

```ts title="app/models/blog_post.ts"
import { DateTime } from 'luxon'
import { column, belongsTo } from '@nestjs/lucid/orm'
import type { BelongsTo } from '@nestjs/lucid/types/relations'
import { compose } from '@nestjs/core/helpers'
import vine from '@vinejs/vine'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'
import User from '#models/user'

export default class BlogPost extends compose(RhinoModel, BelongsToOrganization) {
  static table = 'blog_posts'

  static softDeletes = true
  static allowedFilters = ['title', 'user_id']
  static allowedSorts = ['title', 'user_id', 'created_at']
  static defaultSort = '-created_at'
  static allowedIncludes = ['user']
  static allowedFields = ['id', 'title', 'content', 'user_id', 'created_at']
  static allowedSearch = ['title', 'content']

  static validationSchema = {
    title: vine.string().maxLength(255),
    content: vine.string(),
    user_id: vine.number(),
  }

  // Field permissions are controlled by the policy.

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare userId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
```

## Next Steps After Generation

The generator prints a summary with next steps:

```
Post model generated successfully!

Created files:
  Model       app/models/post.ts
  Migration   database/migrations/..._create_posts_table.ts
  Config      src/rhino.config.ts (registered as 'posts')
  Policy      app/policies/post_policy.ts

Next steps:
  1. Run migrations: npx prisma migrate deploy
  2. Review the generated model at: app/models/post.ts
  3. Your API endpoints: GET/POST /api/posts, GET/PUT/DELETE /api/posts/:id
```
