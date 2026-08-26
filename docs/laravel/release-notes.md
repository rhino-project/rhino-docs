---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Laravel, newest first.

## 4.7.1

**`Rhino::query()` in single-tenant apps.** The resource-scope resolver assumed every app is multi-tenant: any model that reached an organization — by its own column **or** through a `BelongsTo` chain — required an organization context, so `Rhino::query(Task::class)` outside a tenant route group always threw `MissingTenantContext`. An admin panel where every operator legitimately sees every organization's rows had no way to use the resolver at all, which pushed exactly the code that most needs scoping back onto raw model queries.

A master flag now turns organization scoping off for the whole app:

```php title="config/rhino.php"
'multi_tenant' => [
    'enabled' => false, // single-tenant: no organization filter, no fail-closed throw
    'organization_identifier_column' => 'id',
],
```

With it `false`, `Rhino::query()` and `Rhino::scopedQuery()` skip the organization filter and stop throwing, so ambient calls work with no tenant route group — and no request at all:

```php
use Rhino\Facades\Rhino;

// Admin panel controller, console command or job — no organization context needed.
$open = Rhino::query(Task::class)->where('status', 'open')->count();
$rows = Rhino::forUser($admin)->query(Task::class)->get();
```

This is **not** an unscoped escape hatch. With the flag off:

- The app's user-aware global scopes (`App\Models\Scopes\{Model}Scope`) still run, so row-level access stays with your own roles and scopes.
- `$allowedScopes` named scopes still apply through `Rhino::scopedQuery()`.
- An explicit `Rhino::forUser($user)->inOrganization($org)` still scopes to that organization — the caller asked for that tenant.
- CRUD through `GlobalController` is untouched: tenant route groups resolve and scope the organization exactly as before.

**`rhino:install` no longer drops the flag.** `updateConfig()` replaced the whole `multi_tenant` block with just `organization_identifier_column`, so the `enabled` key published moments earlier vanished from the app's own config file. Behavior was unaffected — the resolver defaults the flag to `true` when the key is absent — but a single-tenant app had no key to flip without hand-editing. It now merges instead of replacing, so a config that predates the flag gains it on the next install.

Fully backward compatible — the flag defaults to `true`, including for installs whose published config has no such key, so multi-tenant apps keep failing closed exactly as before.

Laravel only; Rails and NestJS are unchanged at 4.7.0.

See [Multi-Tenancy — Single-Tenant Apps](./multi-tenancy#single-tenant-apps) and [Custom Controllers — Fail Closed](./custom-controllers#fail-closed).

## 4.7.0

**Computed attributes, without the per-row cost.** Two new declaration hooks make derived values and aggregates first-class, so counts and expensive per-row values no longer need a hand-written controller.

**Collection-level aggregates.** Declare `rhinoCollectionComputedAttributes()` on a model and Rhino registers `GET /api/{resource}/computed` for it. Each callable is evaluated **once per request** over the fully scoped query — not once per row:

```php title="app/Models/User.php"
class User extends RhinoModel
{
    public static function rhinoCollectionComputedAttributes(): array
    {
        return [
            'active_users_count' => fn ($query, $user) => $query->where('status', 'active')->count(),
            'blocked_users_count' => fn ($query, $user) => $query->where('status', 'blocked')->count(),
        ];
    }
}
```

```bash
GET /api/users/computed?attributes=active_users_count,blocked_users_count
# → { "data": { "active_users_count": 128, "blocked_users_count": 4 } }
```

The query handed to each callable already has the organization scope, global scopes, `?scope=`, `?filter[]=` and `?search=` applied — so aggregates describe exactly the set `index` would have listed. Omitting `?attributes=` returns every declared attribute the policy allows. The endpoint is gated by `viewAny`.

**Opt-in record attributes.** Declare `rhinoRecordComputedAttributes()` for per-row values that cost a query. Nothing is evaluated unless the client asks for it by name:

```php title="app/Models/User.php"
public function rhinoRecordComputedAttributes(): array
{
    return [
        'open_tickets_count' => fn ($record, $user) => $record->tickets()->whereNull('closed_at')->count(),
    ];
}
```

```bash
GET /api/users?computed_attributes=open_tickets_count
GET /api/users/42?computed_attributes=open_tickets_count
GET /api/users/trashed?computed_attributes=open_tickets_count
```

- Both kinds go through the **same policy gate as columns** — `permittedAttributesForShow()` whitelists, `hiddenAttributesForShow()` blacklists.
- An undeclared name and a policy-denied name return the same 403, so the endpoint never reveals which attributes a model declares.
- `'computed'` is accepted in `$exceptActions` to drop the route.
- The Postman export gains a **Computed Attributes** folder plus `?computed_attributes=` examples on Index and Show.

See [Computed Attributes](./computed-attributes) for the full reference, and [Best Practices — Models & Queries](./best-practices/models-and-queries#derived-values-and-counts--never-a-controller) for why this replaces a dashboard controller.

Fully backward compatible — existing `rhinoComputedAttributes()` behaves exactly as before, read responses are unchanged unless a client sends `?computed_attributes=`, and the `/computed` route is registered only for models that declare collection attributes.

:::warning Laravel upgrade step — re-publish `routes/api.php`
Rhino's route file is **published into your app** (`routes/api.php`), so route registration lives in code you own. An app upgrading from an earlier version will not serve `/computed` until that file is refreshed:

```bash
php artisan vendor:publish --tag=routes --force
```

If you have hand-edited your route file, add the `computed` block yourself — it must be registered **before** the `{id}` routes, next to `trashed`:

```php
if ($hasComputedAttributes && !in_array('computed', $exceptActions)) {
    Route::get('computed', [GlobalController::class, 'computed'])
        ->defaults('model', $slug)
        ->defaults('route_group', $groupKey)
        ->middleware($actionMiddleware['computed'] ?? [])
        ->name("{$groupKey}.{$slug}.computed");
}
```

The `?computed_attributes=` parameter on index/show/trashed needs **no** route change — it works as soon as the package is updated. Rails and NestJS register routes from inside the library, so they need no equivalent step.
:::

## 4.6.0

**Configurable route key.** Member routes (`show`, `update`, `destroy`, `restore`, force-delete) can now match the `{id}` URL segment against any unique column instead of the primary key — set `$routeKey` on the model, or the global `'route_key'` option in `config/rhino.php`:

```php title="app/Models/Job.php"
class Job extends RhinoModel
{
    public static string $routeKey = 'hash_id'; // GET /api/jobs/{hash_id}
}
```

Resolution order is per-model `$routeKey` → global `route_key` config → primary key (via Eloquent's `getRouteKeyName()`). See [Models — Route Key](./models#route-key) for full details and caveats.

- The route-key column and `id` are now always kept in serialized output, regardless of policy whitelists, so clients can build URLs.
- [Blueprint](./blueprint) supports a per-model `options: { route_key: ... }` that emits the `$routeKey` static in the generated model and uses route-key URLs in generated tests.

Fully backward compatible — defaults are unchanged; nothing changes unless a route key is configured.

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-laravel/releases) for the history of earlier versions.
