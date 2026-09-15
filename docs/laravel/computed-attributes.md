---
sidebar_position: 5
title: Computed Attributes
---

# Computed Attributes

Computed attributes are values your API returns that are **not database columns** — a formatted name, a derived flag, a count. Rhino has three kinds, and picking the right one is almost entirely a performance decision:

| Kind | Declared with | Evaluated | Use it for |
|---|---|---|---|
| **Always-on, per record** | `rhinoComputedAttributes()` | On every read, for every row | Cheap values derived from columns already loaded |
| **Opt-in, per record** | `rhinoRecordComputedAttributes()` | Only when the client sends `?computed_attributes=` | Per-row values that cost a query or real work |
| **Collection-level** | `rhinoCollectionComputedAttributes()` | Once per request, via `GET /{resource}/computed` | Aggregates over the whole collection — counts, sums, averages |

All three are subject to the same policy filtering as database columns. None of them require a custom controller. The two opt-in kinds can also declare [parameters the client fills in](#attributes-with-parameters), so one declaration covers a date window, a status or a currency rather than a family of near-identical attributes.

:::tip Counting rows? You want the collection-level kind.
A "how many users are active" number is **one aggregate over the collection**, not a value that belongs on each row. Declaring it as a per-record attribute would run the count once per returned record — 25 identical `COUNT(*)` queries for a 25-row page. See [Collection-level computed attributes](#collection-level-computed-attributes).
:::

## Always-on computed attributes

`rhinoComputedAttributes()` returns a map that is merged into **every** serialized record, on every endpoint. There is no way for a client to opt out, so only put cheap, column-derived values here.

```php title="app/Models/User.php"
class User extends RhinoModel
{
    public function rhinoComputedAttributes(): array
    {
        return [
            'full_name' => trim($this->first_name . ' ' . $this->last_name),
            'is_locked' => $this->locked_at !== null,
        ];
    }
}
```

```bash
GET /api/users
# → every row carries full_name and is_locked
```

The map is merged **before** policy filtering, so `hiddenAttributesForShow()` and `permittedAttributesForShow()` govern these values exactly as they govern columns.

:::warning Never override `asRhinoJson()`
Overriding `asRhinoJson()` and appending to `parent::asRhinoJson()` adds attributes **after** policy filtering, bypassing your blacklists and whitelists. Always use the declaration hooks on this page.
:::

## Opt-in record computed attributes

When a per-row value costs something — a relationship count, a signed URL, an external lookup — declaring it as always-on makes every list endpoint pay for it whether or not the client wants it. Declare it with `rhinoRecordComputedAttributes()` instead: **nothing is evaluated unless the client names it.**

```php title="app/Models/User.php"
class User extends RhinoModel
{
    public function rhinoRecordComputedAttributes(): array
    {
        return [
            'open_tickets_count' => fn ($record, $user) => $record->tickets()->whereNull('closed_at')->count(),
            'avatar_url' => fn ($record, $user) => Storage::url($record->avatar_path),
        ];
    }
}
```

Each entry is a callable receiving the **record** and the **current user**. Select them with `?computed_attributes=`:

```bash
# Nothing extra — byte-for-byte the response you got before you declared them
GET /api/users

# Each returned row now carries open_tickets_count
GET /api/users?computed_attributes=open_tickets_count

# Several at once
GET /api/users?computed_attributes=open_tickets_count,avatar_url

# Also works on show and trashed
GET /api/users/42?computed_attributes=avatar_url
GET /api/users/trashed?computed_attributes=avatar_url
```

The parameter is supported on the **read** endpoints — `index`, `show` and `trashed`. It composes with everything else: filters, search, sorting, `?scope=`, pagination, and includes.

An unknown name, or one the policy denies, is a **403** — never a silent omission, so a typo surfaces immediately:

```json
{ "message": "Computed attribute 'opne_tickets_count' is not allowed" }
```

:::note N+1 still applies
An opt-in attribute that queries the database runs once per returned row. That is the correct cost for genuinely per-row data — but if what you actually want is one number for the whole set, use a collection-level attribute instead.
:::

An entry can also declare [parameters](#attributes-with-parameters), so `tickets_since` takes the date from the client instead of being frozen into the declaration.

## Collection-level computed attributes

Declare aggregates with `rhinoCollectionComputedAttributes()` — a **static** method returning callables that receive the fully scoped query. Each one is evaluated **once per request**, no matter how many records exist.

```php title="app/Models/User.php"
class User extends RhinoModel
{
    public static function rhinoCollectionComputedAttributes(): array
    {
        return [
            'active_users_count' => fn ($query, $user) => $query->where('status', 'active')->count(),
            'blocked_users_count' => fn ($query, $user) => $query->where('status', 'blocked')->count(),
            'average_age' => fn ($query, $user) => $query->avg('age'),
        ];
    }
}
```

Declaring at least one attribute registers a dedicated endpoint for the model:

```bash
# Pick what you need
GET /api/users/computed?attributes=active_users_count,blocked_users_count
```

```json
{
  "data": {
    "active_users_count": 128,
    "blocked_users_count": 4
  }
}
```

Omitting `?attributes=` returns **every declared attribute the policy allows**, minus any that [declares a required parameter](#attributes-with-parameters) and so cannot be evaluated without one:

```bash
GET /api/users/computed
```

```json
{
  "data": {
    "active_users_count": 128,
    "blocked_users_count": 4,
    "average_age": 34.2
  }
}
```

### The query each callable receives

The query handed to your callable is the **same set `index` would have listed**, with these already applied:

- the organization scope (multi-tenancy)
- the model's global scopes
- the named scope from `?scope=`, or the model's `$defaultScope`
- `?filter[...]=`
- `?search=`

Sorting, sparse fieldsets, includes and pagination are deliberately **not** applied — they don't change an aggregate, and a `select` would break `count()`.

That means aggregates can describe exactly what the user is currently looking at:

```bash
# Counts across the whole (tenant-scoped) users table
GET /api/users/computed?attributes=active_users_count

# Counts restricted to one team — matches GET /api/users?filter[team_id]=3
GET /api/users/computed?attributes=active_users_count&filter[team_id]=3

# Counts within a search result
GET /api/users/computed?attributes=active_users_count&search=ada

# Counts within a named scope
GET /api/users/computed?attributes=active_users_count&scope=recentlyActive
```

Each attribute gets its **own clone** of the query, so one callable's `where()` can never leak into the next one's result.

:::danger Always start from the query you are handed
The framework guarantees the `$query` argument is already organization-scoped — including for models that reach their organization **through a relationship** rather than an `organization_id` column. That guarantee is void the moment your callable ignores it:

```php
// ❌ Bad — a fresh query. The org scope is gone; this counts EVERY tenant's rows.
'active_users_count' => fn ($query, $user) => User::where('status', 'active')->count(),

// ✅ Good — narrow the scoped query you were given
'active_users_count' => fn ($query, $user) => $query->where('status', 'active')->count(),
```

This is the same rule as [named scopes](./querying), and the same failure mode: silent cross-tenant disclosure that no test of yours will catch unless it seeds two organizations.
:::

### Authorization

The endpoint is gated by the model's `viewAny` policy method — the same gate as `index`. A user who cannot list users cannot read aggregates about them.

## Attributes with parameters

Both opt-in kinds take arguments the client fills in. Without them, anything that needs to vary has to be baked into its own attribute — `revenue_last_30_days`, `revenue_last_90_days`, `revenue_ytd` — or pushed out to the client as a filter over a column you then have to expose. Declare the parameter names alongside the callable instead, in the order the callable takes them:

```php title="app/Models/User.php"
class User extends RhinoModel
{
    public function rhinoRecordComputedAttributes(): array
    {
        return [
            // No parameters — unchanged
            'open_tickets_count' => fn ($record, $user) => $record->tickets()->whereNull('closed_at')->count(),

            'tickets_since' => [
                'params'   => ['since', 'status'],
                'optional' => ['status'],
                'using'    => fn ($record, $user, $since, $status = null) => $record->tickets()
                    ->where('created_at', '>=', $since)
                    ->when($status, fn ($q) => $q->where('status', $status))
                    ->count(),
            ],
        ];
    }

    public static function rhinoCollectionComputedAttributes(): array
    {
        return [
            'active_users_count' => fn ($query, $user) => $query->where('status', 'active')->count(),

            // One parameter
            'signups_since' => [
                'params' => ['since'],
                'using'  => fn ($query, $user, $since) => $query->where('created_at', '>=', $since)->count(),
            ],

            // Two, both required
            'revenue' => [
                'params' => ['from', 'to'],
                'using'  => fn ($query, $user, $from, $to) => $query
                    ->whereBetween('created_at', [$from, $to])
                    ->sum('total'),
            ],
        ];
    }
}
```

Arguments travel in the bracket form — `?attributes[...]` on `/computed`, `?computed_attributes[...]` on `index`, `show` and `trashed`. The three shapes are identical on both parameters:

```bash title="terminal"
# One parameter: a bare value binds to the single declared name
curl -g '/api/users/computed?attributes[signups_since]=2026-01-01'

# Several: every argument is named
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'

# An optional parameter may simply be left out
curl -g '/api/users?computed_attributes[tickets_since][since]=2026-01-01'

# A no-argument attribute joins the request with an empty value
curl -g '/api/users/computed?attributes[active_users_count]=&attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'
```

```json
{
  "data": {
    "active_users_count": 128,
    "revenue": 48210.5
  }
}
```

:::tip `curl` needs `-g`
`curl` treats `[` and `]` as glob characters. Pass `-g` (or `--globoff`) for any URL carrying the bracket form.
:::

The comma list and the bracket form cannot be mixed in one request, because they share a single query key. That is what the empty value on `active_users_count` above is for: it is how an attribute that takes no arguments joins a request that also carries one that does. On its own, `?attributes=active_users_count` is still the way to write it.

### How arguments bind

Arguments bind **by name**, never by position, so the order of the keys in the URL does not matter. A positional list (`?attributes[revenue][]=a`) is refused, and so is a bare value for an attribute with more than one parameter: two arguments are never guessed at from one value.

Bound values reach the callable as extra arguments **after the user**, in the order `params` declares them — `fn ($query, $user, $from, $to)` for a collection attribute, `fn ($record, $user, $since, $status = null)` for a record one. An optional parameter the client omitted arrives as `null`, except when it is the last one, which is simply not passed so the callable's own default applies.

:::warning Every `optional` parameter needs a default on the closure
Because trailing arguments are dropped rather than passed as `null`, an attribute whose parameters are all optional is called as `fn ($query, $user)` when the client sends none. A closure that declares those parameters without a PHP default throws `ArgumentCountError` — a **500**, not a 403:

```php
// ❌ Bad — requested with no arguments, this is called as fn($query, $user) → 500
'signups' => [
    'params'   => ['since'],
    'optional' => ['since'],
    'using'    => fn ($query, $user, $since) => $query->where('created_at', '>=', $since)->count(),
],

// ✅ Good — the closure's own default covers the omitted argument
'signups' => [
    'params'   => ['since'],
    'optional' => ['since'],
    'using'    => fn ($query, $user, $since = null) => $since
        ? $query->where('created_at', '>=', $since)->count()
        : $query->count(),
],
```

The rule is simply: every name listed in `optional` must have a default in the closure signature.
:::

The value `true` or `false` (in any case) reaches the callable as a real boolean, so a check inside the callable body cannot be fooled by the string `"false"`. Nothing else is coerced: `"5"` arrives as the string `"5"`.

An attribute that declares no parameters never receives client input. Sending any is a `403`, which means an attribute written without arguments can never be handed some later by a URL.

Unlike [named scopes](./querying#combining-scopes), there is **no cap** on how many attributes one request may name. Each attribute is evaluated against its own clone of the same query, so arguments change what each one computes and never how many rows the request touches.

### What counts as a parameter spec

A declared value is a parameter spec **only** when it is an array carrying at least one of `params`, `optional` or `using`. Everything else keeps the meaning it has always had — a callable is invoked, and any other value is serialized as a literal:

```php
'version' => 3,                  // literal — serialized as 3
'tags' => ['billing', 'beta'],   // literal — serialized as the list
'full_name' => fn ($record, $user) => $record->name,        // callable, no parameters
'revenue' => ['params' => ['from', 'to'], 'using' => fn (...) => ...],  // a spec
```

There is deliberately no string or bare-list shorthand here, unlike `$allowedScopes` — a list is already a valid literal declaration, and reading it as a parameter list would silently change what an existing model returns.

An `optional` entry that is not also in `params` is ignored. A spec with no `using` resolves to `null`.

:::warning `params`, `optional` and `using` are reserved
Inside a computed-attribute declaration, an array carrying any of those three keys is read as a parameter spec. A literal array of your own that happens to use one of them as a data key changes meaning — rename the key, or return the value from a callable instead.
:::

### Arguments are client input

:::danger Bind arguments into predicates — never into SQL or column names
A parameter value comes from the URL. Treat it exactly as you would a request body: as a **value** bound into a predicate, never as an identifier or a fragment of a statement.

```php
// ❌ Bad — the argument names the column. The client now chooses what the
//          query reads, including columns the policy hides from them.
'total' => [
    'params' => ['column'],
    'using'  => fn ($query, $user, $column) => $query->sum($column),
],

// ❌ Bad — the argument is interpolated into SQL. This is an injection point.
'revenue' => [
    'params' => ['from'],
    'using'  => fn ($query, $user, $from) => $query->whereRaw("created_at >= '{$from}'")->sum('total'),
],

// ✅ Good — the argument is a bound value in a predicate, and nothing else
'revenue' => [
    'params' => ['from', 'to'],
    'using'  => fn ($query, $user, $from, $to) => $query->whereBetween('created_at', [$from, $to])->sum('total'),
],
```

Arguments reach your callable **after** the organization scope, the global scopes, `?scope=`, `?filter[]=` and `?search=` have narrowed the query, so a bound predicate can only narrow further. A raw fragment or a client-chosen column steps outside that guarantee.
:::

### The 403 contract

An undeclared name and a name the policy denies produce the **same** message, so the endpoint never reveals which attributes a model declares:

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenu][from]=2026-01-01'
# → 403 { "message": "Computed attribute 'revenu' is not allowed" }
```

Argument mistakes are refused the same way, and these messages **do** name the parameter, because they are only ever reached after the attribute itself was allowed for this user:

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01'
# → 403 { "message": "Computed attribute 'revenue' requires parameter 'to'" }

curl -g '/api/users/computed?attributes[revenue][nope]=1'
# → 403 { "message": "Computed attribute 'revenue' does not accept parameter 'nope'" }

curl -g '/api/users/computed?attributes[revenue]=a,b'
# → 403 { "message": "Computed attribute 'revenue' requires named parameters" }

curl -g '/api/users/computed?attributes[active_users_count]=2026-01-01'
# → 403 { "message": "Computed attribute 'active_users_count' does not accept arguments" }
```

A parameter that is structurally impossible to read as a selection at all — a positional list such as `?attributes[]=x` — is refused before any name is looked at:

```bash title="terminal"
curl -g '/api/users/computed?attributes[]=revenue'
# → 403 { "message": "Computed attributes are not allowed" }
```

The declared-name check and the policy check both run **before** any argument is bound. An argument error is therefore only ever visible for an attribute the caller was already allowed to name, and the specific messages leak nothing about the ones they were not.

## Policy control

Both new kinds go through the **same gate as database columns**:

```php title="app/Policies/UserPolicy.php"
class UserPolicy extends ResourcePolicy
{
    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*']; // everything, including every computed attribute
        }

        // Non-admins may read these columns AND these computed attributes
        return ['id', 'name', 'email', 'avatar_url', 'active_users_count'];
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return [];
        }

        return ['blocked_users_count']; // never visible to non-admins
    }
}
```

Rules:

- `permittedAttributesForShow()` returning the default `['*']` allows every declared attribute.
- Any other return value is a **whitelist** — a computed attribute must be listed by name to be readable.
- `hiddenAttributesForShow()` is a blacklist and always wins.

A name that is not declared and a name the policy denies produce the **same 403**, so the endpoint never reveals which attributes a model declares.

When `?attributes=` is omitted, denied attributes are simply left out of the response rather than erroring.

## Disabling the endpoint

Add `'computed'` to `$exceptActions` to keep the declarations but drop the route:

```php
public static array $exceptActions = ['computed'];
```

## From the React client

```tsx
import { useModelIndex, useModelComputedAttributes } from '@rhino-dev/rhino-react';

function UserDashboard() {
  // One request, one evaluation per attribute
  const { data: stats } = useModelComputedAttributes('users', {
    attributes: ['active_users_count', 'blocked_users_count'],
  });

  // Per-row opt-in attributes
  const { data: users } = useModelIndex('users', {
    computedAttributes: ['avatar_url'],
  });

  return <h2>{stats?.active_users_count} active</h2>;
}
```

See [React — Querying](../react/querying) for the full client API.

## Upgrading an existing app

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

## Backward compatibility

This feature is entirely additive:

- Existing `rhinoComputedAttributes()` declarations behave exactly as before.
- `index`/`show`/`trashed` responses are unchanged unless a client sends `?computed_attributes=`.
- The `/computed` route is registered **only** for models that declare collection-level attributes, so `GET /api/users/computed` on a model without them still resolves to `show` as it always did.
- The comma list — `?attributes=a,b` and `?computed_attributes=a,b` — is unchanged. Each name is read as "no arguments", which is exactly what an attribute without parameters expects.
- A declaration that is not an array carrying `params`, `optional` or `using` keeps its existing meaning: callables are invoked, and every other value is serialized as a literal.

A bare `GET /{resource}/computed` returns every attribute the policy allows, **minus any that declares a required parameter** — those are skipped silently rather than returning a 403:

```bash title="terminal"
GET /api/users/computed
```

```json
{
  "data": {
    "active_users_count": 128,
    "blocked_users_count": 4,
    "average_age": 34.2
  }
}
```

`revenue` and `signups_since` are absent because neither can be evaluated without arguments. An attribute whose parameters are **all** optional is still evaluated, with none supplied. This is what keeps a client that asks for everything working after you add a parameterised attribute to a model.

:::warning Route-key collision
For a model that declares collection attributes, the literal path segment `computed` is matched before `{id}`. If your model uses a [route key](./models#route-key) whose values could literally be `"computed"`, that record becomes unreachable by URL — the same caveat that already applies to `trashed`.
:::

## Related

- [Models](./models) — declaring model behavior
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Best Practices — Models & Queries](./best-practices/models-and-queries) — when *not* to write a controller
