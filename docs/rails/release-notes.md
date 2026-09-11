---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Rails, newest first.

## 4.8.0

**Named scopes take arguments.** A scope used to be a name and nothing else, so anything the client
needed to vary had to be expressed as a filter — which meant exposing the column and hoping the
client composed the predicate correctly. A scope can now declare parameters the client fills in:

```ruby
rhino_scopes :archived,
             since:  { params: [:date] },
             window: { params: %i[from to] },
             titled: { params: %i[title status], optional: [:status] },
             mine:   { params: [:status], with: ->(rel, user, status) { ... } }
```

```bash
GET /api/routes?scope[since]=2026-01-01
GET /api/routes?scope[window][from]=2026-01-01&scope[window][to]=2026-02-01
```

Arguments bind by name and reach the scope in declared order. `?scope=name` still works exactly as
before, and a scope that declares no parameters still never receives client input: sending any is a
403. A `Rhino::ResourceScope` subclass receives them as extra arguments to `apply`.

Up to three scopes may be combined in the bracket form, applied in the order the URL lists them. The
two forms cannot be mixed in one request, since they share the `scope` query key — write a
no-argument scope as `?scope[archived]=` when combining it with one that takes arguments.

**Policies choose which scopes a user may select.** The new `permitted_scopes(user)` returns `["*"]`
by default, so nothing changes until you override it. A denied scope and an undeclared one return the
same message, so the endpoint never reveals which scopes a model has.

**Attribute permissions now gate filters, sorts and search.** This closes a real leak. Hiding an
attribute in a policy only affected serialization, so a hidden column stayed usable as a query
predicate: `?filter[salary]=300000` never printed a salary but told the caller whose salary it was,
and `?sort=-salary` leaked the whole ordering. Both now return 403. `?search=` names a term rather
than a column, so it simply skips the columns this user may not see, and returns nothing when all of
them are hidden. A column the model never allowlisted is still ignored rather than refused.

**Sorting is deny by default.** `?sort=` used to accept **any** column on a model that declared no
`rhino_sorts`, which is how a hidden column could be ordered by without ever being allowlisted. An
empty sort list now allows nothing, matching Laravel and NestJS. A model that relied on the old
behavior must declare `rhino_sorts`. The declared `rhino_default_sort` is unaffected.

## 4.7.3

**Jobs and rake tasks can name their route group.** 4.7.2 made the tenant boundary a property of the
route group, which left code with **no request** unable to reach a non-tenant group at all: an Active
Job, a rake task or the console publishes no group, so `Rhino.query` always failed closed there. The
only way out was passing an explicit organization — which a back-office job that legitimately spans
every tenant does not have.

Such code now says which group it is acting as:

```ruby
# The :admin group is declared `tenant: false`, so this spans every organization.
Rhino.in_route_group(:admin).query(Task).where(status: "open").count

# With an operator, so the model's user-aware scopes still narrow the rows:
Rhino.for_user(operator).in_route_group(:admin).query(Task)

# Ambient calls inside the block see the group too:
Rhino.in_route_group(:admin).run { Rhino.query(Task).count }
```

**It states a context; it is not a bypass.** The named group's own `tenant: false` in the initializer
is what lifts the boundary, so naming a tenant group or one that is not configured still raises
`Rhino::MissingTenantContext`, and so does a `for_user` that names no group. An explicit
`in_organization(org)` still scopes in any group, and the context is restored once the relation is
built (and after `run`), so nothing leaks into a later ambient query in a long-lived worker.

`Rhino::Context.with` takes an optional `route_group:` and never installs a nil one, so an explicit
context can only **add** a group, never erase the one a request is already served by —
`Rhino.for_user(u).query(M)` inside a non-tenant request keeps that request's group.
`PendingScopedContext` also gains `#for_user`, so the builder reads the same in either order.

### How to update

```ruby title="Gemfile"
gem "rhino-rails", "~> 4.7.3"
```

```bash
bundle update rhino-rails
```

Nothing to change. `in_route_group` is additive, and every existing call behaves exactly as it did in
4.7.2.

1. **In a back-office job or rake task**, replace a query that could not be written before with
   `Rhino.in_route_group(:<group>).query(...)`. The group must already be declared `tenant: false` —
   see [Route Groups — Tenant Boundary](./route-groups#tenant-boundary).
2. **Jobs scoped to one tenant** keep using `Rhino.for_user(user).in_organization(org)`; that is still
   the right call and is unchanged.

See [Multi-Tenancy — Naming the group where no request resolves one](./multi-tenancy#naming-the-group-where-no-request-resolves-one).

## 4.7.2

**A tenant boundary is a property of a route group, not of the app.** `Rhino.query` fails closed: an
organization-scopable model queried with no organization raises `Rhino::MissingTenantContext` rather
than returning every tenant's rows. That is right for a tenant app and wrong for a back office, where
operators are *meant* to see every organization — and until now there was no way to say so, which
pushed exactly the code that most needs scoping back onto raw model queries.

The boundary is now declared per route group:

```ruby title="config/initializers/rhino.rb"
config.route_group :tenant,
  prefix: ":organization",
  middleware: [Rhino::Middleware::ResolveOrganizationFromRoute],
  models: :all

config.route_group :admin,
  prefix: "admin",
  tenant: false,   # no tenant boundary: queries here span every organization
  models: []
```

In a `tenant: false` group, `Rhino.query` and `Rhino.scoped_query` apply no organization filter and no
longer raise. The `:tenant` group in the same app is untouched and keeps failing closed — which is the
point of putting the switch on the group rather than on the app.

**Custom controllers publish their group.** The resolver reads it from the request's `route_group` —
the same value memberships and policies already use. Rhino's own controllers publish it; a controller
you write includes the new concern:

```ruby title="app/controllers/admin_dashboard_controller.rb"
class AdminDashboardController < ApplicationController
  include Rhino::RouteGroupContext
  rhino_route_group :admin

  def summary
    render json: { tasks_total: Rhino.query(Task).count } # every organization
  end
end
```

Without an explicit `rhino_route_group`, the concern falls back to the route's own
`defaults: { route_group: "admin" }`. Declare non-tenant routes **before** any `:organization`-prefixed
route, or `/api/admin/dashboard` is matched as the tenant route with `:organization = "admin"`.

**Nothing else is relaxed.** Declaring a group non-tenant removes only the organization filter, and
only for that group. Model scopes, whitelisted named scopes, policies, and an explicit
`in_organization(org)` all behave exactly as before, as does CRUD through the Rhino controllers.
Anything not provably a non-tenant group still fails closed: an unknown group, a request with no
group, and any code outside a request at all — an Active Job or rake task resolves no group, so it
must still pass the tenant explicitly.

`Rhino::MissingTenantContext` now carries a full message naming both ways out, instead of just the
model name.

### How to update

```ruby title="Gemfile"
gem "rhino-rails", "~> 4.7.3"
```

```bash
bundle update rhino-rails
```

Nothing else is required — every group is a tenant group by default, so fail-closed behavior is
unchanged.

1. **For a back office**, declare its group `tenant: false` and `include Rhino::RouteGroupContext`
   (plus `rhino_route_group :<group>`) in the controllers that serve it.
2. **If you match on the raised message**, note that it is now a sentence rather than the bare model
   name. `rescue Rhino::MissingTenantContext` is unaffected.
3. No migration, no initializer re-generation.

See [Multi-Tenancy — Route Groups Without a Tenant Boundary](./multi-tenancy#route-groups-without-a-tenant-boundary),
[Route Groups — Tenant Boundary](./route-groups#tenant-boundary), and
[Custom Controllers — Fail Closed](./custom-controllers#fail-closed).

## 4.7.0

**Computed attributes, without the per-row cost.** Two new declaration hooks make derived values and aggregates first-class, so counts and expensive per-row values no longer need a hand-written controller.

**Collection-level aggregates.** Declare `self.rhino_collection_computed_attributes` on a model and Rhino registers `GET /api/{resource}/computed` for it. Each callable is evaluated **once per request** over the fully scoped relation — not once per row:

```ruby title="app/models/user.rb"
class User < Rhino::RhinoModel
  def self.rhino_collection_computed_attributes
    {
      "active_users_count" => ->(scope, _user) { scope.where(status: "active").count },
      "blocked_users_count" => ->(scope, _user) { scope.where(status: "blocked").count }
    }
  end
end
```

```bash
GET /api/users/computed?attributes=active_users_count,blocked_users_count
# → { "data": { "active_users_count": 128, "blocked_users_count": 4 } }
```

The relation handed to each callable already has the organization scope, default scopes, `?scope=`, `?filter[]=` and `?search=` applied — so aggregates describe exactly the set `index` would have listed. Omitting `?attributes=` returns every declared attribute the policy allows. The endpoint is gated by `index?`.

**Opt-in record attributes.** Declare `rhino_record_computed_attributes` for per-row values that cost a query. Nothing is evaluated unless the client asks for it by name:

```ruby title="app/models/user.rb"
def rhino_record_computed_attributes
  {
    "open_tickets_count" => ->(record, _user) { record.tickets.where(closed_at: nil).count }
  }
end
```

```bash
GET /api/users?computed_attributes=open_tickets_count
GET /api/users/42?computed_attributes=open_tickets_count
GET /api/users/trashed?computed_attributes=open_tickets_count
```

- Both kinds go through the **same policy gate as columns** — `permitted_attributes_for_show` whitelists, `hidden_attributes_for_show` blacklists.
- An undeclared name and a policy-denied name return the same 403, so the endpoint never reveals which attributes a model declares.
- Lambdas of arity 0, 1 or 2 are all accepted.
- `rhino_except_actions :computed` drops the route.
- The Postman export gains a **Computed Attributes** folder plus `?computed_attributes=` examples on Index and Show.

See [Computed Attributes](./computed-attributes) for the full reference.

Fully backward compatible — existing `rhino_computed_attributes` behaves exactly as before, read responses are unchanged unless a client sends `?computed_attributes=`, and the `/computed` route is registered only for models that declare collection attributes.

### How to update

```bash
bundle update rhino-rails
```

Routes are registered from inside the engine, so `/computed` is served as soon as a model declares
collection attributes — there is nothing to re-generate.

## 4.6.1

**Security — cross-tenant isolation on member endpoints.** `show`, `update`, `destroy`, `restore`, and force-delete now apply the same organization scoping as `index`, including auto-detected indirect chains (e.g. task → project → organization). Previously, models without a direct `organization_id` column could be fetched or mutated cross-tenant by id (or route key), and `restore`/force-delete were not organization-scoped at all. Upgrading is strongly recommended for multi-tenant apps.

Also fixed in the shared scoping module:

- Models using `for_organization` no longer lose the incoming relation when scoped — `trashed` listings and discarded-record lookups now correctly combine the soft-delete filter with the organization filter.
- Multi-hop auto-detected scoping paths (e.g. `comment → task → project`) no longer raise `ActiveRecord::ConfigurationError`.

Fully backward compatible for single-tenant apps and requests without an organization context — those lookups are unchanged.

### How to update

```bash
bundle update rhino-rails
```

Nothing to configure — the fix applies to every member endpoint immediately. Multi-tenant apps should
upgrade promptly, and re-check any test that asserted a cross-tenant member lookup succeeded.

## 4.6.0

**Configurable route key.** Member routes (`show`, `update`, `destroy`, `restore`, force-delete) can now match the `:id` URL segment against any unique column instead of the primary key — set `rhino_route_key` on the model, or the global `config.route_key` in the initializer:

```ruby title="app/models/job.rb"
class Job < Rhino::RhinoModel
  rhino_route_key :hash_id  # GET /api/jobs/{hash_id}
end
```

Resolution order is `rhino_route_key_column || Rhino.config.route_key || primary_key`. A configured column that does not exist raises a clear `ArgumentError` on first use. See [Models — Route Key](./models#route-key) for full details and caveats.

- The route-key column and `id` are now always kept in serialized output, regardless of policy whitelists, and sparse fieldsets (`?fields[]`) force-include the route key so responses stay routable.
- [Blueprint](./blueprint) supports a per-model `options: { route_key: ... }` that emits `rhino_route_key` in the generated model and uses route-key URLs in generated specs. The validator errors on unknown columns and warns when the column is not declared `unique`.

Fully backward compatible — defaults are unchanged; nothing changes unless a route key is configured.

### How to update

```bash
bundle update rhino-rails
```

Then set `rhino_route_key` on the models that need it, or the global `config.route_key`. Clients must
switch to the new identifier in URLs at the same time — the `:id` segment stops matching the primary
key for those models. No migration is required beyond a **unique index** on the chosen column.

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-rails/releases) for the history of earlier versions.
