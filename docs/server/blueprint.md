---
sidebar_position: 11
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
php artisan rhino:install
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
php artisan rhino:blueprint
```

This generates **per model**:
- `app/Models/Contract.php` — model with fillable, validation, query builder config
- `database/migrations/xxxx_create_contracts_table.php` — migration
- `database/factories/ContractFactory.php` — factory with faker values
- `app/Models/Scopes/ContractScope.php` — auto-discovery scope
- `app/Policies/ContractPolicy.php` — **fully working** permission methods
- `tests/Model/ContractTest.php` — CRUD, field visibility, and forbidden field tests

And **cross-model**:
- `database/seeders/RoleSeeder.php` — creates all roles
- `database/seeders/UserRoleSeeder.php` — sample users with aggregated permissions

## Command Options

```bash title="terminal"
# Generate all models
php artisan rhino:blueprint

# Process a single model
php artisan rhino:blueprint --model=contracts

# Preview without writing files
php artisan rhino:blueprint --dry-run

# Force regeneration (ignore cached hashes)
php artisan rhino:blueprint --force

# Skip specific artifacts
php artisan rhino:blueprint --skip-tests
php artisan rhino:blueprint --skip-seeders

# Custom blueprint directory
php artisan rhino:blueprint --dir=.rhino/blueprints
```

## Generated Policy Example

From the spec above, `ContractPolicy.php` contains **active, working code**:

```php title="app/Policies/ContractPolicy.php"
class ContractPolicy extends ResourcePolicy
{
    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'owner')
            || $this->hasRole($user, 'admin')) {
            return ['*'];
        }

        if ($this->hasRole($user, 'viewer')) {
            return ['id', 'title', 'status'];
        }

        return [];
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'viewer')) {
            return ['total_value'];
        }

        return [];
    }

    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'owner')) {
            return ['*'];
        }

        if ($this->hasRole($user, 'admin')) {
            return ['title', 'total_value', 'status'];
        }

        return [];
    }

    // permittedAttributesForUpdate follows the same pattern...
}
```

**Roles with identical field sets are grouped** into combined `if` branches.

## Generated Test Example

Tests cover three dimensions of permission enforcement:

```php title="tests/Model/ContractTest.php"
// 1. CRUD Access — correct HTTP status codes
it('allows admin to access index on contracts', function () { /* 200 */ });
it('blocks viewer from accessing store on contracts', function () { /* 403 */ });

// 2. Field Visibility — correct fields in responses
it('shows only permitted fields for viewer on contracts', function () {
    // assertArrayHasKey('title', $data)
    // assertArrayNotHasKey('total_value', $data)
});

// 3. Forbidden Fields — rejects writes with restricted fields
it('returns 403 when viewer sets restricted fields on contracts create', function () {
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
  belongs_to_organization: false  # multi-tenant scoping
  soft_deletes: true              # SoftDeletes trait
  audit_trail: false              # HasAuditTrail trait
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

| Type | Migration | Faker |
|------|-----------|-------|
| `string` | `$table->string()` | `fake()->sentence(3)` |
| `text` | `$table->text()` | `fake()->paragraph()` |
| `integer` | `$table->integer()` | `fake()->numberBetween(1, 100)` |
| `bigInteger` | `$table->bigInteger()` | `fake()->numberBetween(1, 10000)` |
| `boolean` | `$table->boolean()` | `fake()->boolean()` |
| `date` | `$table->date()` | `fake()->date()` |
| `datetime` | `$table->datetime()` | `fake()->dateTime()` |
| `timestamp` | `$table->timestamp()` | `fake()->dateTime()` |
| `decimal` | `$table->decimal(p, s)` | `fake()->randomFloat(2, 0, 1000)` |
| `float` | `$table->float()` | `fake()->randomFloat(2, 0, 1000)` |
| `json` | `$table->json()` | `[]` |
| `uuid` | `$table->uuid()` | `fake()->uuid()` |
| `foreignId` | `$table->foreignId()->constrained()` | `Model::factory()` |

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

The `.rhino/BLUEPRINT.md` file (created during `rhino:install`) is a comprehensive guide that teaches AI assistants how to generate blueprint YAML files.

Point your AI assistant to this file:

> "Read `.rhino/BLUEPRINT.md` and create a blueprint YAML file for a BlogPost model with title, content, status, and category fields. Use the roles from `_roles.yaml`."

The guide includes the complete format spec, examples, and questions the AI should ask.

## Aggregated Seeders

Permissions from all blueprint files are aggregated into a single `UserRoleSeeder`:

```php title="database/seeders/UserRoleSeeder.php"
// Generated from: contracts.yaml, alerts.yaml, ...
UserRole::firstOrCreate(
    ['user_id' => $adminUser->id, ...],
    ['permissions' => [
        'contracts.*',
        'alerts.index', 'alerts.show', 'alerts.update',
        // ... permissions from every blueprint
    ]]
);
```

When a role has wildcard access to **all** models, it simplifies to `['*']`.
