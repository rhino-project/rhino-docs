---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of Rhino for Laravel, newest first.

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
