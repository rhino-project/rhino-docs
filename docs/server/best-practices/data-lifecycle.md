---
sidebar_position: 5
title: "Data Lifecycle"
---

# Data Lifecycle

A record's life doesn't end at `store`. It gets validated on the way in, edited over time, trashed and maybe restored, and every step should be attributable. In a multi-tenant app, each of those steps is a chance to leak across org boundaries. This page covers the four features that govern a Helpdesk record from birth to grave — [validation](../validation), [soft deletes](../soft-deletes), [audit trail](../audit-trail), and [nested operations](../nested-operations) — with the tenant-safety rules that make them trustworthy.

For the models, roles, and route groups referenced here, see the [Best Practices hub](./). Authorization of these lifecycle actions (who can trash, who can restore, whose fields are writable) lives in [Authorization](./authorization); tenant isolation of the queries underneath lives in [Tenant Safety](./tenant-safety).

:::note The four models in play
`Ticket` (org column `organization_id`) and `TicketComment` (relationship chain `ticket → organization`, **no** org column) are the tenant-group models with a full lifecycle. `Category`, `Plan`, and `Article` are global `app`-group models. Cross-tenant leaks happen in the tenant group — that's where the sharp edges are.
:::

## Validate format on the model, permissions on the policy

**Principle:** `$validationRules` is for **type and format** — `string`, `max`, `in`, `date`. *Who* may write each field is a policy concern (`permittedAttributesForCreate` / `permittedAttributesForUpdate`), never a validation rule. Mixing them buries authorization inside format strings where no one audits it.

The `Ticket` model uses `HasValidation` and declares rules for every writable column:

```php title="app/Models/Ticket.php"
use Illuminate\Database\Eloquent\Model;
use Rhino\LaravelApi\Traits\HasValidation;
use Rhino\LaravelApi\Traits\HidableColumns;

class Ticket extends Model
{
    use HasValidation, HidableColumns;

    protected $validationRules = [
        'subject'        => 'required|string|max:255',
        'status'         => 'string|in:open,pending,closed',
        'priority'       => 'string|in:low,normal,high,urgent',
        'category_id'    => 'required|integer',   // FK safety handled below
        'assignee_id'    => 'nullable|integer',   // FK safety handled below
        'internal_notes' => 'nullable|string',
    ];

    protected $validationRulesMessages = [
        'subject.required' => 'A ticket needs a subject.',
        'status.in'        => 'Status must be open, pending, or closed.',
        'priority.in'      => 'Priority must be low, normal, high, or urgent.',
    ];
}
```

Don't try to gate `internal_notes` (admins/agents only, hidden from viewers) with a validation rule — that's an attribute permission. It belongs on `TicketPolicy` via `permittedAttributesForCreate` and hidden reads via `hiddenAttributesForShow`, both covered in [Authorization](./authorization) and the [Policies](../policies) reference.

```php title="app/Models/Ticket.php"
// ❌ Bad — encoding authorization ("only admins set status") as a format rule.
// Validation can't see the user's role; this silently lets anyone set any status,
// and the real rule is invisible to whoever reads the policy.
protected $validationRules = [
    'status'         => 'string|in:open,pending,closed',
    'internal_notes' => 'string', // "we'll just trust the frontend to hide it"
];
```

```php title="app/Models/Ticket.php"
// ✅ Good — model validates FORMAT; policy decides WHO may write which field.
// Format lives here; access lives on TicketPolicy::permittedAttributesForCreate().
protected $validationRules = [
    'status'         => 'string|in:open,pending,closed',
    'internal_notes' => 'nullable|string',
];
```

:::tip
Add `$validationRulesMessages` for the rules most likely to fail — `required` and enum `in` rules especially. Frontend developers consume these verbatim.
:::

### Cross-tenant FK safety: scope the `exists`, don't trust the table

**Principle:** an `exists` rule that points at a whole table validates *existence*, not *ownership*. In a multi-tenant app that is a vulnerability: an attacker in Org A submits `category_id` or `assignee_id` belonging to Org B, and a naive `exists:categories,id` waves it through. Every relational field a tenant can set must be validated **scoped to the current organization**.

Two flavors in Helpdesk, and they are not the same:

- **`category_id` → `Category`.** `Category` is a *global* `app`-group model — every org shares the catalog — so `exists:categories,id` is genuinely fine here. Existence *is* the whole rule.
- **`assignee_id` → a member of the current org.** This is org-scoped. The assignee must be a `User` who holds a `Membership` in **this** organization. A global `exists:users,id` would let you assign a ticket to a stranger from another company.

```php title="app/Http/Requests/... (conceptual)"
// ❌ Bad — global exists on the users table.
// Passes for ANY user in the system, including members of other orgs.
// Org A can assign its ticket to Org B's agent → cross-tenant reference leak.
'assignee_id' => 'nullable|integer|exists:users,id',
```

```php title="app/Models/Ticket.php"
// ✅ Good — scope the exists to memberships of the CURRENT organization.
// The row must be a user who is a member of the org resolved from the route.
use Illuminate\Validation\Rule;

// Static type/format rules live on the property Rhino reads automatically.
protected $validationRules = [
    'subject'  => 'required|string|max:255',
    'status'   => 'string|in:open,pending,closed',
    'priority' => 'string|in:low,normal,high,urgent',

    // Category is a GLOBAL catalog model — plain existence is the correct rule.
    'category_id' => 'required|integer|exists:categories,id',
];

// The scoped assignee rule needs request context, so add it in the runtime
// hooks HasValidation calls on store/update. The resolved Organization model
// lives on the request attribute bag (request()->get('organization')), set by
// Rhino's tenant middleware — NOT on the route parameter, which is the raw slug.
public function validateStore(array $data): void
{
    $this->validateAssignee($data);
    parent::validateStore($data);
}

public function validateUpdate(array $data): void
{
    $this->validateAssignee($data);
    parent::validateUpdate($data);
}

protected function validateAssignee(array $data): void
{
    $organizationId = request()->get('organization')?->id;

    validator($data, [
        // Assignee MUST be a member of THIS org. Scope the exists to memberships.
        'assignee_id' => [
            'nullable', 'integer',
            Rule::exists('memberships', 'user_id')
                ->where('organization_id', $organizationId),
        ],
    ])->validate();
}
```

:::warning A global `exists` is a cross-tenant hole
`exists:tickets,id`, `exists:users,id`, `exists:ticket_comments,id` — any bare `exists` on a *tenant-scoped* table lets a request reference another org's row. Always constrain the rule with `->where('organization_id', …)` (or the relationship-chain equivalent), or resolve the FK through an already-scoped query. Global models like `Category`/`Plan`/`Article` are the *only* tables where a bare `exists` is safe.
:::

:::tip
Rhino applies the static `$validationRules` property automatically on `store`/`update` via `HasValidation` — you never call a validator yourself. When a rule needs request context (like the resolved organization), the property can't hold it, so build that rule inside the `validateStore()` / `validateUpdate()` hooks `HasValidation` calls at runtime. There the scoped `Rule::exists` is rebuilt per request instead of frozen at boot.
:::

## Soft deletes: trash, don't destroy — and stay scoped

**Principle:** support tickets are records you get asked about later ("who closed #4012 and can we get it back?"). Use Laravel's `SoftDeletes` so `DELETE` moves a ticket to trash instead of erasing it. Rhino then auto-exposes `trashed`, `restore`, and `force-delete` endpoints, each with its own policy method — reserve the irreversible `force-delete` for `admin`.

```php title="app/Models/Ticket.php"
use Illuminate\Database\Eloquent\SoftDeletes;

class Ticket extends Model
{
    use SoftDeletes, HasValidation, HasAuditTrail, HidableColumns;
}
```

```php title="database/migrations/create_tickets_table.php"
Schema::create('tickets', function (Blueprint $table) {
    $table->id();
    $table->foreignId('organization_id')->constrained();
    $table->string('subject');
    $table->string('status')->default('open');
    $table->string('priority')->default('normal');
    $table->foreignId('category_id')->constrained();
    $table->foreignId('assignee_id')->nullable()->constrained('users');
    $table->text('internal_notes')->nullable();
    $table->softDeletes(); // deleted_at — required for trash/restore
    $table->timestamps();
});
```

This gives the tenant group these routes (under the `{organization}` prefix):

| Method | Endpoint | Description | Policy method |
|--------|----------|-------------|---------------|
| `DELETE` | `/{organization}/tickets/{id}` | Soft delete (to trash) | `delete()` |
| `GET` | `/{organization}/tickets/trashed` | List trashed tickets | `viewTrashed()` |
| `POST` | `/{organization}/tickets/{id}/restore` | Restore from trash | `restore()` |
| `DELETE` | `/{organization}/tickets/{id}/force-delete` | Permanent delete | `forceDelete()` |

### Force-delete is a permission, not a default

```php title="database/seeders/RoleSeeder.php"
// ❌ Bad — agents get the whole trash lifecycle including permanent deletion.
// force-delete is irreversible; an agent fat-fingering it destroys the record
// and its recovery path forever.
'agent' => [
    'tickets.index', 'tickets.show', 'tickets.store', 'tickets.update',
    'tickets.destroy', 'tickets.trashed', 'tickets.restore',
    'tickets.forceDelete', // ← agents should NOT have this
],
```

```php title="database/seeders/RoleSeeder.php"
// ✅ Good — agents can trash and restore; only admin can force-delete.
'agent' => [
    'tickets.index', 'tickets.show', 'tickets.store', 'tickets.update',
    'tickets.destroy',    // soft delete → trash
    'tickets.trashed',    // view trash
    'tickets.restore',    // pull back from trash
    // NO tickets.forceDelete
],
'admin' => ['*'], // full lifecycle, including permanent deletion
'viewer' => ['tickets.index', 'tickets.show'], // read-only, no delete at all
```

:::warning Force delete is permanent
`force-delete` removes the row from the database with no recovery. Restrict it with the `tickets.forceDelete` permission and keep it out of the `agent` and `viewer` roles.
:::

### Trashed tickets are still tenant-scoped

**Principle:** the biggest soft-delete mistake in a multi-tenant app is assuming the trash bin is exempt from isolation. It is not. `GET /{organization}/tickets/trashed` must return **only** trashed tickets belonging to the org in the route — never a global graveyard. Rhino applies the same org scope to the trashed query that it applies to `index`, so as long as your isolation is a global/auto scope on the model (see [Tenant Safety](./tenant-safety)), trash inherits it for free. The failure mode is *bypassing* that scope by hand.

```php title="app/Policies/TicketPolicy.php"
// ❌ Bad — overriding viewTrashed with an unscoped query.
// withTrashed() on the bare model reaches EVERY org's deleted tickets.
public function viewTrashed(?Authenticatable $user): bool
{
    // (and worse, a custom controller doing this to build the list:)
    // Ticket::withTrashed()->get(); // ← all orgs' trash, cross-tenant leak
    return $user !== null;
}
```

```php title="app/Policies/TicketPolicy.php"
// ✅ Good — authorize on the org-scoped permission; let Rhino's org scope
// filter the trashed query exactly like it filters index().
public function viewTrashed(?Authenticatable $user): bool
{
    return parent::viewTrashed($user); // checks tickets.trashed in THIS org
}
```

:::note `TicketComment` inherits isolation through its chain
`TicketComment` has no `organization_id`; it's scoped via `ticket → organization`. Soft-deleting a comment stays inside that chain — the trashed-comments query for an org resolves through its tickets, so a deleted comment can never surface under another org. Don't add a shortcut query that skips the ticket join.
:::

## Audit trail: know who changed a ticket

**Principle:** "who set this ticket to `closed`, and what was it before?" should never be unanswerable. Add `HasAuditTrail` to `Ticket` and every create/update/delete/restore/force-delete is logged automatically with the acting `user_id`, `organization_id`, IP, and the **changed fields only** (old → new). No manual logging calls.

```php title="app/Models/Ticket.php"
use Rhino\LaravelApi\Traits\HasAuditTrail;

class Ticket extends Model
{
    use SoftDeletes, HasValidation, HasAuditTrail, HidableColumns;

    // Never let sensitive columns land in the audit log's JSON.
    protected $auditExclude = [
        'internal_notes', // agent-only content shouldn't be readable via audit
    ];
}
```

Every lifecycle event maps to an action, and soft deletes tie straight in:

| Event | Audit action | Old → New |
|-------|--------------|-----------|
| Ticket created | `created` | `null` → all fields |
| Ticket updated | `updated` | changed fields (before → after) |
| Ticket soft-deleted | `deleted` | all fields → `null` |
| Ticket restored | `restored` | `null` → all fields |
| Ticket force-deleted | `force_deleted` | all fields → `null` |

Fetch the trail for one ticket via `GET /{organization}/tickets/{id}/audit` — it respects the same authorization as viewing the ticket itself, so a viewer can only pull audit for tickets they can already see.

### Don't hand-roll logging; don't log secrets

```php title="app/Http/Controllers/... (conceptual)"
// ❌ Bad — manual, partial, and leaky.
// Fires only on this code path (misses nested writes, restores, the console),
// captures no old values, and dumps the entire ticket — internal_notes included.
$ticket->update($data);
ActivityLog::create([
    'message'   => "Ticket {$ticket->id} updated",
    'payload'   => $ticket->toArray(), // internal_notes leaks into the log
    'user_id'   => auth()->id(),
]);
```

```php title="app/Models/Ticket.php"
// ✅ Good — the trait logs every event, everywhere, with old→new diffs,
// and $auditExclude keeps internal_notes out of the record.
use HasAuditTrail;

protected $auditExclude = ['internal_notes'];
// No controller logging code at all — creates, updates, soft/force deletes,
// restores, and nested writes are all captured automatically.
```

:::tip
`$auditExclude` already omits `password` and `remember_token` by default. Extend it for anything you wouldn't want a support agent reading back out of an audit entry — for Helpdesk that's `internal_notes`. Attribute-level *read* hiding (viewers never seeing `internal_notes` at all) is a separate policy concern in [Authorization](./authorization).
:::

## Nested operations: create a ticket and its first comment atomically

**Principle:** when a record and its child must exist together — a `Ticket` and the `TicketComment` that opens it — creating them in two separate HTTP calls invites a half-failed state: the ticket lands, the comment 500s, and you have a bare ticket with no opening message and no clean way to retry. Use the nested endpoint. Every operation runs in one database transaction; if any step fails validation, authorization, or the DB, the **whole batch rolls back**. Reference the parent's generated id with `$0.id`.

`TicketComment` is the relationship-chain child here — it carries no `organization_id`, so it *must* attach to a ticket that belongs to the current org. Creating it nested under the ticket you just made guarantees exactly that.

```bash title="terminal"
POST /{organization}/nested
```

```json title="Bad request — two independent calls, non-atomic"
// ❌ Bad — two round-trips. If the second fails, the first already committed.
// Call 1:
POST /{organization}/tickets
{ "subject": "Login broken", "category_id": 3, "priority": "high" }

// Call 2 (network drop / validation error / crash here):
POST /{organization}/ticket-comments
{ "ticket_id": 91, "body": "Started this morning after the deploy." }
// → Result: ticket #91 exists with zero comments. Orphaned, no rollback.
```

```json title="Good request — one atomic nested write"
// ✅ Good — one transaction. The comment references the ticket via $0.id.
// If the comment fails validation, the ticket is rolled back too — all or nothing.
POST /{organization}/nested
{
    "operations": [
        {
            "action": "create",
            "model": "tickets",
            "data": {
                "subject": "Login broken",
                "category_id": 3,
                "priority": "high",
                "status": "open"
            }
        },
        {
            "action": "create",
            "model": "ticket_comments",
            "data": {
                "ticket_id": "$0.id",
                "body": "Started this morning after the deploy.",
                "is_internal": false
            }
        }
    ]
}
```

The response returns each operation's result in order, so the client gets the real ticket id and comment id back in one shot:

```json title="Response"
{
    "results": [
        { "model": "tickets", "action": "create", "id": 91,
          "data": { "id": 91, "subject": "Login broken", "status": "open", "priority": "high" } },
        { "model": "ticket_comments", "action": "create", "id": 5,
          "data": { "id": 5, "ticket_id": 91, "body": "Started this morning after the deploy.", "is_internal": false } }
    ]
}
```

If the comment is missing its required `body`, nothing is created — the ticket is rolled back with the batch:

```json title="Response (422) — whole batch rolled back"
{
    "message": "Validation failed.",
    "errors": {
        "operations.1.data.body": ["The body field is required."]
    }
}
```

:::note Every nested op is authorized and scoped individually
Each operation runs through its own policy — `create tickets` checks `tickets.store`, `create ticket_comments` checks `ticket_comments.store` — and through the org scope resolved from the route. A viewer can't sneak a write in via the nested endpoint, and no operation can touch another org's data. All checks run **before** any operation executes. Cap batch size with `nested.max_operations` in `config/rhino.php`.
:::

:::tip Use nested only for genuinely-coupled writes
The parent-plus-first-child pattern (ticket + opening comment) is the right fit. Don't reach for `nested` to bulk-import a hundred unrelated tickets — that's what pagination-friendly loops and queued jobs are for. Reserve it for operations that must succeed or fail *together*.
:::

---

## Lifecycle checklist

- **Validate format on the model, permissions on the policy.** `$validationRules` is types and constraints; `permittedAttributes*` is who-can-write.
- **Never use a bare `exists` on a tenant-scoped table.** Scope `assignee_id` to `memberships` of the current org; a global `exists:users,id` is a cross-tenant hole. Bare `exists` is only safe on global models like `Category`.
- **Soft-delete tickets; gate `force-delete` behind `admin`.** Trash and restore are recoverable; permanent deletion is not.
- **Trash stays tenant-scoped.** Never build a trashed list with an unscoped `withTrashed()` — let Rhino's org scope filter it like `index`.
- **`HasAuditTrail`, not hand-rolled logs.** Automatic old→new diffs on every event; `$auditExclude` keeps `internal_notes` out.
- **Couple parent + child with one nested write.** Ticket + opening comment in a single atomic transaction via `$0.id`, not two calls that can half-fail.

Related reading: [Validation](../validation) · [Soft Deletes](../soft-deletes) · [Audit Trail](../audit-trail) · [Nested Operations](../nested-operations) · [Tenant Safety](./tenant-safety) · [Authorization](./authorization) · [Best Practices hub](./)
