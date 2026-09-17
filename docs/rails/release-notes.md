---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Rails, newest first.

## 4.10.0

**Validation moves off the model and into a request class that can see the whole request.** Model-level
ActiveModel validations ran against a blank `Model.new`, which is why every validator needed
`allow_nil: true` and why nothing conditional could be expressed: the validations had no access to the
current user, the organization, the route group or the record being updated. A model may now declare
`{Model}StoreRequest` and `{Model}UpdateRequest` in `app/requests/`, each owning the entire shape
contract for one action.

```ruby title="app/requests/post_store_request.rb"
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string
  attribute :status, :string
  attribute :category_id, :integer

  validates :title, presence: true, length: { maximum: 255 }
  validates :category_id, presence: true, numericality: { only_integer: true }
  validates :status, inclusion: { in: %w[draft] },
            if: -> { user&.role_slug_for_validation(organization) != "admin" }

  def authorize?
    route_group != "public"
  end

  def prepare(input)
    input.merge("title" => input["title"].to_s.strip)
  end
end
```

```bash title="terminal"
curl -X POST '/api/acme/posts' -d '{"title":"","status":"published","category_id":4}'
```

```json
{ "errors": { "title": ["can't be blank"], "status": ["is not included in the list"] } }
```

- **`app/requests/` needs no wiring.** Zeitwerk autoloads every `app/*` directory, so there is no
  initializer to edit and no `eager_load_paths` entry to add.
- **Discovery is per action.** An explicit `config.model :posts, "Post", store_request: "CreatePost"`
  wins, then the convention `{Model}StoreRequest` / `{Model}UpdateRequest`, then the model-level
  validations. A model may declare only a store class. Registrations are **class name strings**, and
  Rhino re-resolves them on every request, so a dev-mode Zeitwerk reload never hands back an unloaded
  constant.
- **Six context readers** — `user`, `organization`, `route_group`, `action`, `record`, `input` — are in
  scope for `authorize?`, `prepare` and every validation. `record` is the pre-update row, from the
  organization-scoped query the update already performed.
- **There is no `rules` method and no `messages` method.** Rules stay ordinary ActiveModel
  declarations; dynamic rules use `validate :method_name` or `if: -> { … }`, and messages use the
  standard `message:` option or i18n.
- **`prepare` runs after the policy's forbidden-field check and before `authorize?`**, so it can never
  launder a denied field past the policy, and `authorize?` always sees normalized input.
- **`authorize?` returning false is a `403` byte-identical to a policy denial** —
  `{"message":"This action is unauthorized."}`, hard-coded.
- **The declared attributes present in the prepared input are the write payload**, with their cast
  values. A field with no `attribute` is dropped, not persisted. Rhino does **not** intersect them with
  `permitted_attributes_for_create/update`, and does **not** relax an update to the keys the client
  sent — an update class declares `allow_nil: true` itself.
- **The cross-tenant FK check runs on top of the request class's own validations**, through the same
  direct-and-indirect implementation the model-level path uses, merged into the same `422`. It reads
  the write payload, so an undeclared foreign key is neither written nor checked.
- **Nested operations use the same classes**, per operation, with `record` resolved by an
  organization-scoped, non-failing lookup so today's `403` / `404` ordering does not shift.
- **Model-level `validates` still run at save time**, inside `create!` / `update!`. A model rule the
  request class does not reproduce is not consulted while the rules run, but it can still refuse the
  write; the resulting `ActiveRecord::RecordInvalid` is rescued and rendered as the standard `422`
  `{"errors": {field: [messages]}}`, built from the record's own errors. Inside `POST /nested` it rolls
  the transaction back and keeps the nested envelope,
  `{"message":"Validation failed.","errors":{"operations.0.data.title":[…]}}`. The rescue is confined to
  the request-class branches — the legacy path ran those rules up front and is unchanged. Keep a request
  class's rules a superset of the model's, or move them off the model. See [Validation](./validation).
- **A misregistered request class raises.** A `store_request:` / `update_request:` naming a constant
  that does not exist, or that does not inherit from `Rhino::ResourceRequest`, raises
  `Rhino::ConfigurationError`; a silently ignored validation class is a security hole. A *convention*
  name with the wrong superclass is logged and ignored instead.
- **`rails rhino:generate` gained a fourth menu entry, `request`**, which asks for store, update or
  both and writes a fully commented template into `app/requests/`.
- **Blueprint still generates model-level `validates`** into new models. Generated code keeps working
  because the model-level path is still supported.

Full documentation: [Validation](./validation).

### Fixes

- **SECURITY — `POST /nested` did not tenant-scope the record an update operation targets.** See below.

:::danger Security fix: cross-tenant writes through `POST /nested`
`authorize_nested_operation` resolved an update operation's target with a bare
`op_model_class.find(operation["id"])` — no organization scoping at all. An authenticated member of one
organization could therefore update another organization's records by id through `POST /nested`.

The only models that escaped were those including `Rhino::BelongsToOrganization`, and then only by
accident: that concern's `default_scope` narrowed the `find` for them. Everything else was writable
cross-tenant — a plain `organization_id` column, a custom `for_organization` scope, and every indirect
`belongs_to` chain (`task → project → organization`). The member `PUT` endpoint was never affected;
`find_record` has always scoped.

The lookup now goes through the same mechanism the member endpoints use:

```ruby
# ❌ Before — unscoped; org B could name org A's id
record = op_model_class.find(operation["id"])

# ✅ After — the same lenient org scope find_record and index apply
record = Rhino::ScopesToOrganization.scope_to_organization(
  op_model_class.all, op_model_class, current_organization
).find(operation["id"])
```

A cross-organization id now raises `ActiveRecord::RecordNotFound` and is indistinguishable from an id
that does not exist. A model with no organization mechanism stays reachable, and a request with no
organization context is unscoped, exactly as before.

**This is present in 4.9.0 and earlier — upgrade if you expose `POST /nested` at all.** Nested supports
only `create` and `update` operations, so no data could be deleted this way.

One thing that limited real-world exposure: the tenant nested route currently only resolves when the
request also carries `?model_slug=`, because the route sets no `model_slug` default and the controller's
`set_model_class` runs for every action. Without it the endpoint answers `404` before reaching the
operations. That is a pre-existing routing bug tracked separately, not part of this fix — do not rely on
it as mitigation.
:::

**Backward compatibility.** Model-level ActiveModel validations are **deprecated but completely
unchanged**, and are used for every model and action with no request class. There is no runtime
deprecation warning. No route, URL, query parameter, status code or error envelope changed.
`rhino-react` is unaffected and needs no upgrade. The deprecated path will be removed in **5.0**.

One behavior does change, and only on the new path: **an operation inside `POST /nested` that is
validated by a request class now also runs the cross-tenant foreign-key check**. The model-level
nested path validates without the organization, so it never ran there. A nested operation referencing
another organization's row, which used to be written, is now a `422` — a fix, not a regression.

:::warning Upgrade action: none
`bundle update rhino-rails` and you are done. No initializer change, no `eager_load_paths` entry, no
migration, no route change. Nothing in a 4.9.0 app can be picked up by convention discovery, because a
convention name that is not a `Rhino::ResourceRequest` is logged and ignored. See
[Upgrading — 4.9 → 4.10](./upgrading#4-9-4-10).
:::

## 4.9.0

**Computed attributes take arguments, the same way scopes do.** A computed attribute used to be a
name and nothing else, so anything the client needed to vary had to be baked into its own attribute —
`revenue_last_30_days`, `revenue_last_90_days`, `revenue_ytd` — or pushed out to the client as a
filter over a column you then had to expose. An attribute can now declare parameters the client fills
in, with `with:` carrying the lambda:

```ruby title="app/models/user.rb"
def self.rhino_collection_computed_attributes
  {
    "active_users_count" => ->(scope, _user) { scope.where(status: "active").count },
    "revenue" => {
      params: %i[from to],
      with: ->(scope, _user, from, to) { scope.where(created_at: from..to).sum(:total) }
    }
  }
end
```

```bash title="terminal"
curl -g '/api/users/computed?attributes[revenue][from]=2026-01-01&attributes[revenue][to]=2026-02-01'
```

```json
{ "data": { "revenue": 48210.5 } }
```

The same three bracket forms work on `?computed_attributes=` for per-record attributes on `index`,
`show` and `trashed`, where a record lambda receives them as `->(record, user, since, status)`.

- Arguments bind **by name** and reach the lambda in declared order, after the user. A bare value binds
  to the single declared parameter; a positional list is refused; `"true"` / `"false"` arrive as real
  booleans.
- Parameter names are matched **verbatim** — unlike scope parameters, they are not underscored on the
  way in.
- An entry that declares any parameter is invoked strictly as `entry.call(scope, user, *args)`. Give
  optional parameters a Ruby default in the lambda; an entry that declares none keeps the tolerant
  arity-0/1/2 handling it has always had.
- The declared check and the policy check run **before** any argument is bound, so an undeclared name
  and a policy-denied one keep returning the same `Computed attribute 'x' is not allowed`.
- Argument mistakes are `403`: `requires parameter 'to'`, `does not accept parameter 'nope'`,
  `requires named parameters`, `does not accept arguments`. A structurally impossible selection —
  `?attributes[]=x` — is `Computed attributes are not allowed`. Mixing the comma list and the bracket
  form on one key is refused by Rack as a `400` before Rhino sees it.
- A bare `GET /{resource}/computed` returns every policy-allowed attribute **minus** any that declares
  a required parameter; those are skipped silently rather than erroring.
- The Postman export emits the bracket form for parameterised attributes, and leaves them out of the
  combined multi-attribute request, which would otherwise ship a guaranteed 403.

Two things differ from named scopes on purpose: there is **no shorthand declaration form** — only a
hash carrying `params`, `optional` or `with` is a spec, because a bare array is already a valid
*literal* declaration — and there is **no per-request cap**.

**Symbol-keyed record declarations now serialize — a behavior change worth checking.**
`{ full_name: ->(record, _user) { … } }` passed the 403 gate, which stringified names, but the
serializer then compared that stringified name against the model's raw symbol keys and found nothing —
so the attribute was silently dropped from the JSON, with a 200 and no error anywhere. Both sides now
normalize identically, which means a response to `?computed_attributes=full_name` that used to come
back **without** `full_name` now carries it. If a client had come to rely on that absence, or if the
lambda was never exercised in production and turns out to raise, this is where you will see it.

**An all-optional scope gets its own defaults back.** The scope binder dropped trailing `nil`s with
`args.any?`, which is false for `[nil]` — so a scope whose parameters were all optional, called with
none, received `[nil]` instead of `[]` and never reached its lambda's own default. Mixed cases were
always fine, which is why it went unnoticed. It now matches Laravel and NestJS.

**The React client** ships the matching form in `@rhino-dev/rhino-react` 4.6.0. `computedAttributes`
and `useModelComputedAttributes`'s `attributes` now accept an object as well as an array —
`{ revenue: { from, to }, activeUsersCount: null }` — serialized to the bracket URL. `ScopeSelection`
is also now genuinely exported from the package entry point; 4.5.0 documented it but only exported it
from the types module.

Everything that worked before works unchanged: `?attributes=a,b` and `?computed_attributes=a,b` parse
exactly as they did, a declaration that is not a spec hash keeps its existing meaning, `as_rhino_json`
gained an optional keyword rather than changing the existing one, and every scope error string is
byte-identical — scopes and computed attributes now share one argument binder, with the noun injected.

No upgrade step beyond the dependency bump; routes are registered from inside the library.

## 4.8.1

**The named-scope cap is configurable.** How many scopes one request may combine is now
`config.max_scopes_per_request`, defaulting to the same 3 as before:

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.max_scopes_per_request = 3
end
```

A value below 1 is ignored rather than locking every scope out of every request.

The [Combining scopes](./querying#combining-scopes) docs now also explain what the cap is protecting
you from, with a worked example: two scopes that each `joins` a relation are correct alone and wrong
together, returning duplicate rows, inflating the pagination total and making `?sort=` ambiguous.
Prefer relation predicates or `EXISTS` subqueries, keep ordering and limits out of scope bodies, and
do not reach for `distinct` as a patch.

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
