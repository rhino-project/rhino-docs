---
sidebar_position: 2
title: "Models & Queries"
---

# Models & Queries

In Rhino the **model is the API**. There are no controllers to write for the standard CRUD surface — the static properties you declare on a model decide which columns clients may filter, sort, search, select, and eager-load. Everything you *don't* declare is invisible to the query layer. That makes the model both your contract and your first line of defense.

This page covers how to configure a Rhino model well, then walks **every** query feature on the canonical Helpdesk app — filtering, sorting, search, sparse fieldsets, includes, pagination, and named + default scopes. For the underlying reference see [Models](../models) and [Querying](../querying); for the app itself and the route-group setup, start at the [Best Practices hub](./).

:::note The canonical app
Every example uses the Helpdesk app: a global catalog served single-tenant in the `app` group (`Category`, `Plan`, `Article`) and per-organization data served multitenant in the `tenant` group (`Ticket`, `TicketComment`). `Ticket` carries `organization_id`, `subject`, `status` (`open`/`pending`/`closed`), `priority`, `category_id`, `assignee_id`, and `internal_notes`.
:::

## The whitelists are the contract

**Principle: a column is un-queryable until you list it, and over-exposed the moment you list the wrong one.** The `allowed*` arrays are not documentation — they are enforcement. A field missing from `$allowedFilters` is silently ignored (a client can't filter on it); a field wrongly present exposes an axis of your data you may not have meant to. Declare each list deliberately, smallest useful set first.

```php title="app/Models/Ticket.php"
// ❌ Bad — no whitelists declared at all
class Ticket extends RhinoModel
{
    protected $fillable = ['subject', 'status', 'priority', 'category_id', 'assignee_id', 'internal_notes'];

    // No $allowedFilters/$allowedSorts/$allowedIncludes/…
    // Result: ?filter[status]=open is SILENTLY IGNORED — the endpoint
    // returns every ticket regardless. The UI "filter" looks broken and
    // agents page through everything. Nothing is queryable, not "everything".
}
```

```php title="app/Models/Ticket.php"
// ✅ Good — explicit, minimal whitelists gate every query axis
class Ticket extends RhinoModel
{
    protected $fillable = ['subject', 'status', 'priority', 'category_id', 'assignee_id', 'internal_notes'];

    public static $allowedFilters  = ['status', 'priority', 'category_id', 'assignee_id'];
    public static $allowedSorts    = ['created_at', 'priority', 'status'];
    public static $defaultSort     = '-created_at';
    public static $allowedSearch   = ['subject'];
    public static $allowedIncludes = ['category', 'assignee', 'comments'];
    public static $allowedFields   = ['id', 'subject', 'status', 'priority', 'created_at'];
}
```

:::warning
Fields not listed in an `allowed*` array are **silently ignored**, not rejected. This is deliberate — clients can't filter or sort by columns you never allowed — but it means a typo in a column name (`assignes_id`) fails quietly. Test that each declared filter/sort actually narrows results.
:::

The opposite failure is over-exposure. `internal_notes` is admin/agent-only content (see [Authorization](./authorization) and [Tenant Safety](./tenant-safety) for where that boundary is enforced). Never make it a sort, filter, or search axis — that leaks its shape (ordering, presence, substrings) even to callers who can't read the column value.

```php title="app/Models/Ticket.php"
// ❌ Bad — internal_notes becomes a queryable axis
public static $allowedSearch = ['subject', 'internal_notes'];
public static $allowedSorts  = ['created_at', 'internal_notes'];
// A viewer who can't SEE internal_notes can now ?search= substrings of it
// and confirm hits, or ?sort by it to infer which tickets have notes.

// ✅ Good — private columns never enter the query surface
public static $allowedSearch = ['subject'];
public static $allowedSorts  = ['created_at', 'priority', 'status'];
```

## A well-configured Ticket model

Bringing it together: `Ticket` uses `RhinoModel` (so it gets `SoftDeletes`, `HasValidation`, `HidableColumns`, `HasAutoScope` for free) plus `BelongsToOrganization` for tenant isolation and `HasAuditTrail` for the change log. `$fillable` gates mass-assignment; the `allowed*` arrays gate the query layer; relationships back the includes; `$defaultScope`/`$allowedScopes` power scope selection (below).

```php title="app/Models/Ticket.php"
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Models\RhinoModel;
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Ticket extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;

    protected $fillable = [
        'subject', 'status', 'priority',
        'category_id', 'assignee_id', 'internal_notes',
    ];

    protected $casts = [
        'status'   => 'string',
        'priority' => 'string',
    ];

    // ── Query Builder ────────────────────────────────────────────
    public static $allowedFilters  = ['status', 'priority', 'category_id', 'assignee_id'];
    public static $allowedSorts    = ['created_at', 'priority', 'status'];
    public static $defaultSort     = '-created_at';
    public static $allowedSearch   = ['subject'];
    public static $allowedIncludes = ['category', 'assignee', 'comments', 'comments.user'];
    public static $allowedFields   = ['id', 'subject', 'status', 'priority', 'category_id', 'created_at'];

    // ── Named + default scopes ───────────────────────────────────
    public static $allowedScopes   = ['assignedToMe', 'unassigned'];
    public static $defaultScope    = 'open';

    // ── Pagination ───────────────────────────────────────────────
    public static bool $paginationEnabled = true;
    protected $perPage = 25;

    // ── Relationships (back the includes above) ──────────────────
    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function comments()
    {
        return $this->hasMany(TicketComment::class);
    }

    // ── Scope bodies (see Named Scopes below) ────────────────────
    public function scopeOpen(Builder $query, ?Authenticatable $user): Builder
    {
        return $query->where('status', 'open');
    }

    public function scopeAssignedToMe(Builder $query, ?Authenticatable $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0'); // fail closed
        }

        return $query->where('assignee_id', $user->id);
    }

    public function scopeUnassigned(Builder $query, ?Authenticatable $user): Builder
    {
        return $query->whereNull('assignee_id');
    }
}
```

:::tip
Only declare what differs from the defaults. `TicketComment` needs no `$allowedSorts` if newest-first (`$defaultSort = '-created_at'`) is all clients ever want. A short model is a readable contract.
:::

Every `allowed*` include must map to a real relationship. Listing an include with no matching method is the most common broken-config bug.

```php title="app/Models/Ticket.php"
// ❌ Bad — include declared but no relationship method exists
public static $allowedIncludes = ['category', 'author'];
// ?include=author blows up at eager-load time: Call to undefined
// relationship [author] on model [Ticket]. The whitelist lied.

// ✅ Good — every include has a matching relationship method
public static $allowedIncludes = ['category', 'assignee', 'comments'];
public function assignee() { return $this->belongsTo(User::class, 'assignee_id'); }
```

## Filtering

**Principle: filters are freely composed by the client from the columns you allow — so allow exactly the columns that are safe to slice on.** Filter with `?filter[field]=value`; combine fields with `&` (AND), comma-separate values for one field (OR). Only `$allowedFilters` columns work.

```bash title="terminal — Helpdesk tenant group"
# Open tickets in one org
GET /api/acme-corp/tickets?filter[status]=open

# Open, high-priority tickets in a category (AND across fields)
GET /api/acme-corp/tickets?filter[status]=open&filter[category_id]=5

# Tickets that are open OR pending, excluding closed (OR within a field)
GET /api/acme-corp/tickets?filter[status]=open,pending
```

The Bad/Good here is about *what* you let clients filter on. `internal_notes` must never be a filter axis; and a status value must exist to be filterable — but the whitelist is by column, not value, so validation of the value belongs elsewhere.

```php title="app/Models/Ticket.php"
// ❌ Bad — private column exposed as a filter axis
public static $allowedFilters = ['status', 'priority', 'internal_notes'];
// ?filter[internal_notes]=refund lets a viewer probe note contents by
// equality even though they can't read the column in the response.

// ✅ Good — only safe, shareable columns are filterable
public static $allowedFilters = ['status', 'priority', 'category_id', 'assignee_id'];
```

## Sorting

**Principle: sortable columns should be indexed and public.** Sort with `?sort=field` (ascending) or `?sort=-field` (descending); chain with commas. `$defaultSort` applies when the client sends no `?sort`. Only `$allowedSorts` columns work.

```bash title="terminal"
# Oldest tickets first
GET /api/acme-corp/tickets?sort=created_at

# Newest first (this is also the default via $defaultSort = '-created_at')
GET /api/acme-corp/tickets?sort=-created_at

# By status ascending, then newest within each status
GET /api/acme-corp/tickets?sort=status,-created_at
```

```php title="app/Models/Ticket.php"
// ❌ Bad — no default sort → undefined order, and a private sort axis
public static $allowedSorts = ['created_at', 'internal_notes'];
// (no $defaultSort) — page 2 may repeat rows from page 1 because the DB
// returns rows in no guaranteed order without an ORDER BY. And sorting by
// internal_notes leaks which tickets have notes.

// ✅ Good — deterministic default, only public columns sortable
public static $allowedSorts = ['created_at', 'priority', 'status'];
public static $defaultSort  = '-created_at';
```

:::warning
A missing `$defaultSort` means index results have **no stable order**, which quietly breaks pagination — rows can repeat or vanish between pages. Always set a `$defaultSort` on any paginated model.
:::

## Search

**Principle: search is a case-insensitive `LIKE` across the columns you list — keep that list to public, indexed text.** Trigger with `?search=term`; it matches against every field in `$allowedSearch`. You can search across a relationship with dot notation (`user.name`).

```php title="app/Models/Ticket.php"
// Search only the ticket subject, and (optionally) the assignee's name
public static $allowedSearch = ['subject', 'assignee.name'];
```

```bash title="terminal"
# Matches in ticket.subject OR assignee.name
GET /api/acme-corp/tickets?search=refund

# Search composes with filters — "refund" among open tickets only
GET /api/acme-corp/tickets?search=refund&filter[status]=open
```

The trap is scoping search to columns a caller shouldn't be able to probe. `internal_notes` and internal comment bodies are agent-only; searching them lets a viewer confirm substrings they can't read.

```php title="app/Models/Ticket.php"
// ❌ Bad — search reaches into private columns
public static $allowedSearch = ['subject', 'internal_notes'];
// A viewer runs ?search=chargeback and learns whether any ticket's
// internal notes mention "chargeback" — a content leak via hit/no-hit.

// ✅ Good — search scoped to shareable columns only
public static $allowedSearch = ['subject', 'assignee.name'];
```

:::tip
Cross-relationship search (`assignee.name`) is powerful but each searchable relation column should be indexed — a `LIKE` join across an unindexed column will scan. Prefer narrow, indexed search fields over "search everything."
:::

## Sparse fieldsets

**Principle: let clients trim the payload, but only to columns you've published.** Select columns with `?fields[table]=col1,col2` — the key is the **table name** (`tickets`), not the model. Only `$allowedFields` columns can be selected; anything outside is unavailable to request. Combine with `include` and a per-relation `fields[...]` to trim included models too.

```bash title="terminal"
# Return just id, subject, status for a compact ticket list
GET /api/acme-corp/tickets?fields[tickets]=id,subject,status

# Trim both the ticket and its included category
GET /api/acme-corp/tickets?fields[tickets]=id,subject&fields[categories]=id,name&include=category
```

```php title="app/Models/Ticket.php"
// ❌ Bad — private/heavy columns published as selectable fields
public static $allowedFields = ['id', 'subject', 'status', 'internal_notes'];
// Exposes internal_notes as a field a viewer can explicitly request, and
// bloats the "reduce payload" feature with a column it should never return.

// ✅ Good — only lightweight, public columns are selectable
public static $allowedFields = ['id', 'subject', 'status', 'priority', 'category_id', 'created_at'];
```

:::note
`$allowedFields` controls what a client may *ask for*; it is not the privacy boundary. Column-level privacy (hiding `internal_notes` from viewers regardless of `?fields`) is enforced by `HidableColumns` + the policy — see [Authorization](./authorization). Keep private columns out of `$allowedFields` **and** hidden by policy.
:::

## Includes (eager loading)

**Principle: only relationships you whitelist can be loaded, and Rhino authorizes each include.** Load relations with `?include=relation`, multiple comma-separated, nested with dots (`comments.user`). Only `$allowedIncludes` relations load; each must be a real relationship method. Rhino checks the caller's `viewAny` permission on the included resource and returns `403` if they lack it — so includes can't be used to bypass authorization.

```bash title="terminal"
# Single relation
GET /api/acme-corp/tickets?include=category

# Multiple
GET /api/acme-corp/tickets?include=category,assignee,comments

# Nested: each ticket's comments, and each comment's author
GET /api/acme-corp/tickets?include=comments.user

# Relationship count / existence
GET /api/acme-corp/tickets?include=commentsCount
GET /api/acme-corp/tickets?include=commentsExists
```

```php title="app/Models/Ticket.php"
// ❌ Bad — whitelisting a nested include whose leaf relation isn't declared,
//          and no thought to what the include exposes
public static $allowedIncludes = ['comments.author'];
// 'comments.author' fails: TicketComment has no `author` relation (it's `user`).
// And loading comments wholesale would surface is_internal comments — the
// viewer boundary must be enforced by the TicketComment policy, not skipped.

// ✅ Good — declared nested path with real relations at every hop
public static $allowedIncludes = ['category', 'assignee', 'comments', 'comments.user'];
// Include authorization still runs: ?include=comments returns 403 for a
// caller without ticket-comments.index permission.
```

:::warning
An include of `comments` returns comment rows subject to the `TicketComment` policy — internal comments (`is_internal`) must be filtered for viewers there, not assumed safe because they came through an include. See [Tenant Safety](./tenant-safety) and [Authorization](./authorization).
:::

## Pagination

**Principle: paginate by default, and read the page metadata from the response *headers*, not the body.** With `$paginationEnabled = true`, index results are paged. Control with `?page=` and `?per_page=`; `$perPage` sets the default size. The body is a plain data array; page metadata comes back in headers.

```bash title="terminal"
# 25 tickets per page (Ticket's $perPage default), page 1
GET /api/acme-corp/tickets

# Explicit page size and page
GET /api/acme-corp/tickets?page=2&per_page=50
```

```
X-Current-Page: 2
X-Last-Page: 10
X-Per-Page: 50
X-Total: 470
```

```php title="app/Models/Ticket.php"
// ❌ Bad — pagination off on a high-volume, org-wide collection
public static bool $paginationEnabled = false;
// GET /tickets streams every ticket in the org in one response. Fine for a
// tiny lookup table; a memory/latency bomb for tickets.

// ✅ Good — pagination on, sensible page size, deterministic order
public static bool $paginationEnabled = true;
protected $perPage = 25;
public static $defaultSort = '-created_at'; // stable order across pages
```

:::tip
Disable pagination only for small, bounded lookup collections. `Plan` (a handful of rows) is a fine candidate for `$paginationEnabled = false`; `Ticket` and `TicketComment` are not.
:::

## Named scopes and the default scope

**Principle: a named scope lets the client *select* a server-defined query fragment by name — it can only narrow, never widen, the already-authorized set.** Declare the whitelist in `$allowedScopes` and a `$defaultScope`, then implement each as an Eloquent local scope `scopeXxx(Builder $query, ?Authenticatable $user)`. The client sends only the name via `?scope=`; the **current user is resolved server-side** and passed in — the client never sends identity. On the Helpdesk `Ticket`, `?scope=assignedToMe` filters to the caller's tickets, and the default scope surfaces open tickets when no `?scope=` is sent.

```php title="app/Models/Ticket.php"
public static $allowedScopes = ['assignedToMe', 'unassigned'];
public static $defaultScope  = 'open';

public function scopeOpen(Builder $query, ?Authenticatable $user): Builder
{
    return $query->where('status', 'open');
}

public function scopeAssignedToMe(Builder $query, ?Authenticatable $user): Builder
{
    if (! $user) {
        return $query->whereRaw('1 = 0'); // fail closed when unauthenticated
    }

    return $query->where('assignee_id', $user->id);
}
```

```bash title="terminal"
# No ?scope= → $defaultScope ('open') applies automatically
GET /api/acme-corp/tickets

# Select the assignedToMe scope — filters to the caller's own tickets
GET /api/acme-corp/tickets?scope=assignedToMe

# A non-whitelisted scope is a 403, NOT a silent ignore
GET /api/acme-corp/tickets?scope=archived
# → 403 { "message": "Scope 'archived' is not allowed" }
```

Named scopes fail differently from filters/sorts: an unknown scope name returns **403**, not silence — this mirrors include authorization. Requesting the declared default by name (`?scope=open`) is always allowed even if it's not in `$allowedScopes`.

The two dangerous mistakes: (1) putting tenancy or a mandatory restriction *in* the default scope, and (2) starting a scope body from a fresh query instead of the one you're handed.

```php title="app/Models/Ticket.php"
// ❌ Bad — tenancy leaned on the default scope
public static $defaultScope = 'openForThisOrg';

public function scopeOpenForThisOrg(Builder $query, ?Authenticatable $user): Builder
{
    return $query->where('organization_id', currentOrg()->id) // ← WRONG PLACE
                 ->where('status', 'open');
}
// The moment a client sends ?scope=assignedToMe, the default scope is
// REPLACED and the org restriction vanishes — cross-tenant leak.
```

```php title="app/Models/Ticket.php"
// ✅ Good — tenancy is an always-on global scope; the default scope only
//           narrows the listing convenience (open tickets)
class Ticket extends RhinoModel
{
    use BelongsToOrganization;          // enforces organization_id on EVERY query

    public static $defaultScope = 'open';

    public function scopeOpen(Builder $query, ?Authenticatable $user): Builder
    {
        return $query->where('status', 'open'); // narrows only; org scope already applied
    }
}
```

:::danger The default scope is not a security boundary
`$defaultScope` is a listing default the client **replaces** the instant it selects any other `?scope=`. A named scope runs *on top of* organization scoping and every global scope, so it can only shrink the already-authorized set. Mandatory row restrictions — tenancy, visibility — belong in an always-on **global scope** (`BelongsToOrganization`, `HasAutoScope`, or a manual global scope), which no `?scope=` value can bypass. See [Tenant Safety](./tenant-safety) and [Querying — the 403 contract](../querying#the-403-contract).
:::

A second subtle failure: scope bodies must **derive from the `$query` they receive** — that builder already carries organization scoping and every global scope. Starting from `Ticket::query()` inside the scope drops all of it.

```php title="app/Models/Ticket.php"
// ❌ Bad — scope body starts fresh, discarding org + global scopes
public function scopeAssignedToMe(Builder $query, ?Authenticatable $user): Builder
{
    return Ticket::query()->where('assignee_id', $user->id); // leaks other orgs' tickets
}

// ✅ Good — narrow the org-scoped query you were handed
public function scopeAssignedToMe(Builder $query, ?Authenticatable $user): Builder
{
    if (! $user) {
        return $query->whereRaw('1 = 0');
    }
    return $query->where('assignee_id', $user->id);
}
```

:::tip Complex scopes → a class
Once a scope grows past a clause or two (joins, subqueries, per-role logic), keep a one-line `scopeXxx` on the model that delegates to an invokable class in `app/Models/Scopes/`, and unit-test that class in isolation. Prefer `whereHas`/`whereExists` over raw `join()` so counts and `?sort` stay correct under `paginate()`. Full pattern in [Querying — best practices for complex scopes](../querying#best-practices-for-complex-scopes).
:::

## Everything composes

Named scope, filter, sort, search, fields, include, and pagination all stack in a single request — the scope narrows first, then the rest apply on top:

```bash title="terminal"
GET /api/acme-corp/tickets?scope=assignedToMe&filter[status]=open&sort=-created_at&include=category,comments&fields[tickets]=id,subject,status&search=refund&page=1&per_page=20
```

This selects the caller's own tickets, keeps only open ones, sorts newest-first, eager-loads category and comments, returns just `id`/`subject`/`status`, searches `subject` for "refund", and returns page 1 of 20. Scoping applies to the **index** and **trashed** listings; a single-record `show` is not scoped.

---

**Next:** lock down who can read and write these fields in [Authorization](./authorization), then make the whole surface tenant-safe in [Tenant Safety](./tenant-safety). Reference docs: [Models](../models) · [Querying](../querying) · [Multi-Tenancy](../multi-tenancy). Back to the [Best Practices hub](./).
