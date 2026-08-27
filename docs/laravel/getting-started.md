---
sidebar_position: 1
title: Getting Started
---

# Laravel Server — Getting Started

Install Rhino and go from zero to a full REST API in under 5 minutes.

:::info Start here — this page summarizes the whole library
This is the entry point for the Laravel docs. The [Feature Map](#feature-map) below is a complete
summary of every feature Rhino ships, each with its canonical declaration and a link to its deep-dive
page. If you are an AI agent picking up this codebase, read this page first — it tells you what exists
so you never hand-write something Rhino already generates.
:::

## Requirements

- PHP 8.0+
- Laravel 10+
- Composer

## Installation

```bash title="terminal"
composer require rhino-project/rhino-laravel:^4.0
```

Then run the interactive installer:

```bash title="terminal"
php artisan rhino:install
```

The installer will walk you through:

- Publishing config and routes
- Enabling multi-tenant support (organizations, roles)
- Enabling audit trail (change logging)
- Setting up the AI toolkit (rules, skills, agents)

## The mental model

Rhino **derives your API from declarations**, not from controllers. You register a model, declare what
is queryable on it, and declare who may do what in a policy. Rhino generates the routes, applies
tenant scoping, authorizes the action, builds the query, serializes the response, and strips columns
the user may not see — the same way for every model.

```
Declare (model + policy + config)  →  Rhino generates and enforces  →  REST API
```

The practical consequence: **if you are writing a controller, check the [Feature Map](#feature-map)
first.** Counts, filters, per-role field visibility, batch writes and trash/restore all have
declarative answers already.

## Configuration

After installation, your config file is at `config/rhino.php`:

```php title="config/rhino.php"
return [
    // Model registration — slug => model class
    'models' => [
        'posts'    => \App\Models\Post::class,
        'comments' => \App\Models\Comment::class,
    ],

    // Models that don't require authentication
    'public' => [
        'posts',  // These endpoints skip auth middleware
    ],

    // Multi-tenancy settings
    'multi_tenant' => [
        'organization_identifier_column' => 'id',  // 'id', 'slug', or 'uuid'
    ],

    // Column matched by {id} on member routes (default: each model's primary key)
    // 'route_key' => 'hash_id',

    // Invitation system
    'invitations' => [
        'expires_days' => env('INVITATION_EXPIRES_DAYS', 7),
        'allowed_roles' => null,  // null = all roles, or ['admin', 'editor']
    ],

    // Nested operations
    'nested' => [
        'path' => 'nested',         // Route path
        'max_operations' => 50,     // Max ops per request
        'allowed_models' => null,   // null = all registered models
    ],

    // Generator settings
    'test_framework' => 'pest',  // 'pest' or 'phpunit'

    // Postman export
    'postman' => [
        'role_class'      => 'App\Models\Role',
        'user_role_class'  => 'App\Models\UserRole',
        'user_class'       => 'App\Models\User',
    ],
];
```

Route groups (`'route_groups'`) and layered auth options (`'auth'`) are covered in
[Route Groups](./route-groups).

## Environment Variables

Add these to your `.env` file as needed:

```env title=".env"
# Invitation expiration (days)
INVITATION_EXPIRES_DAYS=7

# TypeScript export targets (see Export Types)
RHINO_CLIENT_PATH=../client
RHINO_MOBILE_PATH=../mobile
```

## Register Your First Model

Create a model (or use the [generator](./generator)):

```php title="app/Models/Post.php"
<?php

namespace App\Models;

use Rhino\LaravelApi\Models\RhinoModel;

class Post extends RhinoModel
{
    protected $fillable = ['title', 'content', 'status', 'user_id'];

    // Validation (format rules — field permissions live in the policy)
    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published,archived',
    ];

    // Query configuration
    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title', 'updated_at'];
    public static $defaultSort     = '-created_at';
    public static $allowedIncludes = ['user', 'comments'];
    public static $allowedSearch   = ['title', 'content'];

    // Relationships
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function comments()
    {
        return $this->hasMany(Comment::class);
    }
}
```

:::tip RhinoModel
`RhinoModel` extends `Model` and includes `SoftDeletes`, `HasValidation`, `HidableColumns`, and `HasAutoScope` out of the box. Open the base class to see all available properties with documentation and examples.

For additional features, add traits manually:
```php title="app/Models/Post.php"
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;
    // ...
}
```
:::

Register it in `config/rhino.php`:

```php title="config/rhino.php"
'models' => [
    'posts' => \App\Models\Post::class,
],
```

That's it. You now have a full REST API for posts:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/{id}` | Show single record with relationships |
| `PUT` | `/api/posts/{id}` | Update with validation |
| `DELETE` | `/api/posts/{id}` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/{id}/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanent delete |

:::tip Multi-Tenant Routes
When multi-tenancy is enabled, all routes are prefixed with `{organization}`:

```
GET /api/{organization}/posts
POST /api/{organization}/posts
```
:::

## Run Migrations

```bash title="terminal"
php artisan migrate
```

This will create the necessary tables for audit logs, invitations, and any model tables you've defined.

---

## Feature Map

Everything Rhino for Laravel does, in one place. Each row names the declaration you write and links to
the page that explains it in full.

### 1. Model declaration surface

Every static property below is optional — declare only what differs from the default. Full reference:
[Models](./models).

| Property | Purpose |
|---|---|
| `$fillable` | Standard Eloquent mass assignment; determines writable fields on `POST`/`PUT` |
| `$validationRules` / `$validationRulesMessages` | Format rules and custom messages ([Validation](./validation)) |
| `$allowedFilters` | Fields usable with `?filter[field]=value` |
| `$allowedSorts` / `$defaultSort` | Fields usable with `?sort=`, plus the fallback sort |
| `$allowedSearch` | Fields swept by `?search=` (relations allowed, e.g. `user.name`) |
| `$allowedIncludes` | Relationships loadable with `?include=` |
| `$allowedFields` | Columns selectable with `?fields[table]=` |
| `$allowedScopes` / `$defaultScope` | Named scopes selectable with `?scope=`, and the one applied by default ([Querying](./querying#named-scopes)) |
| `$paginationEnabled` / `$perPage` | Pagination toggle and page size |
| `$middleware` / `$middlewareActions` | Middleware for all routes, or per action |
| `$exceptActions` | CRUD actions to *not* generate (`index`, `show`, `store`, `update`, `destroy`, `computed`) |
| `$routeKey` | Column matched by the `{id}` segment on member routes ([Route Key](./models#route-key)) |
| `$additionalHiddenColumns` | Columns always stripped from responses |
| `$auditExclude` | Fields kept out of audit entries |

:::warning Whitelists are the security boundary
A field not listed in an `$allowed*` array is silently ignored — clients cannot filter, sort or
select by columns you didn't opt in. Adding a column to a whitelist is an authorization decision.
:::

### 2. Traits

Included automatically in `RhinoModel`: `HasFactory`, `SoftDeletes`, `HasValidation`,
`HidableColumns`, `HasAutoScope`.

| Trait | Add it when |
|---|---|
| `HasAuditTrail` | The model needs change logging ([Audit Trail](./audit-trail)) |
| `BelongsToOrganization` | The model holds tenant data ([Multi-Tenancy](./multi-tenancy)) |
| `HasUuid` | You want an auto-generated `uuid` column |
| `HasPermissions` | On the **User** model, to enable permission checks |
| `ViewModelHelpers` | You want `formatPrice()` currency formatting |

### 3. Generated endpoints

| Method | Endpoint | Policy method | Notes |
|---|---|---|---|
| `GET` | `/api/{resource}` | `viewAny()` | Filters, sorts, search, includes, fields, pagination |
| `POST` | `/api/{resource}` | `create()` | Validated; field permissions enforced |
| `GET` | `/api/{resource}/{id}` | `view()` | Not narrowed by `?scope=` |
| `PUT` | `/api/{resource}/{id}` | `update()` | |
| `DELETE` | `/api/{resource}/{id}` | `delete()` | Soft delete when the model supports it |
| `GET` | `/api/{resource}/trashed` | `viewTrashed()` | [Soft Deletes](./soft-deletes) |
| `POST` | `/api/{resource}/{id}/restore` | `restore()` | |
| `DELETE` | `/api/{resource}/{id}/force-delete` | `forceDelete()` | Permanent |
| `GET` | `/api/{resource}/computed` | `viewAny()` | Only when collection attributes are declared ([Computed Attributes](./computed-attributes)) |
| `GET` | `/api/{resource}/{id}/audit` | — | Only for `HasAuditTrail` models ([Audit Trail](./audit-trail)) |
| `POST` | `/api/nested` | per-operation | Atomic multi-model writes ([Nested Operations](./nested-operations)) |

Auth routes ship out of the box:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login, returns API token |
| `POST` | `/api/auth/logout` | Revoke all tokens |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

Invitation routes (`/api/{organization}/invitations`, `…/{id}/resend`, `/api/invitations/accept`) are
registered under the `tenant` route group; a group can also opt into its own prefixed auth route set —
see [Route Groups](./route-groups#group-membership--auth).

### 4. Query parameters

All of these compose in a single request. Full reference: [Querying](./querying).

| Parameter | Example | Behavior on an unknown value |
|---|---|---|
| `?filter[field]=` | `?filter[status]=draft,published` (comma = OR) | Ignored |
| `?sort=` | `?sort=status,-created_at` | Ignored |
| `?search=` | `?search=laravel` | — |
| `?include=` | `?include=user,comments.user`, `?include=commentsCount` | **403** if the user lacks `viewAny` on the included resource |
| `?fields[table]=` | `?fields[posts]=id,title` | Ignored |
| `?page=` / `?per_page=` | `?page=2&per_page=25` | — |
| `?scope=` | `?scope=availableForDrivers` | **403** if not whitelisted |
| `?computed_attributes=` | `?computed_attributes=avatar_url` | **403** if undeclared or denied |

Pagination metadata comes back in **headers**, not the body: `X-Current-Page`, `X-Last-Page`,
`X-Per-Page`, `X-Total`.

### 5. Validation

Format rules live on the model (`$validationRules`, any Laravel rule); **which fields a role may
write** lives on the policy. A forbidden field is a `403`; a malformed value is a `422` with
field-level errors. See [Validation](./validation).

### 6. Authorization

Policies extend `ResourcePolicy`, which maps each action to a `{resource}.{action}` permission
(`posts.index`, `posts.store`, `posts.forceDelete`…). Wildcards: `posts.*` and `*`.

Effective permissions resolve from **three layers**, with deny always winning:

```
effective = (role ∪ granted) − denied
```

- **role** — `org_role_permissions(organization_id, role_id, permissions)`, shared by everyone with
  that role in that org
- **granted** / **denied** — per-user deltas on `user_roles`
- **legacy** — `user_roles.permissions`, still honored as an allow layer

Outside a tenant context, permissions come from `users.permissions`. Use
`$user->explainPermission($perm, $org)` to see which layer decided, and
`php artisan rhino:permissions-migrate` to lift per-user sets into the role layer. Full detail:
[Policies](./policies).

**Attribute-level permissions** are part of the same policy:

| Policy method | Controls |
|---|---|
| `permittedAttributesForShow()` | Read whitelist (`['*']` = all) |
| `hiddenAttributesForShow()` | Read blacklist — always wins |
| `permittedAttributesForCreate()` | Writable fields on `store` |
| `permittedAttributesForUpdate()` | Writable fields on `update` |

### 7. Multi-tenancy

`BelongsToOrganization` scopes every query to the current organization and fills `organization_id` on
create. Models without an org column are scoped through their `BelongsTo` chain, auto-detected up to
three levels deep. The organization is resolved from a URL prefix (`/api/{organization}/…`) or a
subdomain, matched on `id`, `slug` or `uuid`. Unknown org, or an org the user doesn't belong to → `404`.
A route group with no tenant boundary — a back office where every operator sees every organization's
rows — declares `'tenant' => false`, which drops the organization filter for that group only while
keeping its own scopes and policies. See [Multi-Tenancy](./multi-tenancy).

### 8. Route groups

One set of models, several URL contexts — a tenant dashboard, a driver app, an admin panel, a public
read-only API — each with its own prefix, optional host constraint, middleware, model subset, auth
route set, lifecycle hooks and tenant boundary (`'tenant' => false` for a group that spans every
organization). `'tenant'` and `'public'` are reserved names. Conflicting groups throw at boot. See
[Route Groups](./route-groups).

### 9. Data lifecycle

- **Soft deletes** — trash, restore and force-delete are separate endpoints with separate permissions
  ([Soft Deletes](./soft-deletes))
- **Audit trail** — `created`, `updated`, `deleted`, `force_deleted`, `restored` with before/after
  values, actor, IP and user agent ([Audit Trail](./audit-trail))
- **Nested operations** — up to 50 create/update/delete operations in one transaction, with `$N.field`
  references between them; any failure rolls the whole batch back
  ([Nested Operations](./nested-operations))

### 10. Computed attributes

Three kinds, chosen by cost — none of them needs a controller
([Computed Attributes](./computed-attributes)):

| Kind | Hook | Evaluated |
|---|---|---|
| Always-on, per record | `rhinoComputedAttributes()` | Every row of every read |
| Opt-in, per record | `rhinoRecordComputedAttributes()` | Only when the client sends `?computed_attributes=` |
| Collection-level aggregate | `rhinoCollectionComputedAttributes()` (static) | Once per request, via `GET /{resource}/computed` |

All three pass through the same policy gate as database columns. Never override `asRhinoJson()` —
doing so appends values *after* policy filtering.

### 11. Custom controllers

When the shape genuinely isn't "attributes of one resource" — cross-model reports, workflows, bulk
actions — write a controller, but build its queries through the resolver so tenant isolation and your
global scopes still apply:

```php
use Rhino\Facades\Rhino;

$open = Rhino::query(Task::class)->where('status', 'open')->count();
```

A raw `Task::where(...)` is unscoped outside a request and will return every tenant's rows. The
resolver fails closed instead — it throws `MissingTenantContext` rather than returning them — unless
the request is served by a route group declared `'tenant' => false`, where it applies your global
scopes without an organization filter. See [Custom Controllers](./custom-controllers).

### 12. Code generation & tooling

| Command | What it does |
|---|---|
| `php artisan rhino:install` | Interactive setup: config, routes, multi-tenancy, audit trail, AI toolkit, test framework |
| `php artisan rhino:generate` (`rhino:g`) | Scaffold a model + migration + factory, a policy, or a scope ([Generator](./generator)) |
| `php artisan rhino:blueprint` | Generate models, policies, tests and seeders from YAML specs — deterministic, no AI tokens ([Blueprint](./blueprint)) |
| `php artisan rhino:export-types` | TypeScript interfaces for the client and mobile apps ([Export Types](./export-types)) |
| `php artisan rhino:export-postman` | Postman Collection v2.1 covering every endpoint |
| `php artisan rhino:permissions-migrate` | Lift per-user permissions into the role layer (`--apply` to write) |
| `php artisan invitation:link` | Generate an invitation link for testing |

### 13. Request pipeline

```
Request → Middleware → Policy → Scope → Query Builder → Serialize → Attribute permissions → Response
```

Knowing which layer you're debugging is usually the whole fix. See
[Request Lifecycle](./request-lifecycle).

---

## Which tool for which problem

| You want to… | Do this — not a controller |
|---|---|
| Return a count or a sum | `rhinoCollectionComputedAttributes()` → `GET /{resource}/computed` |
| Add a derived field to each row | `rhinoComputedAttributes()`, or `rhinoRecordComputedAttributes()` if it costs a query |
| Hide a column from some roles | `hiddenAttributesForShow()` on the policy |
| Let clients pick a complex predefined query | `$allowedScopes` + a `scopeXxx` method |
| Always restrict rows (tenancy, visibility) | A **global** scope — never `$defaultScope` |
| Create related records atomically | `POST /api/nested` with `$N.id` references |
| Expose the same models to a second app | A [route group](./route-groups) |
| Serve records at a non-`id` URL | `$routeKey` |
| Restrict who can write a field | `permittedAttributesForCreate()` / `…ForUpdate()` |

## Scaffold with the Generator

Use the interactive generator to create models, migrations, factories, policies, and scopes:

```bash title="terminal"
php artisan rhino:generate
```

```
+ Rhino :: Generate :: Scaffold your resources +

 What type of resource would you like to generate?
 > Model (with migration and factory)

 What is the resource name?
 > Post

 Creating Post model, migration, and factory ..................... done
```

See the [Generator docs](./generator) for all options.

## Documentation map

| Page | Read it for |
|---|---|
| [Models](./models) | Every model property and trait, route keys |
| [Validation](./validation) | Format rules, field permissions, error shapes |
| [Querying](./querying) | Filters, sorts, search, includes, fields, named scopes |
| [Computed Attributes](./computed-attributes) | Derived values and aggregates |
| [Request Lifecycle](./request-lifecycle) | The seven layers of a request |
| [Policies](./policies) | Permissions, wildcards, layered resolution, attribute permissions |
| [Route Groups](./route-groups) | Multiple URL contexts, group auth, hooks, membership |
| [Nested Operations](./nested-operations) | Atomic multi-model writes |
| [Soft Deletes](./soft-deletes) | Trash, restore, force delete |
| [Multi-Tenancy](./multi-tenancy) | Organizations, roles, scoping |
| [Custom Controllers](./custom-controllers) | Tenant-safe hand-written endpoints |
| [Audit Trail](./audit-trail) | Change logging and querying it |
| [Generator](./generator) | All Artisan commands |
| [Blueprint](./blueprint) | YAML-driven, deterministic codegen |
| [Export Types](./export-types) | TypeScript types for the client |
| [Best Practices](./best-practices/) | The opinionated manual, built on one example app |
| [Release Notes](./release-notes) | What changed, newest first |

The [React client docs](../react/getting-started) cover the hooks that consume this API.
