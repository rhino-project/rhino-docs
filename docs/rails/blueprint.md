---
sidebar_position: 13
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
| Tests | None | CRUD + field visibility + forbidden fields |
| Seeders | Basic role seeder | Aggregated permissions from all models |
| Batch | One model at a time | All models at once |
| Repeatability | Manual | Hash-based skip for unchanged specs |

Blueprint is ideal when you know your full permission matrix upfront — especially for multi-role, multi-tenant applications.

## Quick Start

### 1. Create Blueprint Directory

The `.rhino/` directory is created automatically during installation:

```bash title="terminal"
rails rhino:install
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
rails rhino:blueprint
```

This generates **per model**:
- `app/models/contract.rb` — RhinoModel with concerns, validations, query config
- `db/migrate/xxxx_create_contracts.rb` — ActiveRecord migration
- `spec/factories/contracts.rb` — FactoryBot factory with Faker
- `app/models/scopes/contract_scope.rb` — auto-discovery scope
- `app/policies/contract_policy.rb` — **fully working** permission methods
- `spec/models/contract_spec.rb` — CRUD, field visibility, and forbidden field tests

And **cross-model**:
- `db/seeds/role_seeder.rb` — creates all roles
- `db/seeds/user_role_seeder.rb` — sample users with aggregated permissions

## Command Options

```bash title="terminal"
# Generate all models
rails rhino:blueprint

# Process a single model
rails rhino:blueprint --model=contracts

# Preview without writing files
rails rhino:blueprint --dry-run

# Force regeneration (ignore cached hashes)
rails rhino:blueprint --force

# Skip specific artifacts
rails rhino:blueprint --skip-tests
rails rhino:blueprint --skip-seeders

# Custom blueprint directory
rails rhino:blueprint --dir=.rhino/blueprints
```

## Generated Policy Example

From the spec above, `contract_policy.rb` contains **active, working code**:

```ruby title="app/policies/contract_policy.rb"
class ContractPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'contracts'

  def permitted_attributes_for_show(user)
    return ['*'] if has_role?(user, 'owner') || has_role?(user, 'admin')
    return ['id', 'title', 'status'] if has_role?(user, 'viewer')
    []
  end

  def hidden_attributes_for_show(user)
    return ['total_value'] if has_role?(user, 'viewer')
    []
  end

  def permitted_attributes_for_create(user)
    return ['*'] if has_role?(user, 'owner')
    return ['title', 'total_value', 'status'] if has_role?(user, 'admin')
    []
  end

  # permitted_attributes_for_update follows the same pattern...
end
```

**Roles with identical field sets are grouped** into combined `if` branches.

## Generated Test Example

Tests cover three dimensions of permission enforcement:

```ruby title="spec/models/contract_spec.rb"
# 1. CRUD Access — correct HTTP status codes
it 'allows admin to access allowed contracts endpoints' do
  # index → :ok, show → :ok, store → :created
end

it 'blocks viewer from blocked contracts endpoints' do
  # store → :forbidden, update → :forbidden, destroy → :forbidden
end

# 2. Field Visibility — correct fields in responses
it 'shows only permitted fields for viewer on contracts' do
  # expect(data).to have_key('title')
  # expect(data).not_to have_key('total_value')
end

# 3. Forbidden Fields — rejects writes with restricted fields
it 'returns 403 when viewer tries to set restricted fields on contracts' do
  # POST with 'total_value' → :forbidden
end
```

## YAML Spec Reference

### File Format

```yaml
model: ModelName          # PascalCase singular (required)
slug: model_names         # snake_case plural (auto-derived)
table: model_names        # table name (defaults to slug)

options:
  belongs_to_organization: false  # multi-tenant scoping
  soft_deletes: true              # Discard::Model
  audit_trail: false              # HasAuditTrail concern
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

| Type | Migration | ActiveModel |
|------|-----------|-------------|
| `string` | `t.string` | `length: { maximum: 255 }` |
| `text` | `t.text` | — |
| `integer` | `t.integer` | `numericality: { only_integer: true }` |
| `bigInteger` | `t.bigint` | `numericality: { only_integer: true }` |
| `boolean` | `t.boolean` | `inclusion: { in: [true, false] }` |
| `date` | `t.date` | — |
| `datetime` | `t.datetime` | — |
| `timestamp` | `t.timestamp` | — |
| `decimal` | `t.decimal(precision:, scale:)` | `numericality: true` |
| `float` | `t.float` | `numericality: true` |
| `json` | `t.json` | — |
| `uuid` | `t.uuid` | — |
| `foreignId` | `t.references :model, foreign_key: true` | `numericality: { only_integer: true }` |

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

## Manifest & Change Detection

Blueprint tracks file hashes in `.rhino/blueprints/.blueprint-manifest.json`:

- On each run, YAML files are SHA-256 hashed
- Unchanged files are **skipped** automatically
- Use `--force` to bypass hash checks
- Deleted blueprint files produce a warning but **do not delete** generated files

## AI-Assisted Blueprint Creation

The `.rhino/BLUEPRINT.md` file (created during `rails rhino:install`) is a guide that teaches AI assistants how to generate blueprint YAML files.

## Cross-Framework Compatibility

The YAML spec format is **shared across all Rhino frameworks**:

| Concern | Laravel | Rails | NestJS |
|---------|---------|-------|--------|
| CLI | `php artisan rhino:blueprint` | `rails rhino:blueprint` | `npx rhino blueprint` |
| Models | Eloquent + traits | RhinoModel + concerns | Prisma schema |
| Validation | Laravel rules | ActiveModel validates | class-validator / Zod |
| Tests | Pest / PHPUnit | RSpec + FactoryBot | Jest |
| Migrations | Laravel migrations | ActiveRecord migrations | Prisma migrate |
| Config | `config/rhino.php` | `config/initializers/rhino.rb` | `src/rhino.config.ts` |
