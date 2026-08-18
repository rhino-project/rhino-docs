---
sidebar_position: 12
title: Custom Controllers
---

# Custom Controllers

Rhino auto-generates a full CRUD API from your model definitions — index, show, store, update, destroy, plus trash/restore — and every one of those endpoints is tenant-safe out of the box. But real apps need logic that goes beyond CRUD: a dashboard that aggregates across resources, a report that groups by status, a computed summary, a bulk operation. Those live in a **custom controller** you write yourself.

The moment you hand-write a controller, you leave the paved road. This page shows how to write custom controllers that stay tenant-isolated **by construction**, using the resource-scope resolver behind the `Rhino` facade.

:::warning First check whether you need a controller at all
Counts, sums and other **aggregates over one resource** do **not** need a controller — that is what [Computed Attributes](./computed-attributes) are for. `GET /api/tickets/computed?attributes=open_tickets_count` is org-scoped, policy-filtered, and narrowed by the same `?filter[]`/`?search=`/`?scope=` as the listing, all for a few lines on the model. Reach for a controller when the shape genuinely isn't "attributes of one resource" — cross-model reports, non-CRUD workflows, bulk operations.
:::

## Why This Matters

Rhino's CRUD is tenant-safe because it applies organization scoping, policies, and your global scopes to every query in **one place** — the `GlobalController`. You never touch a query, so you can never forget a `where organization_id = …`.

A hand-written controller bypasses all of that. If you write a raw model query (or raw SQL) in a dashboard, you are now responsible for re-applying tenant isolation for **every model you touch**, in every query. That is dangerously easy to get wrong — especially for a model scoped **through a relationship** (a `Task` that has no `organization_id` of its own and is only tenant-owned via `Project → Organization`). There is no column to filter on; you'd have to reconstruct the whole `whereHas` chain by hand, correctly, every time.

Worse: outside a request, the framework's organization global scope can fail **open**. A raw `Task::all()` in a job or console command — where there's no request to read the org from — returns **every tenant's rows**. Silently. No error.

The resolver gives you the **same tenant-safe base query Rhino uses for CRUD**, so a custom controller stays isolated without you thinking about it:

```php title="app/Http/Controllers/DashboardController.php"
// ❌ BAD — raw query. Scoping is your problem now, and it's easy to leak.
$openTasks = Task::where('status', 'open')->count();
// In a request this may work; in a job it returns EVERY tenant's tasks.

// ✅ GOOD — resolver. Org-scoped exactly like CRUD, fails closed if there's no tenant.
use Rhino\Facades\Rhino;

$openTasks = Rhino::query(Task::class)->where('status', 'open')->count();
```

Same query surface (it's a normal Eloquent `Builder`), but the base is already scoped to the current organization and your user-aware global scopes are already applied.

## The Resolver — Direct Mode

Inside a tenant request, use the **ambient** form. `Rhino::query()` resolves the current organization and user from the request and hands you an Eloquent `Builder` that is already organization-scoped and global-scoped — the CRUD base query, ready for you to build on:

```php title="app/Http/Controllers/DashboardController.php"
<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Rhino\Facades\Rhino;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        // Already scoped to the request's organization + your global scopes.
        $base = Rhino::query(Task::class);

        return response()->json([
            'total'     => $base->count(),
            'completed' => (clone $base)->where('status', 'done')->count(),
        ]);
    }
}
```

`Rhino::query(Task::class)` returns a `Builder`, so everything you already know works — `where`, `count`, `sum`, `selectRaw`, `groupBy`, `paginate`. You're only ever narrowing an already-scoped set.

:::tip Clone before you branch
`Rhino::query()` returns a fresh builder each call, but if you want several aggregations off one base, `clone` it (as above) so each branch starts from the same scoped root instead of accumulating `where` clauses.
:::

### Named scopes

To layer a model-whitelisted named scope on top of the scoped base, use `scopedQuery()`. It applies a scope from the model's `$allowedScopes` whitelist, invoked with the current context user as its first argument:

```php
$available = Rhino::scopedQuery(Task::class, 'availableForDrivers')->get();
```

See [Querying → Named Scopes](./querying.md) for how `$allowedScopes` and the `scope{Name}(Builder, ?Authenticatable $user)` methods work.

## Explicit Mode

Outside a tenant request — a queued job, an Artisan command, a scheduled task, a test — there is no route to read the organization from. Ambient `Rhino::query()` would (correctly) have nothing to resolve. For those cases, pass the user and organization **explicitly** with `Rhino::forUser(...)->inOrganization(...)`. The org scope then comes from the organization you pass, not from a route:

```php title="app/Console/Commands/EmailWeeklyDigest.php"
use App\Models\Organization;
use App\Models\Task;
use Rhino\Facades\Rhino;

$organization = Organization::where('slug', 'acme-corp')->firstOrFail();
$user = $organization->owner;

// Build a scoped query for this explicit (user, organization):
$openTasks = Rhino::forUser($user)
    ->inOrganization($organization)
    ->query(Task::class)
    ->where('status', 'open')
    ->count();
```

For anything longer than a single query — a whole block of work, a queue worker — prefer the `run()` form. It activates the explicit context for the duration of the closure and restores the previous ambient state afterward (even on exception), so the context can't leak into later queries in a long-lived process:

```php title="app/Jobs/RebuildOrganizationMetrics.php"
use Rhino\Facades\Rhino;

$metrics = Rhino::forUser($user)
    ->inOrganization($organization)
    ->run(function () {
        // Inside here, ambient Rhino::query() resolves to THIS org.
        return [
            'tasks'    => Rhino::query(Task::class)->count(),
            'projects' => Rhino::query(Project::class)->count(),
        ];
    });
```

Inside the `run()` closure you can use plain ambient `Rhino::query()` — the explicit context makes it resolve to the passed organization. This is the recommended shape for jobs and workers.

## Fail Closed

The resolver **never** returns an unscoped query for a tenant-owned model. If you call `Rhino::query()` for an organization-scoped model and there is **no** organization context — no request, no explicit `inOrganization()` — it does not silently return every tenant's rows. It **throws** `Rhino\Exceptions\MissingTenantContext`:

```php
use Rhino\Facades\Rhino;

// In a console command with no tenant context:
Rhino::query(Task::class);
// → throws Rhino\Exceptions\MissingTenantContext:
//   "Rhino::query(App\Models\Task) requires an organization context but none is
//    set. Use Rhino::forUser(...)->inOrganization(...) outside a tenant request."
```

This is the **opposite** of a raw model query, which fails **open** outside a request (returns everyone's rows). With the resolver, forgetting the tenant context is a loud crash you catch in development, not a silent cross-tenant leak in production.

:::warning
This is the entire point of the resolver. A raw `Task::all()` in a job leaks every tenant. `Rhino::query(Task::class)` in the same job throws. Always reach for the resolver.
:::

## Worked Example: A Tenant-Safe Dashboard

Here's a realistic dashboard that aggregates across **two** resources — projects and tasks — for the current tenant. It uses direct mode (it's a tenant request) and produces totals plus a group-by-status breakdown, all scoped by construction:

```php title="app/Http/Controllers/DashboardController.php"
<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;
use Rhino\Facades\Rhino;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        // Each resource is authorized independently before we read its rows.
        Gate::authorize('viewAny', Project::class);
        Gate::authorize('viewAny', Task::class);

        // Tenant-scoped base queries — same isolation as CRUD.
        $projects = Rhino::query(Project::class);
        $tasks    = Rhino::query(Task::class);

        return response()->json([
            'projects' => [
                'total'  => (clone $projects)->count(),
                'active' => (clone $projects)->where('status', 'active')->count(),
            ],
            'tasks' => [
                'total'        => (clone $tasks)->count(),
                'overdue'      => (clone $tasks)->where('due_at', '<', now())
                                                ->where('status', '!=', 'done')
                                                ->count(),
                // Group-by-status breakdown, scoped to this org.
                'by_status'    => (clone $tasks)
                    ->selectRaw('status, count(*) as total')
                    ->groupBy('status')
                    ->pluck('total', 'status'),
            ],
        ]);
    }
}
```

Register the route **inside the tenant route group** — under the `{organization}` prefix with `ResolveOrganizationFromRoute` — and **above** the auto-generated CRUD routes so it wins. That middleware is what sets the organization on the request, which is exactly what direct-mode `Rhino::query()` reads:

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

Now `GET /api/acme-corp/dashboard` returns aggregates for Acme Corp only — the same tenant boundary as `GET /api/acme-corp/tasks`, with none of the isolation logic written by hand.

## Best Practices

- **Always go through the resolver.** Never write a raw model query or raw SQL in a custom controller for a tenant-owned model. `Rhino::query()` / `Rhino::scopedQuery()` (direct) or `Rhino::forUser()->inOrganization()` (explicit) — those are the only tenant-safe entry points. A raw query is a leak waiting to happen.

- **Gate each resource with its policy.** The resolver scopes **rows** (which records); policies authorize **access** (whether this user may read this resource at all). They're different checks — do both. Authorize every resource your controller reads:

  ```php
  use Illuminate\Support\Facades\Gate;

  Gate::authorize('viewAny', Task::class);   // 403 if the user can't list tasks
  $tasks = Rhino::query(Task::class);
  ```

  When you'd rather skip a metric than 403 the whole request (e.g. a widget the user can't see), the `InteractsWithRhinoResources` trait gives you `ifCanView()`, which returns `null` when the gate denies instead of throwing:

  ```php
  use Rhino\Support\InteractsWithRhinoResources;

  class DashboardController extends Controller
  {
      use InteractsWithRhinoResources;

      public function index(): JsonResponse
      {
          return response()->json([
              // $this->scoped(Task::class) is the tenant-scoped base query.
              'open_tasks' => $this->ifCanView(
                  Task::class,
                  fn ($q) => $q->where('status', 'open')->count()
              ),
          ]);
      }
  }
  ```

- **Offload expensive work.** The resolver keeps the per-request path cheap, but heavy aggregations or external calls don't belong inline on every dashboard hit. Push expensive or external work into a **cached service** (compute in a job, cache the result, read the cache in the controller) so the request path stays fast. Use explicit mode (`Rhino::forUser()->inOrganization()->run(...)`) inside that job to keep it tenant-scoped.

## Related

- [Multi-Tenancy](./multi-tenancy.md) — how organization scoping works, direct and nested (relationship-based) ownership.
- [Policies & Permissions](./policies.md) — the `viewAny`/`Gate::authorize` checks that authorize access per resource.
- [Querying](./querying.md) — filters, sorts, includes, and the `$allowedScopes` named scopes `scopedQuery()` builds on.
- [Computed Attributes](./computed-attributes.md) — per-resource aggregates without a controller.
