---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Rails, newest first.

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

## 4.6.1

**Security — cross-tenant isolation on member endpoints.** `show`, `update`, `destroy`, `restore`, and force-delete now apply the same organization scoping as `index`, including auto-detected indirect chains (e.g. task → project → organization). Previously, models without a direct `organization_id` column could be fetched or mutated cross-tenant by id (or route key), and `restore`/force-delete were not organization-scoped at all. Upgrading is strongly recommended for multi-tenant apps.

Also fixed in the shared scoping module:

- Models using `for_organization` no longer lose the incoming relation when scoped — `trashed` listings and discarded-record lookups now correctly combine the soft-delete filter with the organization filter.
- Multi-hop auto-detected scoping paths (e.g. `comment → task → project`) no longer raise `ActiveRecord::ConfigurationError`.

Fully backward compatible for single-tenant apps and requests without an organization context — those lookups are unchanged.

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

## 4.5.0 and earlier

See the [GitHub releases](https://github.com/rhino-project/rhino-rails/releases) for the history of earlier versions.
