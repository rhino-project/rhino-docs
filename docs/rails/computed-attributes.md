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

All three are subject to the same policy filtering as database columns. None of them require a custom controller. The two opt-in kinds can also declare [parameters the client fills in](#attributes-with-parameters), so one declaration covers a date window, a status or a currency rather than a family of near-identical attributes.

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

An entry can also declare [parameters](#attributes-with-parameters), so `tickets_since` takes the date from the client instead of being frozen into the declaration.

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

## Attributes with parameters

Both opt-in kinds take arguments the client fills in. Without them, anything that needs to vary has to be baked into its own attribute — `revenue_last_30_days`, `revenue_last_90_days`, `revenue_ytd` — or pushed out to the client as a filter over a column you then have to expose. Declare the parameter names alongside the lambda, in the order the lambda takes them, with `with:`:

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  def rhino_record_computed_attributes
    {
      # No parameters — unchanged
      "open_tickets_count" => ->(record, _user) { record.tickets.where(closed_at: nil).count },

      "tickets_since" => {
        params: %i[since status],
        optional: [:status],
        with: lambda { |record, _user, since, status = nil|
          rel = record.tickets.where("created_at >= ?", since)
          status ? rel.where(status: status).count : rel.count
        }
      }
    }
  end

  def self.rhino_collection_computed_attributes
    {
      "active_users_count" => ->(scope, _user) { scope.where(status: "active").count },

      # One parameter
      "signups_since" => {
        params: [:since],
        with: ->(scope, _user, since) { scope.where("created_at >= ?", since).count }
      },

      # Two, both required
      "revenue" => {
        params: %i[from to],
        with: ->(scope, _user, from, to) { scope.where(created_at: from..to).sum(:total) }
      }
    }
  end
end
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

Bound values reach the lambda as extra arguments **after the user**, in the order `params` declares them — `->(scope, user, from, to)` for a collection attribute, `->(record, user, since, status = nil)` for a record one. An optional parameter the client omitted arrives as `nil`, except when it is the last one, which is simply not passed so the lambda's own default applies.

:::warning Parameter names are matched verbatim
Unlike scope parameters, a computed-attribute parameter name is **not** underscored on its way in — it is matched exactly as declared. Declare `params: %i[from_date]` and the client must send `attributes[revenue][from_date]=`; `[fromDate]` is refused as a parameter the attribute does not accept.
:::

The value `true` or `false` (in any case) reaches the lambda as a real boolean, so a check inside the lambda body cannot be fooled by the string `"false"`. Nothing else is coerced: `"5"` arrives as the string `"5"`.

An attribute that declares no parameters never receives client input. Sending any is a `403`, which means an attribute written without arguments can never be handed some later by a URL.

Unlike [named scopes](./querying#combining-scopes), there is **no cap** on how many attributes one request may name. Arguments change what each attribute computes, never how many rows the request touches.

:::warning Every `optional` parameter needs a default on the lambda
An entry that declares **any** parameter is always invoked as `entry.call(scope, user, *args)` — the declaration is the contract, and arity is never inspected. Because trailing arguments are dropped rather than passed as `nil`, an attribute whose parameters are all optional is called as `entry.call(scope, user)` when the client sends none, and Ruby lambdas check arity strictly:

```ruby
# ❌ Bad — requested with no arguments, this is called with two → ArgumentError → 500
"signups" => {
  params: [:since], optional: [:since],
  with: ->(scope, _user, since) { scope.where("created_at >= ?", since).count }
}

# ✅ Good — the lambda's own default covers the omitted argument
"signups" => {
  params: [:since], optional: [:since],
  with: ->(scope, _user, since = nil) {
    since ? scope.where("created_at >= ?", since).count : scope.count
  }
}
```

The rule is simply: every name listed in `optional` must have a default in the lambda signature. An entry that declares no parameters at all keeps the tolerant arity-0/1/2 handling it has always had.
:::

### What counts as a parameter spec

A declared value is a parameter spec **only** when it is a hash carrying at least one of `params`, `optional` or `with` — in symbol or string form. Everything else keeps the meaning it has always had — a callable is invoked, and every other value is serialized as a literal:

```ruby
"version" => 3,                       # literal — serialized as 3
"tags" => %w[billing beta],           # literal — serialized as the list
"full_name" => ->(record, _user) { record.name },              # callable, no parameters
"revenue" => { params: %i[from to], with: ->(...) { ... } }    # a spec
```

There is deliberately no symbol or bare-list shorthand here, unlike `rhino_scopes` — a list is already a valid literal declaration, and reading it as a parameter list would silently change what an existing model returns.

An `optional` entry that is not also in `params` is ignored. A spec with no `with:` resolves to `nil`.

:::warning `params`, `optional` and `with` are reserved
Inside a computed-attribute declaration, a hash carrying any of those three keys is read as a parameter spec. A literal hash of your own that happens to use one of them as a data key changes meaning — rename the key, or return the value from a lambda instead.
:::

### Arguments are client input

:::danger Bind arguments into predicates — never into SQL
A parameter value comes from the URL. Treat it exactly as you would params in a controller: as a **value** bound into a predicate, never as an identifier or a fragment of a statement.

```ruby
# ❌ Bad — the argument names the column. The client now chooses what the
#          query reads, including columns the policy hides from them.
"total" => {
  params: [:column],
  with: ->(scope, _user, column) { scope.sum(column) }
}

# ❌ Bad — the argument is interpolated into SQL. This is an injection point.
"revenue" => {
  params: [:from],
  with: ->(scope, _user, from) { scope.where("created_at >= '#{from}'").sum(:total) }
}

# ✅ Good — the argument is a bound value in a predicate, and nothing else
"revenue" => {
  params: %i[from to],
  with: ->(scope, _user, from, to) { scope.where(created_at: from..to).sum(:total) }
}
```

Arguments reach your lambda **after** the organization scope, the model's default scopes, `?scope=`, `?filter[]=` and `?search=` have narrowed the relation, so a bound predicate can only narrow further. A raw fragment or a client-chosen column steps outside that guarantee.
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

:::note Mixing the two forms is a 400, not a 403
Rack refuses `?attributes=a&attributes[b]=c` — one key used as both a string and a hash — before the request reaches Rhino, so that combination returns a `400` rather than either of the messages above.
:::

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
- The comma list — `?attributes=a,b` and `?computed_attributes=a,b` — is unchanged. Each name is read as "no arguments", which is exactly what an attribute without parameters expects.
- A declaration that is not a hash carrying `params`, `optional` or `with` keeps its existing meaning: callables are invoked through the same tolerant arity handling as before, and every other value is serialized as a literal.

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
For a model that declares collection attributes, the literal path segment `computed` is matched before `:id`. If your model uses a [route key](./models#route-key) whose values could literally be `"computed"`, that record becomes unreachable by URL — the same caveat that already applies to `trashed`.
:::

## Related

- [Models](./models) — declaring model behavior
- [Querying](./querying) — filters, scopes and search, which narrow aggregates
- [Policies](./policies) — attribute-level permissions
- [Custom Controllers](./custom-controllers) — when you genuinely need one
