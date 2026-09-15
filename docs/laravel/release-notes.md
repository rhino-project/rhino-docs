---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Laravel, newest first.

## 4.9.0

**Computed attributes take arguments, the same way scopes do.** A computed attribute used to be a
name and nothing else, so anything the client needed to vary had to be baked into its own attribute —
`revenue_last_30_days`, `revenue_last_90_days`, `revenue_ytd` — or pushed out to the client as a
filter over a column you then had to expose. An attribute can now declare parameters the client fills
in:

```php title="app/Models/User.php"
public static function rhinoCollectionComputedAttributes(): array
{
    return [
        'active_users_count' => fn ($query, $user) => $query->where('status', 'active')->count(),
        'revenue' => [
            'params' => ['from', 'to'],
            'using'  => fn ($query, $user, $from, $to) => $query
                ->whereBetween('created_at', [$from, $to])
                ->sum('total'),
        ],
    ];
}
```

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'
```

```json
{ "data": { "revenue": 48210.5 } }
```

The same three bracket forms work on `?computed_attributes=` for per-record attributes on `index`,
`show` and `trashed`, where a record callable receives them as `fn ($record, $user, $since, $status)`.

- Arguments bind **by name** and reach the callable in declared order, after the user. A bare value
  binds to the single declared parameter; a positional list is refused; `"true"` / `"false"` arrive as
  real booleans.
- An omitted trailing optional parameter is not passed at all, so the callable's own default applies —
  which means every name listed in `optional` must have a PHP default in the closure signature. Without
  one, an all-optional attribute requested with no arguments throws `ArgumentCountError`.
- The declared check and the policy check run **before** any argument is bound, so an undeclared name
  and a policy-denied one keep returning the same `Computed attribute 'x' is not allowed`, and the
  messages that do name a parameter are only reachable for an attribute the caller may already use.
- Argument mistakes are `403`: `requires parameter 'to'`, `does not accept parameter 'nope'`,
  `requires named parameters`, `does not accept arguments`. A structurally impossible selection —
  `?attributes[]=x` — is `Computed attributes are not allowed`.
- A bare `GET /{resource}/computed` returns every policy-allowed attribute **minus** any that declares
  a required parameter; those are skipped silently rather than erroring, so adding one never breaks a
  client asking for everything. All-optional attributes are still evaluated.
- The Postman export emits the bracket form for parameterised attributes, and leaves them out of the
  combined multi-attribute request, which would otherwise ship a guaranteed 403.

Two things differ from named scopes on purpose, and they are the two a reader who knows that feature
will guess wrong about. There is **no shorthand declaration form** — only an array carrying `params`,
`optional` or `using` is a spec, because a bare list is already a valid *literal* declaration and
reinterpreting it would silently change what a shipped model returns. And there is **no per-request
cap**: arguments change what each attribute computes, never how many rows the request touches.

**The React client** ships the matching form in `@rhino-dev/rhino-react` 4.6.0. `computedAttributes`
and `useModelComputedAttributes`'s `attributes` now accept an object as well as an array —
`{ revenue: { from, to }, activeUsersCount: null }` — serialized to the bracket URL. `ScopeSelection`
is also now genuinely exported from the package entry point; 4.5.0 documented it but only exported it
from the types module.

Everything that worked before works unchanged: `?attributes=a,b` and `?computed_attributes=a,b` parse
exactly as they did, a declaration that is not a spec array keeps its existing meaning, `asRhinoJson()`
gained an optional third argument rather than changing the first two, and every scope error string is
byte-identical — scopes and computed attributes now share one argument binder, with the noun injected.

No upgrade step. This adds no route, so `routes/api.php` is untouched and needs no re-publish; a
dependency bump is sufficient.

## 4.8.2

**Fixes a fatal when `$allowedSorts` holds Spatie objects.** A model may declare its sorts as
`AllowedSort::field(...)` rather than plain strings. The 4.8.0 attribute gate cast every entry to a
string to read its name, and casting an `AllowedSort` throws
`Object of class Spatie\QueryBuilder\AllowedSort could not be converted to string`. Filters were
already handled; sorts now are too, through the same path.

**A renamed filter or sort no longer walks around the policy.**
`AllowedSort::field('cost', 'salary')` is asked for as `?sort=cost` but orders by `salary`. The gate
now checks the attribute an entry actually reads, not the name the URL carries, so hiding `salary`
covers every label pointing at it.

**A name that is not a column is no longer refused by a whitelist policy.** A callback filter
(`AllowedFilter::callback('q', ...)`) or a renamed entry's label is not an attribute, so
`permittedAttributesForShow()` has no opinion about it. Such a name now passes, while a name listed
in `hiddenAttributesForShow()` is still refused and a real column outside the whitelist still is too.
Apps that restrict attributes with a whitelist **and** use callback or renamed filters were getting
403 on those since 4.8.0.

## 4.8.1

**The named-scope cap is configurable.** How many scopes one request may combine is now
`max_scopes_per_request` in `config/rhino.php`, defaulting to the same 3 as before:

```php title="config/rhino.php"
'max_scopes_per_request' => 3,
```

An app whose published config predates the key keeps the default, and a value below 1 is ignored
rather than locking every scope out of every request.

The [Combining scopes](./querying#combining-scopes) docs now also explain what the cap is protecting
you from, with a worked example: two scopes that each `join` a relation are correct alone and wrong
together, returning duplicate rows, inflating the pagination total and making `?sort=` ambiguous.
Prefer `whereHas` / `whereExists`, keep ordering and limits out of scope bodies, and do not reach for
`distinct` as a patch.

## 4.8.0

**Named scopes take arguments.** A scope used to be a name and nothing else, so anything the client
needed to vary had to be expressed as a filter — which meant exposing the column and hoping the
client composed the predicate correctly. A scope can now declare parameters the client fills in:

```php
public static $allowedScopes = [
    'archived',                                  // no parameters
    'since' => 'date',                           // one parameter
    'window' => ['from', 'to'],                  // two, both required
    'titled' => ['params' => ['title', 'status'], 'optional' => ['status']],
];
```

```bash
GET /api/routes?scope[since]=2026-01-01
GET /api/routes?scope[window][from]=2026-01-01&scope[window][to]=2026-02-01
```

Arguments bind by name and reach the scope in declared order, after the current user. `?scope=name`
still works exactly as before, and a scope that declares no parameters still never receives client
input: sending any is a 403.

Up to three scopes may be combined in the bracket form, applied in the order the URL lists them. The
two forms cannot be mixed in one request, since they share the `scope` query key — write a
no-argument scope as `?scope[archived]=` when combining it with one that takes arguments.

**Policies choose which scopes a user may select.** The new `permittedScopes()` returns `['*']` by
default, so nothing changes until you override it:

```php
public function permittedScopes(?Authenticatable $user): array
{
    return $user?->hasRole('dispatcher') ? ['*'] : ['availableForDrivers'];
}
```

A denied scope and an undeclared one return the same message, so the endpoint never reveals which
scopes a model has.

**Attribute permissions now gate filters, sorts and search.** This closes a real leak. Hiding an
attribute in a policy only affected serialization, so a hidden column stayed usable as a query
predicate: `?filter[salary]=300000` never printed a salary but told the caller whose salary it was,
and `?sort=-salary` leaked the whole ordering. Both now return 403:

```bash
GET /api/employees?filter[salary]=300000
# → 403 { "message": "Filter 'salary' is not allowed" }
```

`?search=` names a term rather than a column, so it has nothing to refuse: it simply skips the
columns this user may not see, and returns nothing when all of them are hidden. A column the model
never allowlisted is still ignored rather than refused, so this cannot be used to discover which
columns exist. The model's own `$defaultSort` is unaffected.

If a model allowlists an attribute that some role cannot see, clients for that role will start
getting 403 where they used to get data. That is the point, but it is worth checking before you
deploy.

## 4.7.3

**Jobs and commands can name their route group.** 4.7.2 made the tenant boundary a property of the
route group, which left code with **no request** unable to reach a non-tenant group at all: a queued
job, an Artisan command or a scheduled task resolves no group, so `Rhino::query()` always failed
closed there. The only way out was passing an explicit organization — which a back-office job that
legitimately spans every tenant does not have.

Such code now says which group it is acting as:

```php
use Rhino\Facades\Rhino;

// The 'admin' group is declared 'tenant' => false, so this spans every organization.
Rhino::inRouteGroup('admin')->query(Task::class)->where('status', 'open')->count();

// With an operator, so the user-aware global scopes still narrow the rows:
Rhino::forUser($operator)->inRouteGroup('admin')->query(Task::class)->get();

// Ambient calls inside the block see the group too:
Rhino::inRouteGroup('admin')->run(fn () => Rhino::query(Task::class)->count());
```

**It states a context; it is not a bypass.** The named group's own `'tenant' => false` in
`config/rhino.php` is what lifts the boundary, so naming a tenant group or one that is not configured
still throws `MissingTenantContext`, and so does a `forUser()` that names no group. An explicit
`inOrganization($org)` still scopes in any group, and the override is popped once the query is built,
so nothing leaks into a later ambient query in a long-lived worker.

`PendingScopedContext` also gains `forUser()`, so the builder reads the same in either order, and an
explicit context can only **add** a group, never erase the one a request is already served by —
`Rhino::forUser($u)->query(...)` inside a non-tenant request keeps that request's group.

### How to update

```bash
composer require rhino-project/rhino-laravel:^4.7.3
```

Nothing to change. `inRouteGroup()` is additive, and every existing call behaves exactly as it did in
4.7.2.

1. **In a back-office job or command**, replace a query that could not be written before with
   `Rhino::inRouteGroup('<group>')->query(...)`. The group must already be declared
   `'tenant' => false` — see [Route Groups — Tenant Boundary](./route-groups#tenant-boundary).
2. **Jobs scoped to one tenant** keep using `Rhino::forUser($user)->inOrganization($org)`; that is
   still the right call and is unchanged.

See [Multi-Tenancy — Naming the group where no route resolves one](./multi-tenancy#naming-the-group-where-no-route-resolves-one).

## 4.7.2

**A tenant boundary is a property of a route group, not of the app.** `Rhino::query()` fails closed:
an organization-scoped model queried with no organization throws `MissingTenantContext` rather than
returning every tenant's rows. That is right for a tenant app and wrong for a back office, where
operators are *meant* to see every organization — so 4.7.1 added an app-wide
`config('rhino.multi_tenant.enabled')` switch to turn it off.

That switch could not express the shape that actually needs it: an app whose `/api` group **is**
multi-tenant and whose admin group is not. Turning it off there disabled fail-closed for every group,
including the tenant ones — the guard was removed exactly where it was still needed. It is replaced
by a per-group key:

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
    'admin' => [
        'prefix' => 'admin',
        'tenant' => false, // no tenant boundary: queries here span every organization
        'middleware' => [],
        'models' => [],
    ],
],
```

In a `'tenant' => false` group, `Rhino::query()` and `Rhino::scopedQuery()` apply no organization
filter and no longer throw. The `tenant` group in the same app is untouched and keeps failing closed.

**Tag your own routes with their group.** The resolver reads the group from the matched route's
`route_group` default — the same value memberships and policies already use. Rhino's generated CRUD
routes carry it; a route you register yourself has to set it:

```php title="routes/api.php"
Route::middleware(['auth:sanctum'])
    ->get('admin/dashboard', [AdminDashboardController::class, 'summary'])
    ->defaults('route_group', 'admin');
```

Register non-tenant routes **above** any `{organization}`-prefixed route, or `/api/admin/dashboard`
is matched as the tenant route with `{organization} = 'admin'`.

**Nothing else is relaxed.** Declaring a group non-tenant removes only the organization filter, and
only for that group. Your `App\Models\Scopes\{Model}Scope` global scopes, `$allowedScopes` named
scopes, policies, and an explicit `inOrganization($org)` all behave exactly as before, as does CRUD
through `GlobalController`. Anything not provably a non-tenant group still fails closed: an unknown
group, a route with no group tag, and any code outside a request at all — a queued job or console
command resolves no group, so it must still pass the tenant explicitly.

Also in this release: `php artisan rhino:install` merges the `multi_tenant` config block instead of
replacing it, so keys your app added there survive re-running the installer.

### How to update

```bash
composer require rhino-project/rhino-laravel:^4.7.3
```

Nothing else is required for a multi-tenant app — fail-closed behavior is unchanged, and the
`'tenant'` key defaults to `true` when absent.

1. **If you set `multi_tenant.enabled => false` in 4.7.1**, remove it — the key no longer exists.
   Declare the group serving your back-office routes `'tenant' => false` instead, and tag those
   routes with `->defaults('route_group', '<group>')`. Without this step those calls resume throwing
   `MissingTenantContext`.
2. **If your custom controllers already use `Rhino::query()` inside tenant routes**, add
   `->defaults('route_group', 'tenant')` to those routes for consistency. Not required — a route with
   no group tag is treated as a tenant group and keeps failing closed.
3. No migration, no re-publish. `config/rhino.php` is published into your app, so the new key's
   documentation comment only appears if you re-publish it
   (`php artisan vendor:publish --tag=rhino-config --force`); the feature works without that.

See [Multi-Tenancy — Route Groups Without a Tenant Boundary](./multi-tenancy#route-groups-without-a-tenant-boundary),
[Route Groups — Tenant Boundary](./route-groups#tenant-boundary), and
[Custom Controllers — Fail Closed](./custom-controllers#fail-closed).

:::info 4.7.1 is superseded
4.7.1 shipped the app-wide `multi_tenant.enabled` switch described above, on Laravel only. It is
replaced by the per-group key in 4.7.2 — upgrade rather than adopting it.
:::

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

### How to update

```bash
composer require rhino-project/rhino-laravel:^4.7.3
```

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

### How to update

```bash
composer require rhino-project/rhino-laravel:^4.7.3
```

Then set `$routeKey` on the models that need it, or the global `'route_key'` in `config/rhino.php`.
Clients must switch to the new identifier in URLs at the same time — the `{id}` segment stops matching
the primary key for those models. No migration is required beyond a **unique index** on the chosen
column.

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-laravel/releases) for the history of earlier versions.
