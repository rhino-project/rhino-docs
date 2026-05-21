---
sidebar_position: 14
title: Blueprint
---

# Blueprint — Zero-Token Code Generation

Generate fully working models, policies, tests, and seeders from YAML spec files — no AI tokens consumed, fully deterministic.

## Why Blueprint?

The [Interactive Generator](./generator.md) scaffolds resources one at a time with commented-out permission methods. Blueprint takes a different approach:

| | Interactive Generator | Blueprint |
|---|---|---|
| Input | CLI prompts | YAML spec files |
| Policies | Methods **commented out** | Methods with **full working code** |
| Tests | CRUD access only | CRUD + field visibility + forbidden fields |
| Seeders | Basic role seeder | Aggregated permissions from all models |
| Batch | One model at a time | All models at once |
| Repeatability | Manual | Hash-based skip for unchanged specs |

Blueprint is ideal when you know your full permission matrix upfront — especially for multi-role, multi-tenant applications.

## Quick Start

### 1. Create Blueprint Directory

The `.rhino/` directory is created automatically during installation:

```bash title="terminal"
npx rhino rhino:install
```

This creates:
```
.rhino/
  blueprints/       # Your YAML spec files go here
  BLUEPRINT.md      # AI guide for generating YAML specs
```

### 2. Define Roles

```yaml title=".rhino/blueprints/_roles.yaml"
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
npx rhino rhino:blueprint
```

This generates **per model**:
- `app/models/contract.ts` — Prisma model with HasRhino, HasValidation, column config
- `database/migrations/xxxx_create_contracts_table.ts` — Knex migration
- `app/models/scopes/contract_scope.ts` — auto-discovery scope
- `app/policies/contract_policy.ts` — **fully working** permission methods
- `tests/unit/contract.spec.ts` — CRUD, field visibility, and forbidden field tests

And **cross-model**:
- `database/seeders/role_seeder.ts` — creates all roles
- `database/seeders/user_role_seeder.ts` — sample users with aggregated permissions

## Command Options

```bash title="terminal"
# Generate all models
npx rhino rhino:blueprint

# Process a single model
npx rhino rhino:blueprint --model=contracts

# Preview without writing files
npx rhino rhino:blueprint --dry-run

# Force regeneration (ignore cached hashes)
npx rhino rhino:blueprint --force

# Skip specific artifacts
npx rhino rhino:blueprint --skip-tests
npx rhino rhino:blueprint --skip-seeders

# Custom blueprint directory
npx rhino rhino:blueprint --dir=.rhino/blueprints
```

## Generated Policy Example

From the spec above, `contract_policy.ts` contains **active, working code**:

```ts title="app/policies/contract_policy.ts"
import { ResourcePolicy } from '@rhino-dev/rhino-nestjs/policies/resource_policy'

export default class ContractPolicy extends ResourcePolicy {
  static resourceSlug = 'contracts'

  permittedAttributesForShow(user: any): string[] {
    if (this.hasRole(user, 'owner') || this.hasRole(user, 'admin')) {
      return ['*']
    }

    if (this.hasRole(user, 'viewer')) {
      return ['id', 'title', 'status']
    }

    return []
  }

  hiddenAttributesForShow(user: any): string[] {
    if (this.hasRole(user, 'viewer')) {
      return ['total_value']
    }

    return []
  }

  permittedAttributesForCreate(user: any): string[] {
    if (this.hasRole(user, 'owner')) {
      return ['*']
    }

    if (this.hasRole(user, 'admin')) {
      return ['title', 'total_value', 'status']
    }

    return []
  }

  // permittedAttributesForUpdate follows the same pattern...
}
```

**Roles with identical field sets are grouped** into combined `if` branches.

## Generated Test Example

Tests cover three dimensions of permission enforcement:

```ts title="tests/unit/contract.spec.ts"
// 1. CRUD Access — correct HTTP status codes
test('allows admin to access allowed contracts endpoints', async ({ client }) => {
  // index → 200, show → 200, store → 201
})

test('blocks viewer from blocked contracts endpoints', async ({ client }) => {
  // store → 403, update → 403, destroy → 403
})

// 2. Field Visibility — correct fields in responses
test('shows only permitted fields for viewer on contracts', async ({ client, assert }) => {
  // assert.property(data, 'title')
  // assert.notProperty(data, 'total_value')
})

// 3. Forbidden Fields — rejects writes with restricted fields
test('returns 403 when viewer tries to set restricted fields on contracts', async ({ client }) => {
  // POST with 'total_value' → 403
})
```

## YAML Spec Reference

### File Format

```yaml
model: ModelName          # PascalCase singular (required)
slug: model_names         # snake_case plural (auto-derived)
table: model_names        # table name (defaults to slug)

options:
  belongs_to_organization: false  # multi-tenant scoping
  soft_deletes: true              # SoftDeletes mixin
  audit_trail: false              # HasAuditTrail mixin
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

| Type | Migration | VineJS |
|------|-----------|--------|
| `string` | `table.string()` | `vine.string().maxLength(255)` |
| `text` | `table.text()` | `vine.string()` |
| `integer` | `table.integer()` | `vine.number()` |
| `bigInteger` | `table.bigInteger()` | `vine.number()` |
| `boolean` | `table.boolean()` | `vine.boolean()` |
| `date` | `table.date()` | `vine.string()` |
| `datetime` | `table.datetime()` | `vine.string()` |
| `timestamp` | `table.timestamp()` | `vine.string()` |
| `decimal` | `table.decimal(p, s)` | `vine.number()` |
| `float` | `table.float()` | `vine.number()` |
| `json` | `table.json()` | `vine.object({})` |
| `uuid` | `table.uuid()` | `vine.string().uuid()` |
| `foreignId` | `table.integer().unsigned().references('id')` | `vine.number()` |

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

The `.rhino/BLUEPRINT.md` file (created during `npx rhino rhino:install`) is a comprehensive guide that teaches AI assistants how to generate blueprint YAML files.

Point your AI assistant to this file:

> "Read `.rhino/BLUEPRINT.md` and create a blueprint YAML file for a BlogPost model with title, content, status, and category fields. Use the roles from `_roles.yaml`."

The guide includes the complete format spec, examples, and questions the AI should ask.

## Aggregated Seeders

Permissions from all blueprint files are aggregated into a single `UserRoleSeeder`:

```ts title="database/seeders/user_role_seeder.ts"
// Generated from: contracts.yaml, alerts.yaml, ...
await UserRole.firstOrCreate(
  { userId: adminUser.id, organizationId: org.id, roleId: adminRole.id },
  {
    permissions: [
      'contracts.*',
      'alerts.index', 'alerts.show', 'alerts.update',
      // ... permissions from every blueprint
    ]
  }
)
```

When a role has wildcard access to **all** models, it simplifies to `['*']`.

## Cross-Framework Compatibility

The YAML spec format is **shared across all Rhino frameworks** (Laravel, NestJS, Rails, Django). The same `.rhino/blueprints/` directory can generate framework-specific code for each target:

| Concern | Laravel | NestJS |
|---------|---------|----------|
| CLI | `php artisan rhino:blueprint` | `npx rhino rhino:blueprint` |
| Models | Eloquent + traits | Prisma + compose() mixins |
| Validation | Laravel rules | VineJS schemas |
| Tests | Pest / PHPUnit | Japa |
| Migrations | Laravel migrations | Knex migrations |
| Config | `config/rhino.php` | `src/rhino.config.ts` |
