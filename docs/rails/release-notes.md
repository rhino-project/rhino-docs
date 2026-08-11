---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Rails, newest first.

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
