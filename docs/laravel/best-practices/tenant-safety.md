---
sidebar_position: 4
title: Tenant Safety
---

# Tenant Safety

The single most expensive bug in a multi-tenant SaaS is a **cross-tenant leak** — Acme Corp seeing Globex's tickets. Rhino makes the safe path the default: every generated CRUD endpoint is organization-scoped by construction. This page is about keeping it that way — understanding *where* the organization comes from, *how* isolation is enforced, and how to write custom controllers that don't punch a hole in the wall.

This is the tenant-isolation chapter of the [Best Practices hub](./). For per-user, per-role access control (policies, RBAC, attribute-level permissions), see [Authorization](./authorization). For the underlying feature docs, see [Multi-Tenancy](../multi-tenancy) and [Custom Controllers](../custom-controllers).

## The one rule: the organization comes from the route, never the client

The organization is resolved by `ResolveOrganizationFromRoute` middleware from the `{organization}` URL segment — and validated against the authenticated user's memberships. It is **ambient server state**, never a request field. The moment you read the tenant from client input, you've handed the attacker the keys.

```php title="app/Http/Controllers/TicketExportController.php"
// ❌ Bad — trusts an organization_id from the request body. An attacker sends
// any id and reads another org's tickets. This is the classic IDOR leak.
$orgId = $request->input('organization_id');
$tickets = Ticket::where('organization_id', $orgId)->get();

// ✅ Good — the org is whatever the route + middleware resolved. The client
// cannot influence it; a member of acme-corp can only ever reach acme-corp rows.
$tickets = Rhino::query(Ticket::class)->get();
```

The route already carries the tenant: `GET /api/acme-corp/tickets`. The middleware turned `acme-corp` into a resolved `Organization`, 404'd if the user isn't a member, and set it as the request's org context. Your job is to *read* that context through Rhino — never to re-derive it from a payload.

:::danger Never accept `organization_id` as input
`organization_id` is not a fillable, filterable, or acceptable field on any tenant model. Rhino sets it automatically on create from the resolved org. If it appears in `$fillable`, `$allowedFilters`, or a validation rule that a client can satisfy, you have a bypass. Keep it server-controlled.
:::

## The two isolation mechanisms

The Helpdesk `tenant` group has two tenant-owned models, and they're isolated **two different ways**. Knowing which is which matters the instant you leave the paved road.

### 1. Direct column — `Ticket.organization_id`

`Ticket` carries `organization_id` directly. Scoping is a plain `where organization_id = …`, applied automatically by `BelongsToOrganization`.

```php title="app/Models/Ticket.php"
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Ticket extends Model
{
    use SoftDeletes, HasValidation, BelongsToOrganization, HasAuditTrail;

    // organization_id is set automatically on create — NOT client-fillable.
    protected $fillable = ['subject', 'status', 'priority', 'category_id', 'assignee_id', 'internal_notes'];
}
```

### 2. Relationship chain — `TicketComment` via `ticket → organization`

`TicketComment` has **no** `organization_id` column. It's tenant-owned only because it belongs to a `Ticket`, which belongs to an `Organization`. Rhino **auto-detects** this by introspecting the `belongsTo` chain — no configuration needed. Scoping becomes a `whereHas('ticket', …)` under the hood.

```php title="app/Models/TicketComment.php"
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class TicketComment extends Model
{
    use HasValidation, BelongsToOrganization;

    // No organization_id column. Scoped via TicketComment → Ticket → Organization.
    protected $fillable = ['ticket_id', 'body', 'is_internal'];

    public function ticket() { return $this->belongsTo(Ticket::class); }
}
```

This is exactly why hand-written queries are dangerous. A direct-column model *looks* like it only needs one `where`; a chain model needs the whole `whereHas` reconstructed correctly, every time. Get it slightly wrong and comments leak across orgs. The resolver rebuilds the correct chain for you.

```php title="app/Http/Controllers/CommentReportController.php"
// ❌ Bad — a naive "org filter" on TicketComment. There's no organization_id
// column, so this either errors or (worse) silently filters nothing and leaks
// every org's comments.
TicketComment::where('organization_id', $org->id)->get();

// ✅ Good — the resolver knows the chain and rebuilds the whereHas for you.
Rhino::query(TicketComment::class)->get();
```

### Global models are intentionally NOT org-scoped

`Category`, `Plan`, and `Article` are the vendor's **shared catalog**. They have no `organization_id` and live in the single-tenant `app` route group — every tenant reads the same categories. That's a deliberate design choice, not a missing scope.

```php title="app/Models/Category.php"
// ✅ Good — a global model has NO BelongsToOrganization trait and lives in the
// 'app' group. It is meant to be shared. Adding org scoping here would be a bug.
class Category extends Model
{
    protected $fillable = ['name', 'slug'];
}
```

:::warning Don't org-scope a global model, don't globalize a tenant model
The failure modes are symmetric. Bolt `BelongsToOrganization` onto `Category` and every org needs its own copy of the shared catalog (and cross-references from tenant tickets break). Drop it from `Ticket` and you've deleted the tenant wall entirely. The trait — and the route group — is the boundary. Place each model deliberately.
:::

## Auto-scopes make generated CRUD tenant-safe by default

You get isolation for free on every generated endpoint because Rhino applies org scoping, policies, and your global scopes in **one place** — the `GlobalController`. You never touch a query for CRUD, so you can never forget the `where`. `GET /api/acme-corp/tickets` returns Acme's tickets; `POST` stamps `organization_id` from the resolved org; `GET /api/acme-corp/tickets/{id}` 404s for a ticket owned by another org even if the id is guessed.

This is the whole value proposition — and it's exactly what a hand-written controller throws away. The rest of this page is about not throwing it away.

## Writing safe custom controllers: the resource-scope resolver

CRUD covers index/show/store/update/destroy. Real apps need more: a dashboard, a report, a rollup. Those live in a **custom controller you write** — and the moment you hand-write a query, tenant isolation is *your* problem again. The fix is to never write a raw query: route everything through the resolver behind the `Rhino` facade, which hands you **the same tenant-safe base query Rhino uses for CRUD**.

### Direct mode — inside a tenant request

Inside a tenant request, `Rhino::query(Model::class)` reads the current organization and user from the request and returns an Eloquent `Builder` that is **already org-scoped and global-scoped**. It's a normal builder, so `where`, `count`, `sum`, `selectRaw`, `groupBy`, `paginate` all work — you're only ever narrowing an already-scoped set.

```php
use Rhino\Facades\Rhino;

// Already scoped to the request's organization. Just build on it.
$open = Rhino::query(Ticket::class)->where('status', 'open')->count();
```

:::tip Clone before you branch
`Rhino::query()` returns a fresh builder each call, but when you want several aggregations off one base, `clone` it so each branch starts from the same scoped root instead of accumulating `where` clauses.
:::

### Named scopes — `scopedQuery()`

To layer a model-whitelisted named scope on top of the scoped base, use `scopedQuery()`. It applies a scope from the model's `$allowedScopes` whitelist, invoked with the current context user as its first argument — so `?scope=assignedToMe` logic is reusable server-side:

```php
// Applies Ticket::scopeAssignedToMe(Builder, ?Authenticatable $user) on the scoped base.
$mine = Rhino::scopedQuery(Ticket::class, 'assignedToMe')->get();
```

See [Models & Queries](./models-and-queries) for how `$allowedScopes` and the `scope{Name}(Builder, ?Authenticatable $user)` methods work.

### Worked example — the Helpdesk tenant dashboard

A realistic dashboard: ticket counts by **status** and by **priority** for the current org, plus a couple of headline totals. It's a tenant request, so it uses direct mode. Every count is scoped by construction, and each resource is authorized before it's read.

```php title="app/Http/Controllers/DashboardController.php"
<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Rhino\Facades\Rhino;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        // Authorize access (whether this user may list tickets) before reading rows.
        Gate::authorize('viewAny', Ticket::class);

        // Tenant-scoped base query — same isolation as CRUD. Clone per branch.
        $tickets = Rhino::query(Ticket::class);

        return response()->json([
            'total'  => (clone $tickets)->count(),
            'open'   => (clone $tickets)->where('status', 'open')->count(),
            // Group-by breakdowns, both scoped to the current org.
            'by_status' => (clone $tickets)
                ->selectRaw('status, count(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status'),
            'by_priority' => (clone $tickets)
                ->selectRaw('priority, count(*) as total')
                ->groupBy('priority')
                ->pluck('total', 'priority'),
        ]);
    }
}
```

Now the Bad/Good that this entire page exists for:

```php title="app/Http/Controllers/DashboardController.php"
// ❌ Bad — raw query in the dashboard. This BYPASSES the organization global
// scope. In a request it may happen to work; but there's no guarantee the scope
// re-applies here, and if this same code ever runs outside a request (a cached
// rollup job, a console command) it fails OPEN — returning EVERY tenant's
// tickets. Silently. No error. A raw DB::table is even worse: no scope at all.
$byStatus = Ticket::query()
    ->selectRaw('status, count(*) as total')
    ->groupBy('status')
    ->pluck('total', 'status');
// or, no scope whatsoever:
$total = \DB::table('tickets')->count(); // ← every org's tickets. Full leak.

// ✅ Good — the resolver applies the org scope for you and fails CLOSED. If
// there's no tenant context it throws MissingTenantContext instead of leaking.
$byStatus = Rhino::query(Ticket::class)
    ->selectRaw('status, count(*) as total')
    ->groupBy('status')
    ->pluck('total', 'status');
```

Register the route **inside the tenant group** (under `{organization}` with `ResolveOrganizationFromRoute`) and **above** the auto-generated CRUD routes so it wins. That middleware is what sets the org on the request — exactly what direct-mode `Rhino::query()` reads.

```php title="routes/api.php"
use App\Http\Controllers\DashboardController;
use App\Http\Middleware\ResolveOrganizationFromRoute;

// Custom tenant routes — ABOVE the auto-generated CRUD section.
Route::prefix('{organization}')
    ->middleware(['auth:sanctum', ResolveOrganizationFromRoute::class])
    ->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index']);
    });

// Auto-generated Rhino routes below...
```

`GET /api/acme-corp/dashboard` now returns aggregates for Acme Corp only — the same tenant boundary as `GET /api/acme-corp/tickets`, with none of the isolation written by hand.

:::tip Scope authorizes rows; policies authorize access — do both
The resolver scopes **which records** you see; a policy authorizes **whether this user may touch this resource at all**. Different checks. `Gate::authorize('viewAny', Ticket::class)` before the query gives you the 403; the resolver gives you the tenant boundary. See [Authorization](./authorization).
:::

## Explicit mode — outside a tenant request

A queued job, an Artisan command, a scheduled digest, a test — there's no route to read the organization from. Ambient `Rhino::query()` correctly has nothing to resolve. Pass the user and organization **explicitly** with `Rhino::forUser(...)->inOrganization(...)`:

```php title="app/Console/Commands/EmailWeeklyTicketDigest.php"
use App\Models\Organization;
use App\Models\Ticket;
use Rhino\Facades\Rhino;

$organization = Organization::where('slug', 'acme-corp')->firstOrFail();
$user = $organization->owner;

// Org scope comes from the organization you pass, not from a route.
$openCount = Rhino::forUser($user)
    ->inOrganization($organization)
    ->query(Ticket::class)
    ->where('status', 'open')
    ->count();
```

For anything longer than one query — a whole block, a queue worker — prefer the `run()` form. It activates the explicit context for the closure and **restores the previous ambient state afterward, even on exception**, so context can't leak into later queries in a long-lived process. Inside the closure, plain ambient `Rhino::query()` resolves to the passed org:

```php title="app/Jobs/RebuildOrganizationDashboardCache.php"
use App\Models\Ticket;
use App\Models\TicketComment;
use Rhino\Facades\Rhino;

$metrics = Rhino::forUser($user)
    ->inOrganization($organization)
    ->run(function () {
        // Ambient Rhino::query() resolves to THIS org inside the closure.
        return [
            'tickets'  => Rhino::query(Ticket::class)->count(),
            'comments' => Rhino::query(TicketComment::class)->count(),
        ];
    });
```

```php title="app/Jobs/RebuildOrganizationDashboardCache.php"
// ❌ Bad — raw query in a job. There's NO request, so the org global scope has
// nothing to bind to and fails OPEN: this counts every tenant's tickets and
// writes one org's cache with the whole platform's numbers. Silent, total leak.
$total = Ticket::count();

// ✅ Good — explicit context makes the scope concrete. Wrong-or-missing org is
// a loud MissingTenantContext crash, never a silent cross-tenant count.
$total = Rhino::forUser($user)->inOrganization($organization)
    ->query(Ticket::class)->count();
```

This is the recommended shape for jobs and workers, and it's how you keep a **cached** dashboard tenant-safe: compute in a job under explicit mode, cache the result, read the cache in the controller.

## Fail closed — the whole point of the resolver

The resolver **never** returns an unscoped query for a tenant-owned model. Call `Rhino::query()` for an org-scoped model with **no** organization context — no request, no explicit `inOrganization()` — and it does not silently return every tenant's rows. It **throws** `Rhino\Exceptions\MissingTenantContext`:

```php
use Rhino\Facades\Rhino;

// In a console command with no tenant context:
Rhino::query(Ticket::class);
// → throws Rhino\Exceptions\MissingTenantContext:
//   "Rhino::query(App\Models\Ticket) requires an organization context but none is
//    set. Use Rhino::forUser(...)->inOrganization(...) outside a tenant request."
```

This is the **opposite** of a raw model query, which fails **open** outside a request. Forgetting the tenant context becomes a loud crash you catch in development — not a silent cross-tenant leak in production.

:::danger This is the entire reason the resolver exists
A raw `Ticket::all()` in a job leaks every tenant. `Rhino::query(Ticket::class)` in the same job throws. Always reach for the resolver.
:::

## Single-tenant vs multitenant in the hybrid Helpdesk

Helpdesk is a **hybrid** app — two route groups with two different tenancy contracts. The resolver behaves differently in each, and that difference is the safety property.

| | `app` group (single-tenant) | `tenant` group (multitenant) |
|---|---|---|
| **Prefix** | `''` (no org segment) | `{organization}` |
| **Middleware** | `auth:sanctum` | `+ ResolveOrganizationFromRoute` |
| **Models** | `Category`, `Plan`, `Article` — global | `Ticket`, `TicketComment` — org-owned |
| **Scoping** | user-ownership / none | organization |
| **Resolver with no org context** | returns **unscoped** (correct — nothing to scope) | **throws** `MissingTenantContext` (fail closed) |

The rule follows from the trait, not the URL: a **global** model (no `BelongsToOrganization`) has no tenant to scope to, so the resolver returns it unscoped — `Rhino::query(Category::class)` in the `app` group is correct and safe. A **tenant-owned** model (`BelongsToOrganization`) *requires* an org context, so if one is missing the resolver refuses rather than guessing.

```php title="app/Http/Controllers/CatalogController.php"
// ✅ Good — Category is a GLOBAL 'app' model. Unscoped is correct; there is no
// organization it should be filtered to. The resolver returns the full catalog.
$categories = Rhino::query(Category::class)->get();

// ✅ Good — Ticket is a TENANT model. In an 'app'-group controller (no org
// context) the resolver FAILS CLOSED and throws MissingTenantContext, rather
// than handing back every tenant's tickets. Read tickets from the tenant group.
$tickets = Rhino::query(Ticket::class)->get(); // → MissingTenantContext here
```

That asymmetry is the safety net: you cannot accidentally read tenant data from a non-tenant surface, because the resolver won't fabricate an organization for you.

## Checklist

- The organization comes from the **route + middleware**, never from request input. `organization_id` is never client-fillable, filterable, or acceptable.
- `Ticket` is scoped by **column**; `TicketComment` by **relationship chain** (auto-detected). Don't hand-write either — the resolver rebuilds the correct query.
- `Category` / `Plan` / `Article` are **global by design** and live in the `app` group. Don't org-scope them; don't globalize `Ticket`.
- Generated CRUD is tenant-safe for free. **Custom controllers** must go through `Rhino::query()` / `Rhino::scopedQuery()` (direct) or `Rhino::forUser()->inOrganization()` / `->run()` (explicit) — **never** `Ticket::query()` or `DB::table()`.
- The resolver **fails closed** (`MissingTenantContext`); raw queries **fail open**. Scope authorizes rows; **policies** authorize access — do both.

## Related

- [Multi-Tenancy](../multi-tenancy) — how org scoping works, direct and nested (relationship-based) ownership.
- [Custom Controllers](../custom-controllers) — the resource-scope resolver in full: direct mode, explicit mode, `run()`, and `InteractsWithRhinoResources`.
- [Authorization](./authorization) — policies, per-org RBAC, and attribute-level permissions that pair with row scoping.
- [Best Practices hub](./) — the rest of the Helpdesk manual.
