---
sidebar_position: 6
title: "Codegen"
---

# Codegen

Rhino generates the boring, error-prone parts of your API — migrations, models, policies, factories, tests, config registration, and client types — from a small set of authoritative inputs. The rule that makes all of it pay off: **treat the generator inputs as source, and everything they emit as build output.** You edit the blueprint; you never edit the artifact.

This page shows the Helpdesk app expressed as [Blueprint](../blueprint) YAML, the [generate](../generator) workflow, and how to [export client types](../export-types) so your React and React Native apps stay in lockstep with the schema.

See also the hub ([Best Practices](./)) and the sibling pages this one leans on: [Models & Queries](./models-and-queries), [Authorization](./authorization), [Tenant Safety](./tenant-safety), and [Data Lifecycle](./data-lifecycle).

## The core principle: inputs are source, artifacts are build output

Every file `rhino:blueprint` and `rhino:generate` write — `app/Models/Ticket.php`, the migration, `TicketPolicy.php`, `TicketFactory.php`, the test, the `config/rhino.php` entry — is regenerable. Blueprint tracks a SHA-256 hash of each YAML file in `.rhino/blueprints/.blueprint-manifest.json` and re-emits on change. That is exactly what makes hand-edits dangerous: the next `--force` run, or the next teammate who bumps a column, overwrites your change without asking.

```php title="app/Models/Ticket.php"
// ❌ Bad — hand-editing a generated model. Silently reverted on the next regenerate.
class Ticket extends RhinoModel
{
    public static $allowedFilters = ['status', 'priority', 'assignee_id']; // added by hand
    // ...
}
```

```yaml title=".rhino/blueprints/tickets.yaml"
# ✅ Good — encode the intent in the blueprint; the model is derived from it.
columns:
  status:
    type: string
    filterable: true
  priority:
    type: string
    filterable: true
  assignee_id:
    type: foreignId
    foreign_model: User
    filterable: true
```

:::warning Generated files are not yours to edit
`app/Models/*`, `database/migrations/*`, `database/factories/*`, `app/Policies/*`, `app/Models/Scopes/*`, and `tests/Model/*` are Blueprint output. Change the YAML and re-run — don't patch the artifact. The only files you own outright are ones Blueprint never writes (custom controllers, custom scope bodies, service classes).
:::

## Blueprint the Helpdesk tables

The Helpdesk app has two flavors of table: **global catalog** models in the single-tenant `app` group (no `organization_id`), and **tenant** models in the multitenant `tenant` group (org-scoped by column or by relationship chain). Blueprint expresses both. Start with roles, since permissions reference them.

### Roles

```yaml title=".rhino/blueprints/_roles.yaml"
roles:
  admin:
    name: Admin
    description: "Full CRUD on the org's tickets and members; sees internal notes."
  agent:
    name: Agent
    description: "CRUD tickets, add comments; sees internal notes; cannot manage members."
  viewer:
    name: Viewer
    description: "Read-only tickets; no internal notes or internal comments."
```

### A global catalog table — `categories`

`Category` is shared across the whole product (articles and tickets both point at it) and has **no** `organization_id`. So its blueprint omits `belongs_to_organization` entirely — that single option is the difference between a global model and a tenant model.

```yaml title=".rhino/blueprints/categories.yaml"
model: Category
slug: categories

options:
  # No belongs_to_organization — Category is a GLOBAL catalog shared by every org.
  soft_deletes: false

columns:
  name:
    type: string
    filterable: true
    sortable: true
    searchable: true
  slug:
    type: string
    unique: true
    index: true

permissions:
  admin: &catalog_readonly
    actions: [index, show]
    show_fields: "*"
    create_fields: []
    update_fields: []
  agent: *catalog_readonly
  viewer: *catalog_readonly
```

:::note Global vs. tenant is one flag
`belongs_to_organization: true` is what makes Blueprint stamp the `organization_id` column, the org foreign key, and the tenant scoping. Omit it (or set it `false`) for `Category`, `Plan`, and `Article` — the global catalog served by the single-tenant `app` group. See [Tenant Safety](./tenant-safety) for how the two isolation mechanisms differ at runtime.
:::

### A tenant table scoped by column — `tickets`

`Ticket` lives in the `tenant` group and is isolated by its own `organization_id` column, so `belongs_to_organization: true`. It carries soft deletes and an audit trail, reserves `forceDelete` for `admin` alone, and hides `internal_notes` from viewers. The `assignee_id` and `category_id` columns are `foreignId`s.

```yaml title=".rhino/blueprints/tickets.yaml"
model: Ticket
slug: tickets

options:
  belongs_to_organization: true   # org column → tenant isolation
  soft_deletes: true
  audit_trail: true
  pagination: true
  per_page: 25

columns:
  subject:
    type: string
    filterable: true
    sortable: true
    searchable: true

  status:
    type: string
    default: "open"
    filterable: true
    sortable: true

  priority:
    type: string
    default: "normal"
    filterable: true
    sortable: true

  internal_notes:
    type: text
    nullable: true

  category_id:
    type: foreignId
    foreign_model: Category
    filterable: true

  assignee_id:
    type: foreignId
    foreign_model: User
    nullable: true
    filterable: true

relationships:
  - type: hasMany
    model: TicketComment

permissions:
  admin:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: &ticket_writable
      - subject
      - status
      - priority
      - internal_notes
      - category_id
      - assignee_id
    update_fields: *ticket_writable

  agent:
    actions: [index, show, store, update, destroy, trashed, restore]
    show_fields: "*"
    create_fields: *ticket_writable
    update_fields: *ticket_writable

  viewer:
    actions: [index, show]
    show_fields: [id, subject, status, priority, category_id, assignee_id, created_at]
    create_fields: []
    update_fields: []
    hidden_fields: [internal_notes]   # attribute-level: viewers never see internal_notes
```

Because `admin` and `agent` share the same fields and differ only in that `admin` also gets `forceDelete`, Blueprint generates `admin` and `agent` branches in the generated `TicketPolicy.php` that diverge on that one action. The `hidden_fields: [internal_notes]` line becomes `hiddenAttributesForShow()` returning `['internal_notes']` for viewers — the attribute-level rule from [Authorization](./authorization), generated, not hand-written.

### A tenant table scoped by relationship chain — `ticket_comments`

`TicketComment` has **no** `organization_id`. It reaches its tenant through `ticket → organization`. Express that as a parent relationship with `owner`, and leave `belongs_to_organization` off — the isolation comes from the parent, not a column on this table.

```yaml title=".rhino/blueprints/ticket_comments.yaml"
model: TicketComment
slug: ticket-comments

options:
  # No belongs_to_organization column — isolation flows through the parent Ticket.
  owner: Ticket                   # child resource: scoped via ticket → organization
  soft_deletes: false

columns:
  body:
    type: text
    searchable: true

  is_internal:
    type: boolean
    default: false
    filterable: true

  user_id:
    type: foreignId
    foreign_model: User

relationships:
  - type: belongsTo
    model: Ticket
  - type: belongsTo
    model: User

permissions:
  admin: &comment_full
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: &comment_writable
      - body
      - is_internal
    update_fields: *comment_writable

  agent: *comment_full

  viewer:
    actions: [index, show]
    show_fields: [id, body, user_id, created_at]
    create_fields: []
    update_fields: []
    hidden_fields: [is_internal]
```

:::tip Let YAML anchors carry your permission matrix
`&ticket_writable` / `*ticket_writable` and the `admin: &ticket_full ... agent: *ticket_full` pattern keep create/update field lists and whole role definitions in one place. When agent stops mirroring admin, you split them once — you never risk two lists drifting out of sync by hand.
:::

## The generate workflow

Blueprint YAML in, working code out. One command reads every spec, hashes it, and emits per-model and cross-model artifacts.

```bash title="terminal"
# One-time: scaffolds .rhino/blueprints/ and BLUEPRINT.md
php artisan rhino:install

# Generate everything from the blueprints
php artisan rhino:blueprint
```

For the three Helpdesk specs above, that single run writes, **per model**, the model (fillable + validation rules + query-builder config), the migration, the factory, the auto-discovery scope, the **fully-working** policy, and a test covering CRUD access, field visibility, and forbidden-field rejection. **Cross-model**, it writes `RoleSeeder` (admin/agent/viewer) and `UserRoleSeeder` (permissions aggregated from all three blueprints).

Iterate deliberately, not blindly:

```bash title="terminal"
# ❌ Bad — regenerate the world every time and hope nothing you changed by hand survives.
php artisan rhino:blueprint --force

# ✅ Good — preview the diff, then narrow to the model you actually touched.
php artisan rhino:blueprint --dry-run
php artisan rhino:blueprint --model=tickets
```

`--dry-run` prints what would be written without touching disk; `--model=tickets` processes a single spec; unchanged specs are skipped by hash so a plain `rhino:blueprint` is cheap. Reach for `--force` only when you genuinely want to re-emit unchanged files (e.g. after upgrading Rhino).

```bash title="terminal"
# Skip artifacts you maintain elsewhere
php artisan rhino:blueprint --skip-tests
php artisan rhino:blueprint --skip-seeders
```

:::warning Deleting a blueprint does not delete its files
Removing `tickets.yaml` produces a warning but leaves `app/Models/Ticket.php` and its migration in place. To retire a resource, delete the generated files yourself (and drop the table via a new migration) — Blueprint never destructively removes output.
:::

### Blueprint vs. the interactive generator

Both scaffold the same shapes; they differ in how much they fill in. Use `rhino:generate` (alias `rhino:g`) for a quick one-off model with commented-out permission stubs you'll finish later. Use `rhino:blueprint` when — as with Helpdesk — you know the full admin/agent/viewer matrix upfront and want **working** policy methods and permission tests generated for you.

```bash title="terminal"
# ❌ Bad — scaffold Ticket interactively, then hand-write every permittedAttributes* branch
#          and every access/visibility test for admin, agent, and viewer. Error-prone, unversioned intent.
php artisan rhino:g

# ✅ Good — the permission matrix lives in tickets.yaml; the policy + tests are generated from it.
php artisan rhino:blueprint --model=tickets
```

After generating, run migrations and seeders as usual:

```bash title="terminal"
php artisan migrate
php artisan db:seed --class=RoleSeeder
php artisan db:seed --class=UserRoleSeeder
```

## Export client-facing types

`rhino:export-types` introspects every model registered in `config/rhino.php`, reads its real database columns, builds an OpenAPI spec internally, and runs `openapi-typescript` to emit a `.d.ts` file. The database schema is the single source of truth — which means your TypeScript can never silently disagree with your API.

```bash title="terminal"
# Requires Node.js (runs npx openapi-typescript under the hood)
php artisan rhino:export-types
```

Set the client and mobile output roots once; the command writes to both:

```env title=".env"
RHINO_CLIENT_PATH=../client
RHINO_MOBILE_PATH=../mobile
```

That produces `../client/src/types/rhino.d.ts` and `../mobile/src/types/rhino.d.ts`, each with one interface per Helpdesk model:

```typescript title="client/src/types/rhino.d.ts"
export interface Ticket {
  id?: number;
  organization_id?: number;
  subject?: string;
  status?: string;
  priority?: string;
  internal_notes?: string | null;
  category_id?: number;
  assignee_id?: number | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface TicketComment {
  id?: number;
  ticket_id?: number;
  user_id?: number;
  body?: string;
  is_internal?: boolean;
  created_at?: string;
  updated_at?: string;
}
```

Every field is optional on purpose: Rhino's policy layer (`permittedAttributesForShow`, `hiddenAttributesForShow`) decides which attributes actually appear per user at runtime, so the type is the **union of all possible fields** — a viewer's `Ticket` simply won't include `internal_notes`, and that's expected. See [Data Lifecycle](./data-lifecycle) for the hidden-column mechanics behind that.

### Don't drift your client types by hand

The failure mode is a developer adding `priority` to the API, then typing `priority: string` into the client's model interface by hand. Two sources of truth immediately begin to rot — a renamed column, a changed type, a dropped field, and the hand-written copy lies.

```typescript title="client/src/types/rhino.d.ts"
// ❌ Bad — hand-maintained interface. Drifts the moment the schema changes.
export interface Ticket {
  id: number;
  subject: string;
  status: string;
  // forgot priority, internal_notes, assignee_id... and these are now non-optional lies
}
```

```bash title="terminal"
# ✅ Good — regenerate from the schema (the source of truth) after every migration.
php artisan rhino:export-types
```

Then consume the generated interface as a generic on the Rhino hooks — the same `Ticket` type flows through index, store, and update:

```tsx title="client/src/components/TicketList.tsx"
import type { Ticket } from '../types/rhino';
import { useModelIndex, useModelStore } from '@rhino-dev/rhino-react';

// data.data is Ticket[]
const { data } = useModelIndex<Ticket>('tickets', { sort: '-created_at' });

// mutate accepts Partial<Ticket>
const store = useModelStore<Ticket>('tickets');
store.mutate({ subject: 'Cannot log in', priority: 'high', category_id: 3 });
```

:::tip Make regeneration a step, not a chore
Re-run `rhino:export-types` in the same breath as `php artisan migrate` — a composer or npm script that chains them, or a CI check that fails when the committed `rhino.d.ts` differs from a fresh export, is the surest way to keep client and server honest.
:::

## Checklist

- **Edit the blueprint, never the generated file.** Models, migrations, policies, factories, tests, and config entries are build output.
- **One flag decides tenancy:** `belongs_to_organization: true` for column-scoped tenant tables (`Ticket`); `owner:` for relationship-chained children (`TicketComment`); neither for global catalog (`Category`).
- **Put the permission matrix in YAML.** `actions`, `show_fields`, `create_fields`, `update_fields`, `hidden_fields` per role → working policy + tests. Use anchors to keep shared field lists DRY.
- **Iterate with `--dry-run` and `--model=`,** not blanket `--force`.
- **Export types from the schema after every migration.** Never hand-maintain a client interface — regenerate it.

Back to the [Best Practices hub](./).
