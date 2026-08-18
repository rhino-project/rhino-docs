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

All three are subject to the same policy filtering as database columns. None of them require a custom controller.

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

Omitting `?attributes=` returns **every declared attribute the policy allows**:

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

:::warning Route-key collision
For a model that declares collection attributes, the literal path segment `computed` is matched before `{id}`. If your model uses a [route key](./models#route-key) whose values could literally be `"computed"`, that record becomes unreachable by URL — the same caveat that already applies to `trashed`.
:::

## Related

- [Models](./models) — declaring model behavior
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Best Practices — Models & Queries](./best-practices/models-and-queries) — when *not* to write a controller
