---
sidebar_position: 14
title: Blueprint
---

# Blueprint — Zero-Token Code Generation

Generate fully working models, policies, tests, and seeders from YAML spec files — no AI tokens consumed, fully deterministic.

## Why Blueprint?

The [Interactive Generator](./generator.md) scaffolds individual stubs one at a time with commented-out permission methods. Blueprint takes a different approach:

| | Interactive Generator | Blueprint |
|---|---|---|
| Input | CLI prompts | YAML spec files |
| Policies | Methods **commented out** | Methods with **full working code** |
| Tests | — | CRUD + field visibility + forbidden fields |
| Seeders | — | Sample rows per model |
| Batch | One stub at a time | All models at once |
| Repeatability | Manual | Hash-based skip for unchanged specs |

Blueprint is ideal when you know your full permission matrix upfront — especially for multi-role, multi-tenant applications.

## Quick Start

### 1. Create Blueprint Directory

The `.rhino/` directory is created automatically during installation:

```bash title="terminal"
npx rhino install
```

This creates:
```
.rhino/
  _roles.yaml       # Role definitions (shared across all blueprints)
  blueprints/       # Your model YAML spec files go here
  BLUEPRINT.md      # AI guide for generating YAML specs
```

### 2. Define Roles

```yaml title=".rhino/_roles.yaml"
roles:
  owner:
    name: Owner
    description: "Full access. Manages plan, billing, users."
  admin:
    name: Admin
    description: "Operational admin. Manages users, settings."
  viewer:
    name: Viewer
    description: "Read-only access."
```

### 3. Define a Model Blueprint

```yaml title=".rhino/blueprints/contracts.yaml"
model: Contract
slug: contracts

options:
  belongs_to_organization: true
  soft_deletes: true

columns:
  title:
    type: string
    filterable: true
    sortable: true
    searchable: true

  total_value:
    type: decimal
    nullable: true
    precision: 10
    scale: 2

  status:
    type: string
    default: "draft"
    filterable: true

  uploaded_by:
    type: foreignId
    foreign_model: User

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"

  admin:
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: &admin_writable
      - title
      - total_value
      - status
    update_fields: *admin_writable

  viewer:
    actions: [index, show]
    show_fields: [id, title, status]
    create_fields: []
    update_fields: []
    hidden_fields: [total_value]
```

### 4. Generate

```bash title="terminal"
npx rhino blueprint
```

This generates **per model**:
- A Prisma model fragment appended to `prisma/schema.prisma`
- `src/resources/{Model}Resource.ts` — the `ModelRegistration` object (with role-keyed Zod validation, query config, soft deletes, etc.)
- `src/policies/{Model}Policy.ts` — **fully working** permission methods
- `test/generated/{Model}.spec.ts` — Jest tests covering CRUD, field visibility, and forbidden fields
- `src/seeders/{Model}Seeder.ts` — a seeder that inserts sample rows

After generating, import each `*Resource` registration into `src/rhino.config.ts` and run `npx prisma migrate dev` to apply the schema changes.

## Command Options

```bash title="terminal"
# Generate all models
npx rhino blueprint

# Process a single model by slug
npx rhino blueprint --model=contracts

# Preview without writing files
npx rhino blueprint --dry-run

# Force regeneration (ignore cached hashes)
npx rhino blueprint --force
```

## Generated Policy Example

From the spec above, `ContractPolicy.ts` contains **active, working code**:

```ts title="src/policies/ContractPolicy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs';

export class ContractPolicy extends ResourcePolicy {
  override resourceSlug = 'contracts';

  override permittedAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'owner', org) || this.hasRole(user, 'admin', org)) {
      return ['*'];
    }
    if (this.hasRole(user, 'viewer', org)) {
      return ['id', 'title', 'status'];
    }
    return [];
  }

  override hiddenAttributesForShow(user: any, org?: any): string[] {
    if (this.hasRole(user, 'viewer', org)) {
      return ['total_value'];
    }
    return [];
  }

  override permittedAttributesForCreate(user: any, org?: any): string[] {
    if (this.hasRole(user, 'owner', org)) {
      return ['*'];
    }
    if (this.hasRole(user, 'admin', org)) {
      return ['title', 'total_value', 'status'];
    }
    return [];
  }

  // permittedAttributesForUpdate follows the same pattern...
}
```

**Roles with identical field sets are grouped** into combined `if` branches.

## Generated Test Example

Tests are generated as Jest specs in `test/generated/` and cover three dimensions of permission enforcement:

```ts title="test/generated/Contract.spec.ts"
// 1. CRUD Access — correct HTTP status codes
it('allows admin to access allowed contracts endpoints', async () => {
  // index → 200, show → 200, store → 201
});

it('blocks viewer from blocked contracts endpoints', async () => {
  // store → 403, update → 403, destroy → 403
});

// 2. Field Visibility — correct fields in responses
it('shows only permitted fields for viewer on contracts', async () => {
  // expect(data).toHaveProperty('title')
  // expect(data).not.toHaveProperty('total_value')
});

// 3. Forbidden Fields — rejects writes with restricted fields
it('returns 403 when viewer tries to set restricted fields on contracts', async () => {
  // POST with 'total_value' → 403
});
```

## YAML Spec Reference

### File Format

```yaml
model: ModelName          # PascalCase singular (required)
slug: model_names         # snake_case plural (auto-derived)
table: model_names        # table name (defaults to slug)

options:
  belongs_to_organization: false  # sets belongsToOrganization on the registration
  soft_deletes: true              # sets softDeletes on the registration
  audit_trail: false              # sets hasAuditTrail on the registration
  owner: null                     # parent model for child resources
  except_actions: []              # block actions for ALL roles
  pagination: false               # enable pagination
  per_page: 25                    # items per page

columns:
  field_name:
    type: string          # see Column Types
    nullable: false
    unique: false
    index: false
    default: null
    filterable: false
    sortable: false
    searchable: false
    precision: 8          # decimal only
    scale: 2              # decimal only
    foreign_model: null   # foreignId only

relationships:
  - type: belongsTo       # belongsTo, hasMany, hasOne, belongsToMany
    model: User
    foreign_key: user_id  # optional

permissions:
  role_slug:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"          # or array of field names
    create_fields: "*"        # or array, or []
    update_fields: "*"        # or array, or []
    hidden_fields: []         # fields to explicitly remove
```

### Column Types

| Type | Prisma | Zod |
|------|--------|-----|
| `string` | `String` | `z.string().max(255)` |
| `text` | `String` | `z.string()` |
| `integer` | `Int` | `z.number().int()` |
| `bigInteger` | `BigInt` | `z.bigint()` |
| `boolean` | `Boolean` | `z.boolean()` |
| `date` | `DateTime` | `z.string().datetime().or(z.date())` |
| `datetime` | `DateTime` | `z.string().datetime().or(z.date())` |
| `timestamp` | `DateTime` | `z.string().datetime().or(z.date())` |
| `decimal` | `Decimal` (`Float` on SQLite) | `z.number()` |
| `float` | `Float` | `z.number()` |
| `json` | `Json` | `z.record(z.any())` |
| `uuid` | `String` | `z.string().uuid()` |
| `foreignId` | `Int` + `@relation` | `z.number().int()` |

### Permission Surfaces

| Surface | Purpose | Wildcard | Empty |
|---------|---------|----------|-------|
| `show_fields` | Fields in API responses | `"*"` = all | — |
| `create_fields` | Fields allowed on POST | `"*"` = all | `[]` = cannot create |
| `update_fields` | Fields allowed on PUT/PATCH | `"*"` = all | `[]` = cannot update |
| `hidden_fields` | Fields explicitly removed | — | `[]` = nothing hidden |

### Valid Actions

| Action | HTTP | Route |
|--------|------|-------|
| `index` | GET | `/{slug}` |
| `show` | GET | `/{slug}/{id}` |
| `store` | POST | `/{slug}` |
| `update` | PUT/PATCH | `/{slug}/{id}` |
| `destroy` | DELETE | `/{slug}/{id}` |
| `trashed` | GET | `/{slug}/trashed` |
| `restore` | POST | `/{slug}/{id}/restore` |
| `forceDelete` | DELETE | `/{slug}/{id}/force` |

## YAML Anchors (DRY Permissions)

Use YAML anchors to avoid duplicating field lists shared between roles:

```yaml title="Anchors & Aliases"
permissions:
  admin:
    create_fields: &admin_writable   # define anchor
      - title
      - status
      - description
    update_fields: *admin_writable   # reference anchor

  manager:
    create_fields: *admin_writable   # reuse same list
    update_fields: *admin_writable
```

## Manifest & Change Detection

Blueprint tracks file hashes in `.rhino/blueprints/.blueprint-manifest.json`:

- On each run, YAML files are SHA-256 hashed
- Unchanged files are **skipped** automatically
- Use `--force` to bypass hash checks
- Deleted blueprint files produce a warning but **do not delete** generated files

## AI-Assisted Blueprint Creation

The `.rhino/BLUEPRINT.md` file (created during `npx rhino install`) is a comprehensive guide that teaches AI assistants how to generate blueprint YAML files.

Point your AI assistant to this file:

> "Read `.rhino/BLUEPRINT.md` and create a blueprint YAML file for a BlogPost model with title, content, status, and category fields. Use the roles from `_roles.yaml`."

The guide includes the complete format spec, examples, and questions the AI should ask.

## Seeders

Each blueprint generates a per-model seeder under `src/seeders/{Model}Seeder.ts` that upserts a few sample rows via the Prisma client:

```ts title="src/seeders/ContractSeeder.ts"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seed(): Promise<void> {
  await prisma.contract.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      organizationId: 1,
      title: 'Sample Title 1',
      status: 'draft',
      // ...
    },
  });
  // ...
}

if (require.main === module) {
  seed()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
```

Run a seeder directly with `npx ts-node src/seeders/ContractSeeder.ts`, or wire them into your `prisma/seed.ts`.

## Cross-Framework Compatibility

The YAML spec format is **shared across all Rhino frameworks** (Laravel, NestJS, Rails, Django). The same `.rhino/blueprints/` directory can generate framework-specific code for each target:

| Concern | Laravel | NestJS |
|---------|---------|----------|
| CLI | `php artisan rhino:blueprint` | `npx rhino blueprint` |
| Models | Eloquent + traits | Prisma schema + `ModelRegistration` |
| Validation | Laravel rules | Zod schemas |
| Tests | Pest / PHPUnit | Jest |
| Migrations | Laravel migrations | Prisma migrations |
| Config | `config/rhino.php` | `src/rhino.config.ts` |
