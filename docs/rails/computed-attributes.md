---
sidebar_position: 5
title: Computed Attributes
---

# Computed Attributes

Computed attributes are values your API returns that are **not database columns** — a formatted name, a derived flag, a count. Rhino has three kinds, and picking the right one is almost entirely a performance decision:

| Kind | Declared with | Evaluated | Use it for |
|---|---|---|---|
| **Always-on, per record** | `rhino_computed_attributes` | On every read, for every row | Cheap values derived from columns already loaded |
| **Opt-in, per record** | `rhino_record_computed_attributes` | Only when the client sends `?computed_attributes=` | Per-row values that cost a query or real work |
| **Collection-level** | `self.rhino_collection_computed_attributes` | Once per request, via `GET /{resource}/computed` | Aggregates over the whole collection — counts, sums, averages |

All three are subject to the same policy filtering as database columns. None of them require a custom controller.

:::tip Counting rows? You want the collection-level kind.
A "how many users are active" number is **one aggregate over the collection**, not a value that belongs on each row. Declaring it as a per-record attribute would run the count once per returned record — 25 identical `COUNT(*)` queries for a 25-row page. See [Collection-level computed attributes](#collection-level-computed-attributes).
:::

## Always-on computed attributes

`rhino_computed_attributes` returns a hash that is merged into **every** serialized record, on every endpoint. There is no way for a client to opt out, so only put cheap, column-derived values here.

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  def rhino_computed_attributes
    {
      "full_name" => "#{first_name} #{last_name}".strip,
      "is_locked" => locked_at.present?
    }
  end
end
```

```bash
GET /api/users
# → every row carries full_name and is_locked
```

The hash is merged **before** policy filtering, so `hidden_attributes_for_show` and `permitted_attributes_for_show` govern these values exactly as they govern columns.

:::warning Never override `as_rhino_json`
Overriding `as_rhino_json` and merging onto `super` adds attributes **after** policy filtering, bypassing your blacklists and whitelists. Always use the declaration hooks on this page.
:::

## Opt-in record computed attributes

When a per-row value costs something — a relationship count, a signed URL, an external lookup — declaring it as always-on makes every list endpoint pay for it whether or not the client wants it. Declare it with `rhino_record_computed_attributes` instead: **nothing is evaluated unless the client names it.**

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  def rhino_record_computed_attributes
    {
      "open_tickets_count" => ->(record, _user) { record.tickets.where(closed_at: nil).count },
      "avatar_url" => ->(record, _user) { record.avatar.url }
    }
  end
end
```

Each entry is a callable receiving the **record** and the **current user**. Lambdas of arity 0, 1 or 2 are all accepted. Select them with `?computed_attributes=`:

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

The parameter is supported on the **read** actions — `index`, `show` and `trashed`. It composes with everything else: filters, search, sorting, `?scope=`, pagination, and includes.

An unknown name, or one the policy denies, is a **403** — never a silent omission, so a typo surfaces immediately:

```json
{ "message": "Computed attribute 'opne_tickets_count' is not allowed" }
```

:::note N+1 still applies
An opt-in attribute that queries the database runs once per returned row. That is the correct cost for genuinely per-row data — but if what you actually want is one number for the whole set, use a collection-level attribute instead.
:::

## Collection-level computed attributes

Declare aggregates with `self.rhino_collection_computed_attributes` — a **class** method returning callables that receive the fully scoped relation. Each one is evaluated **once per request**, no matter how many records exist.

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  def self.rhino_collection_computed_attributes
    {
      "active_users_count" => ->(scope, _user) { scope.where(status: "active").count },
      "blocked_users_count" => ->(scope, _user) { scope.where(status: "blocked").count },
      "average_age" => ->(scope, _user) { scope.average(:age) }
    }
  end
end
```

Declaring at least one attribute registers a dedicated route for the model:

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

### The relation each callable receives

The relation handed to your callable is the **same set `index` would have listed**, with these already applied:

- the organization scope (multi-tenancy)
- the model's default scopes
- the named scope from `?scope=`, or the model's `rhino_default_scope`
- `?filter[...]=`
- `?search=`

Sorting, sparse fieldsets, includes and pagination are deliberately **not** applied — they don't change an aggregate, and a `select` would break `count`.

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

ActiveRecord relations are immutable under chaining, so one callable's `where` can never leak into the next one's result.

:::danger Always start from the relation you are handed
The framework guarantees the `scope` argument is already organization-scoped — including for models that reach their organization **through a relationship** rather than an `organization_id` column. That guarantee is void the moment your callable ignores it:

```ruby
# ❌ Bad — a fresh relation. The org scope is gone; this counts EVERY tenant's rows.
"active_users_count" => ->(_scope, _user) { User.where(status: "active").count }

# ✅ Good — narrow the scoped relation you were given
"active_users_count" => ->(scope, _user) { scope.where(status: "active").count }
```

This is the same rule as [named scopes](./querying), and the same failure mode: silent cross-tenant disclosure that no test of yours will catch unless it seeds two organizations.
:::

### Authorization

The endpoint is gated by the model's `index?` policy method — the same gate as `index`. A user who cannot list users cannot read aggregates about them.

## Policy control

Both new kinds go through the **same gate as database columns**:

```ruby title="app/policies/user_policy.rb"
class UserPolicy < Rhino::ResourcePolicy
  def permitted_attributes_for_show(user)
    return ["*"] if has_role?(user, "admin") # everything, including every computed attribute

    # Non-admins may read these columns AND these computed attributes
    ["id", "name", "email", "avatar_url", "active_users_count"]
  end

  def hidden_attributes_for_show(user)
    return [] if has_role?(user, "admin")

    ["blocked_users_count"] # never visible to non-admins
  end
end
```

Rules:

- `permitted_attributes_for_show` returning the default `["*"]` allows every declared attribute.
- Any other return value is a **whitelist** — a computed attribute must be listed by name to be readable.
- `hidden_attributes_for_show` is a blacklist and always wins.

A name that is not declared and a name the policy denies produce the **same 403**, so the endpoint never reveals which attributes a model declares.

When `?attributes=` is omitted, denied attributes are simply left out of the response rather than erroring.

## Disabling the endpoint

Use `rhino_except_actions` to keep the declarations but drop the route:

```ruby
rhino_except_actions :computed
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

## Backward compatibility

This feature is entirely additive:

- Existing `rhino_computed_attributes` declarations behave exactly as before.
- `index`/`show`/`trashed` responses are unchanged unless a client sends `?computed_attributes=`.
- The `/computed` route is registered **only** for models that declare collection-level attributes, so `GET /api/users/computed` on a model without them still resolves to `show` as it always did.

:::warning Route-key collision
For a model that declares collection attributes, the literal path segment `computed` is matched before `:id`. If your model uses a [route key](./models#route-key) whose values could literally be `"computed"`, that record becomes unreachable by URL — the same caveat that already applies to `trashed`.
:::

## Related

- [Models](./models) — declaring model behavior
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Custom Controllers](./custom-controllers) — when you genuinely need one
