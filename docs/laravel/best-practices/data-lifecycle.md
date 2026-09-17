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

## Validate in a request class, permit fields in the policy

**Principle:** a request class owns **type and format** — `required`, `string`, `max`, `in`, `date`. *Who* may write each field is a policy concern (`permittedAttributesForCreate` / `permittedAttributesForUpdate`), never a validation rule. Mixing them buries authorization inside format strings where no one audits it.

`Ticket` is validated by two classes, one per action, found by convention:

```php title="app/Http/Requests/TicketStoreRequest.php"
<?php

namespace App\Http\Requests;

use Rhino\Http\Requests\ResourceRequest;

class TicketStoreRequest extends ResourceRequest
{
    public function rules(): array
    {
        return [
            'subject'        => 'required|string|max:255',
            'status'         => 'required|string|in:open,pending,closed',
            'priority'       => 'required|string|in:low,normal,high,urgent',
            'category_id'    => 'required|integer|exists:categories,id',
            'assignee_id'    => ['nullable', 'integer', $this->memberOfThisOrg()],
            'internal_notes' => 'nullable|string',
        ];
    }

    public function messages(): array
    {
        return [
            'subject.required' => 'A ticket needs a subject.',
            'status.in'        => 'Status must be open, pending, or closed.',
            'priority.in'      => 'Priority must be low, normal, high, or urgent.',
        ];
    }
}
```

Don't try to gate `internal_notes` (admins and agents only, hidden from viewers) with a validation rule — that's an attribute permission. It belongs on `TicketPolicy` via `permittedAttributesForCreate`, and hidden reads via `hiddenAttributesForShow`, both covered in [Authorization](./authorization) and the [Policies](../policies) reference. The policy's forbidden-field check runs *before* the request class, so by the time `rules()` executes, a viewer's `internal_notes` has already been refused with a `403`.

```php title="app/Http/Requests/TicketStoreRequest.php"
// ❌ Bad — encoding authorization ("only admins set status") as a format rule.
// The rule can branch on the user, so this LOOKS like it works — but the real
// access rule is now invisible to whoever reads TicketPolicy, and it only
// covers the values, not the field: an agent still writes `status`.
'status' => $this->isAdmin() ? 'required|string' : 'prohibited',
```

```php title="app/Http/Requests/TicketStoreRequest.php"
// ✅ Good — the request class validates FORMAT; TicketPolicy decides WHO may
// write the field, and answers 403 before this class ever runs.
'status' => 'required|string|in:open,pending,closed',
```

:::warning What you validate is what gets written
The write payload is `validated()` — the keys covered by a rule that passed. A field with no rule is **silently dropped**: the response is `201`/`200` and the column is simply unset. Declare a rule for every field the action should write, even a loose `'nullable'` one. There is no error and no log line to tell you otherwise.
:::

### Role-conditional rules: branch on the user, don't key a map by role

**Principle:** when a rule genuinely differs by role, express it as a branch on `$this->user()` inside the request class. A role-keyed map buries the branch in a data structure that no one greps for, and it silently falls through to the `'*'` entry for any role you forget.

In Helpdesk, only an `admin` may open a ticket at `urgent`; agents top out at `high`.

```php title="app/Models/Ticket.php"
// ❌ Bad — a role-keyed rules map on the model. The role resolution is implicit,
//          an unlisted role falls through to '*' with no warning, and the rules
//          cannot see the organization, the route group or the record.
protected $validationRulesStore = [
    'admin'  => ['subject' => 'required|string|max:255', 'priority' => 'required|in:low,normal,high,urgent'],
    'agent'  => ['subject' => 'required|string|max:255', 'priority' => 'required|in:low,normal,high'],
    '*'      => ['subject' => 'required|string|max:255'],
];
```

```php title="app/Http/Requests/TicketStoreRequest.php"
// ✅ Good — one class, an explicit branch, and the whole context in scope.
public function rules(): array
{
    return [
        'subject'  => 'required|string|max:255',
        'priority' => $this->isAdmin()
            ? 'required|string|in:low,normal,high,urgent'
            : 'required|string|in:low,normal,high',
    ];
}

protected function isAdmin(): bool
{
    // Resolved from the Membership for the organization on the route — never
    // from anything the client sent. See Authorization.
    return $this->user()?->getRoleSlugForValidation($this->organization()) === 'admin';
}
```

The same branch shape covers the other three context values: `$this->routeGroup()` when the `app` and `tenant` groups want different rules for the same model, `$this->action()` when one class serves both, and `$this->record()` on update — for example, refusing to reopen a ticket that a `viewer` closed.

### `prepare()` is trusted server code — never launder a client value through it

**Principle:** `prepare()` runs *after* the policy's forbidden-field check, which inspects exactly what the client sent. That is what makes it safe — and it is also what makes it dangerous. Anything `prepare()` writes is treated as server-authored and is **not** re-checked against `permittedAttributesForCreate/Update`. Deriving a restricted field from a client value writes a field the policy just denied.

`TicketCommentPolicy` lets every role write `body`, and lets only `admin` and `agent` write `is_internal` — a viewer who sends `is_internal` gets a `403`. A viewer who sends a `body` cannot reach `is_internal` at all… unless `prepare()` does it for them.

```php title="app/Http/Requests/TicketCommentStoreRequest.php"
// ❌ Bad — is_internal was denied to viewers, so it never appeared in the raw
//          input and the forbidden-field check passed. prepare() then derives it
//          from `body`, which the client fully controls. Any viewer can now file
//          an internal comment by typing "#internal", and TicketCommentPolicy
//          shows no sign of it.
public function prepare(array $input): array
{
    $input['is_internal'] = str_starts_with($input['body'] ?? '', '#internal');

    return $input;
}
```

```php title="app/Http/Requests/TicketCommentStoreRequest.php"
// ✅ Good — normalize what the client sent, and derive new keys from SERVER
//           state only. Nothing here is reachable from the request body.
public function prepare(array $input): array
{
    // prepare() runs BEFORE the rules, so `body` is still whatever the client
    // sent. Guard the type; let the rules reject anything that isn't a string.
    if (is_string($input['body'] ?? null)) {
        $input['body'] = trim($input['body']);
    }

    $input['user_id'] = $this->user()?->id;   // the author is who is asking, always

    return $input;
}
```

The test to apply to every line of a `prepare()`: **could a client change this value by changing the request body?** If the answer is yes for a key the policy restricts, it is a laundering bug. `organization_id` is the one key you never have to worry about — Rhino applies it last and unconditionally, so it always wins.

:::note A key `prepare()` adds still needs a rule
`user_id` above is dropped unless `rules()` also declares it (`'user_id' => 'required|integer'`). The fail-closed write-payload rule applies to server-authored fields exactly as it does to client-sent ones.
:::

### Cross-tenant FK safety: let Rhino scope the `exists`, and scope the rest yourself

**Principle:** an `exists` rule that points at a whole table validates *existence*, not *ownership*. In a multi-tenant app that is a vulnerability: an agent in Org A submits a `category_id` or `assignee_id` belonging to Org B and a naive `exists:categories,id` waves it through.

Rhino handles most of this for you. In a tenant context it rewrites every `exists:` rule in a request class so the referenced row must belong to the organization on the route — directly when the table carries `organization_id`, and through a walked foreign-key chain when it reaches its organization by relationship, as `ticket_comments → tickets → organizations` does. Three flavors show up in Helpdesk, and they are not the same:

- **`category_id` → `Category`.** `Category` is a *global* `app`-group model — every org shares the catalog — so `exists:categories,id` is genuinely correct. Existence *is* the whole rule, and Rhino leaves it alone because there is no path from `categories` to an organization.
- **`ticket_id` → `Ticket`.** Org-scoped by column. Write `exists:tickets,id` and Rhino appends the organization itself.
- **`assignee_id` → a member of the current org.** This one Rhino **cannot** infer: the assignee is a `User`, and `users` is a global table with no path to an organization. The real constraint lives in the `memberships` pivot, and you have to say so.

```php title="app/Http/Requests/TicketStoreRequest.php"
// ❌ Bad — hand-rolled scoping on a table Rhino already scopes. It is redundant
//          for tickets, and on an indirectly-owned table like ticket_comments
//          there is no organization_id column to match on at all, so the rule
//          silently matches nothing — or, worse, is written the other way round
//          and matches everything.
'ticket_id' => 'required|integer|exists:tickets,id,organization_id,' . $this->organization()->id,

// ❌ Bad — a bare exists on users. Passes for ANY user in the system, including
//          members of other orgs: Org A assigns its ticket to Org B's agent.
'assignee_id' => 'nullable|integer|exists:users,id',
```

```php title="app/Http/Requests/TicketStoreRequest.php"
// ✅ Good — plain rules for the tables Rhino can scope...
'category_id' => 'required|integer|exists:categories,id',   // global catalog: existence IS the rule
'ticket_id'   => 'required|integer|exists:tickets,id',      // org-scoped by Rhino, automatically

// ...and an explicit membership rule for the one it cannot.
'assignee_id' => ['nullable', 'integer', $this->memberOfThisOrg()],
```

```php title="app/Http/Requests/TicketStoreRequest.php"
// ✅ Good — the organization comes from the request context, never from input.
// Outside a tenant group organization() is null, so fall back to plain existence
// rather than building a rule that matches nothing.
use Illuminate\Validation\Rule;

protected function memberOfThisOrg(): mixed
{
    $organizationId = $this->organization()?->id;

    return $organizationId === null
        ? 'exists:users,id'
        : Rule::exists('memberships', 'user_id')->where('organization_id', $organizationId);
}
```

:::danger A bare `exists` on a tenant-scoped table is a cross-tenant hole
Rhino's rewriting covers the tables it can reach — directly or through a foreign-key chain. It covers nothing for a table with **no path to an organization**, which is exactly the shape `users` has in Helpdesk. For those, constrain the rule yourself against the pivot that carries the org, using `$this->organization()`.

```php
// ❌ Bad — every org can assign to every user in the system
'assignee_id' => 'nullable|integer|exists:users,id',

// ✅ Good — the row must be a member of the org resolved from the route
'assignee_id' => ['nullable', 'integer',
    Rule::exists('memberships', 'user_id')->where('organization_id', $this->organization()?->id)],
```
:::

A cross-tenant reference comes back as an ordinary `422`, indistinguishable from a typo'd id — which is the point: it leaks nothing about what exists in the other organization.

:::tip
`php artisan rhino:generate` → **Request** scaffolds both classes with every hook commented, including the org-scoped `exists:` note and a record-dependent rule. Start from the stub rather than an empty file — it is the cheapest defense against the fail-closed write-payload rule. Full reference: [Validation](../validation).
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
use Rhino\Traits\HasAuditTrail;

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

- **Validate format in a request class, permissions in the policy.** `{Model}StoreRequest` / `{Model}UpdateRequest` own types and constraints; `permittedAttributes*` is who-can-write.
- **Declare a rule for every field the action writes.** `validated()` is the write payload — a field with no rule is silently dropped, with no error.
- **Branch on `$this->user()`, don't key a rules map by role.** And never derive a policy-restricted field from a client value inside `prepare()`.
- **Never use a bare `exists` on a table with no path to an organization.** Rhino scopes `exists:` for tables it can reach; `users` it cannot — scope `assignee_id` to `memberships` of the current org yourself. Bare `exists` is only correct on global models like `Category`.
- **Soft-delete tickets; gate `force-delete` behind `admin`.** Trash and restore are recoverable; permanent deletion is not.
- **Trash stays tenant-scoped.** Never build a trashed list with an unscoped `withTrashed()` — let Rhino's org scope filter it like `index`.
- **`HasAuditTrail`, not hand-rolled logs.** Automatic old→new diffs on every event; `$auditExclude` keeps `internal_notes` out.
- **Couple parent + child with one nested write.** Ticket + opening comment in a single atomic transaction via `$0.id`, not two calls that can half-fail.

Related reading: [Validation](../validation) · [Soft Deletes](../soft-deletes) · [Audit Trail](../audit-trail) · [Nested Operations](../nested-operations) · [Tenant Safety](./tenant-safety) · [Authorization](./authorization) · [Best Practices hub](./)
