---
sidebar_position: 7
title: Multi-Tenancy
---

# Multi-Tenancy

Rhino supports organization-based data isolation out of the box. Each user can belong to multiple organizations with different roles in each.

## Enabling Multi-Tenancy

During `php artisan rhino:install`, select **Yes** when asked about multi-tenant support. This creates:

- `organizations` table and model
- `roles` table and model
- `user_roles` junction table
- Organization resolution middleware
- Role and organization seeders
- `OrganizationPolicy`, `RolePolicy`, and `UserPolicy` (the User policy maps the User model to the `users` permission slug — required for `?include=` on User-typed relations like `assignee`/`author`/`owner`)

Or configure it manually in `config/rhino.php`:

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'enabled' => true,                           // master switch for organization scoping
    'organization_identifier_column' => 'slug',  // 'id', 'slug', or 'uuid'
],
```

:::tip Hybrid platforms
For platforms that need multiple access patterns (e.g., tenant + driver + admin + public), see [Route Groups](./route-groups.md).
:::

## Route Groups Without a Tenant Boundary

Every [route group](./route-groups.md) is a tenant group by default, which is what a tenant app
wants: the [resource-scope resolver](./custom-controllers.md) **fails closed**, so `Rhino::query()`
on an organization-scoped model with no organization context throws `MissingTenantContext` rather
than returning every tenant's rows.

Some groups genuinely have no tenant to resolve — a back office or admin group whose operators are
meant to see every organization's records, with access decided by **roles and scopes** instead of by
organization. No organization is ever resolved there, so an ambient `Rhino::query()` would throw on
any organization-owned model. Declare the group non-tenant:

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
    'admin' => [
        'prefix' => 'admin',
        'tenant' => false, // no tenant boundary: queries here span every organization
        'middleware' => [],
        'models' => [],
    ],
],
```

Inside that group, `Rhino::query()` and `Rhino::scopedQuery()` apply **no** organization filter and
no longer throw:

```php
use Rhino\Facades\Rhino;

// A controller reached through the 'admin' group.
$open = Rhino::query(Task::class)->where('status', 'open')->count();
$rows = Rhino::forUser($admin)->query(Task::class)->get();
```

The `tenant` group in the same app is untouched and keeps failing closed. That is the point of
putting the switch on the group rather than on the app: a mixed app — a multitenant API plus a
back office — gets exactly one relaxed group.

### Tagging your own routes with a group

The resolver reads the group from the matched route's `route_group` default, the same value
[memberships](./route-groups.md) and policies resolve it from. Rhino's generated CRUD routes carry it
already. A route you register yourself has to say which group it belongs to:

```php title="routes/api.php"
Route::middleware(['auth:sanctum'])
    ->get('admin/dashboard', [AdminDashboardController::class, 'summary'])
    ->defaults('route_group', 'admin');
```

Register non-tenant routes **above** any `{organization}`-prefixed route, or `/api/admin/dashboard`
matches the tenant route with `{organization} = 'admin'` and 404s as an unknown organization.

### What declaring a group non-tenant does not change

It removes **only** the organization filter, and only for requests served by that group:

| Still applies in a `'tenant' => false` group | Why |
|---|---|
| `App\Models\Scopes\{Model}Scope` | Your user-aware global scopes are where row-level access lives when there is no organization |
| `$allowedScopes` named scopes | `Rhino::scopedQuery($model, 'availableForDrivers')` behaves identically |
| Policies | The resolver scopes rows; `Gate::authorize()` still decides access |
| Explicit `inOrganization($org)` | An explicitly requested organization is always honored — the caller asked for that tenant |
| CRUD through `GlobalController` | Tenant groups resolve and scope the organization exactly as before |

Everything that is **not** provably a non-tenant group keeps failing closed — an unknown group, a
route with no group tag, and any code running outside a request that does not say which group it is
acting as.

### Naming the group where no route resolves one

A queued job, a console command or a scheduled task has no route, so nothing resolves a group and a
bare `Rhino::query()` fails closed. Such code names the group it is acting as:

```php
use Rhino\Facades\Rhino;

// A back-office job: the 'admin' group is declared 'tenant' => false, so this
// legitimately spans every organization.
Rhino::inRouteGroup('admin')->query(Task::class)->where('status', 'open')->count();

// With an operator, so the user-aware global scopes still narrow the rows:
Rhino::forUser($operator)->inRouteGroup('admin')->query(Task::class)->get();

// Ambient calls inside the block see the group too:
Rhino::inRouteGroup('admin')->run(fn () => Rhino::query(Task::class)->count());
```

The config remains the single source of truth: the **named group's own** `'tenant' => false` is what
lifts the boundary. Naming a tenant group — or one that is not configured — changes nothing and still
throws, so this states a context rather than bypassing one:

```php
Rhino::inRouteGroup('tenant')->query(Task::class);  // still throws MissingTenantContext
Rhino::forUser($admin)->query(Task::class);         // no group named → still throws
```

For a job that belongs to **one** tenant, pass that tenant instead — an explicit organization always
scopes, in any group:

```php
Rhino::forUser($admin)->inOrganization($org)->query(Task::class);
```

The context is popped after the query is built, so it never leaks into a later ambient query in a
long-lived worker.

:::warning Only for groups with no tenant boundary
`'tenant' => false` removes the guard that turns a forgotten tenant context into a loud crash — for
that group, a missing organization becomes a **silent cross-tenant read** instead. Declare it only on
groups where every operator is meant to see every organization's rows, and keep those groups' models
list narrow (`'models' => []` when the group only serves custom controllers).
:::

## How It Works

When multi-tenancy is enabled, all API routes include the organization:

```
/api/{organization}/posts
/api/{organization}/comments
/api/{organization}/users
```

The middleware:

1. Resolves the organization from the URL (or subdomain)
2. Validates the organization exists (404 if not)
3. Checks the authenticated user belongs to that organization (404 if not)
4. Scopes all queries to that organization automatically

## Organization Resolution Strategies

### Route Prefix (Default)

The organization identifier is part of the URL path:

```bash title="terminal"
GET /api/acme-corp/posts       # Using slug
GET /api/1/posts               # Using id
GET /api/abc-123-def/posts     # Using uuid
```

Uses `ResolveOrganizationFromRoute` middleware. The identifier column is configurable:

```php title="config/rhino.php"
'organization_identifier_column' => 'slug',  // matches organizations.slug column
```

### Subdomain

The organization is extracted from the subdomain:

```bash title="terminal"
GET https://acme-corp.yourapp.com/api/posts
GET https://other-org.yourapp.com/api/posts
```

This is expressed with a **parameterized `domain`** on the tenant route group.
The captured `{organization}` segment is bound as a route parameter, so the
standard `ResolveOrganizationFromRoute` middleware resolves it exactly as it does
for a path prefix:

```php title="config/rhino.php"
'route_groups' => [
    'tenant' => [
        'prefix' => '',
        'domain' => '{organization}.yourapp.com',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

See [Route Groups → Domain Constraints](./route-groups.md#domain-constraints) for
the full semantics. A domain parameter matches a single host label, so an
apex request like `yourapp.com/api/posts` does not match the tenant group — keep
non-tenant subdomains (e.g. `www`, `app`) on their own group or host.

## Scoping Models

Add `BelongsToOrganization` to scope a model's data per organization:

```php title="app/Models/Post.php"
use Rhino\Traits\BelongsToOrganization;

class Post extends Model
{
    use SoftDeletes, HasValidation, BelongsToOrganization;

    protected $fillable = ['title', 'content', 'organization_id', 'user_id'];
}
```

Migration:

```php title="database/migrations/create_posts_table.php"
Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->string('title');
    $table->text('content');
    $table->foreignId('organization_id')->constrained();
    $table->foreignId('user_id')->constrained();
    $table->softDeletes();
    $table->timestamps();
});
```

Now `GET /api/acme-corp/posts` only returns posts where `organization_id` matches Acme Corp. The `organization_id` is automatically set when creating records.

### Nested Organization Ownership

Not all models have a direct `organization_id` column. Rhino **auto-detects** the path to the organization by introspecting `BelongsTo` relationships. As long as your model's `belongsTo` chain eventually reaches a model with `organization_id`, scoping works automatically — no extra configuration needed.

```php title="app/Models/Comment.php"
class Comment extends Model
{
    use BelongsToOrganization;

    // Comment → Post → Blog → Organization (auto-detected)
    protected $fillable = ['content', 'post_id', 'user_id'];

    public function post()
    {
        return $this->belongsTo(Post::class);
    }
}
```

```php title="app/Models/Post.php"
class Post extends Model
{
    use BelongsToOrganization;

    // Post → Blog → Organization (auto-detected)
    public function blog()
    {
        return $this->belongsTo(Blog::class);
    }
}
```

```php title="app/Models/Blog.php"
class Blog extends Model
{
    use BelongsToOrganization;

    // Blog has organization_id directly
    protected $fillable = ['name', 'slug', 'organization_id'];

    public function organization()
    {
        return $this->belongsTo(Organization::class);
    }
}
```


## Per-Organization Roles

Users have roles scoped to each organization. A user can be **admin** in one organization and **viewer** in another.

### Setting Up Roles

Roles are named buckets. Their permissions live in the **role layer**
(`org_role_permissions`), defined once per `(organization, role)` — every member
of that role in that org inherits it.

```php title="database/seeders/RoleSeeder.php"
use App\Models\OrgRolePermission;

// Roles (just slug + name)
$admin  = Role::create(['name' => 'Admin',  'slug' => 'admin']);
$editor = Role::create(['name' => 'Editor', 'slug' => 'editor']);
$viewer = Role::create(['name' => 'Viewer', 'slug' => 'viewer']);

// The shared role layer — what each role can do *within an organization*.
foreach ([$acmeCorp, $otherOrg] as $org) {
    OrgRolePermission::create(['organization_id' => $org->id, 'role_id' => $admin->id,
        'permissions' => ['*']]);
    OrgRolePermission::create(['organization_id' => $org->id, 'role_id' => $editor->id,
        'permissions' => ['posts.index', 'posts.show', 'posts.store', 'posts.update', 'comments.*']]);
    OrgRolePermission::create(['organization_id' => $org->id, 'role_id' => $viewer->id,
        'permissions' => ['posts.index', 'posts.show']]);
}
```

### Assigning Users to Organizations

Each `user_roles` row carries only the user's **deltas** — extra abilities
(`granted_permissions`) or carve-outs (`denied_permissions`). Leave them empty to
inherit the role layer as-is.

```php title="database/seeders/RoleSeeder.php"
use App\Models\UserRole;

// User is admin in Acme Corp (inherits '*' from the role layer)
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $acmeCorp->id,
    'role_id' => $admin->id,
]);

// Same user is viewer in Other Org
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $otherOrg->id,
    'role_id' => $viewer->id,
]);

// Bob is an editor, but specifically may NOT delete posts (deny wins):
UserRole::create([
    'user_id' => $bob->id,
    'organization_id' => $acmeCorp->id,
    'role_id' => $editor->id,
    'denied_permissions' => ['posts.destroy'],
]);

// Carol is a viewer, but is also allowed to moderate comments (extra grant):
UserRole::create([
    'user_id' => $carol->id,
    'organization_id' => $acmeCorp->id,
    'role_id' => $viewer->id,
    'granted_permissions' => ['comments.destroy'],
]);
```

:::tip Effective permissions
`effective = (role ∪ granted) − denied`, and **deny always wins** (even over a
role `*`). See [Layered Permissions](./policies.md#layered-permissions) for the
full model, wildcards, the `explainPermission()` helper, and the
`rhino:permissions-migrate` command for upgrading existing apps.
:::

### Checking Permissions

```php title="app/Models/User.php"
// User is admin in Acme Corp
$user->hasPermission('posts.store', $acmeCorp);  // true
$user->hasPermission('posts.destroy', $acmeCorp); // true (admin has *)

// Same user is viewer in Other Org
$user->hasPermission('posts.store', $otherOrg);   // false
$user->hasPermission('posts.index', $otherOrg);   // true
```

## Group Membership Enforcement

By default, belonging to an organization is what grants access; a route group is
not itself an access boundary. You can opt into treating group membership as a
first-class gate with the master flag in `config/rhino.php`:

```php title="config/rhino.php"
'auth' => [
    'enforce_group_membership' => false, // default OFF — behavior unchanged
],
```

When the flag is **on**, after authentication an additional **coarse** check
runs before permissions: the user must hold a `user_roles` row whose
`route_group` matches the request's group (a `NULL` `route_group` row is a
**wildcard** that matches every group) **and**, for tenant groups, the resolved
organization. No matching row → **403**. Permissions then resolve from that
matching membership row (per `(group, org)`), with an exact-group row preferred
over a wildcard row — instead of the org-presence heuristic.

This pairs with the per-group `auth`/`hooks` keys and invitation `route_group`
described in [Route Groups → Group membership & auth](./route-groups.md#group-membership--auth).
With the flag off, none of this applies and multi-tenancy behaves exactly as
documented above.

## Access Control

### User Not in Organization

If a user tries to access an organization they don't belong to:

```bash title="terminal"
curl -H "Authorization: Bearer TOKEN" /api/other-org/posts
# → 404 { "message": "Organization not found" }
```

:::info Why 404 and not 403?
With `enforce_group_membership` **off** (the default), returning 404 instead of
403 prevents leaking information about organization existence — users can't
discover which organization slugs are valid. A genuinely unknown org always 404s.

When `enforce_group_membership` is **on**, this changes for an authenticated
**non-member** of the requested route group: the membership gate runs *before*
the org-resolution 404 and returns **403** (membership denial takes precedence
over the org 404). The gate resolves the org itself as needed, so a real org you
simply aren't a member of yields 403, while a genuinely non-existent org still
404s. See [Route Groups → Group membership & auth](./route-groups.md#group-membership--auth).
:::

### No Authentication

Requests without authentication to non-public endpoints:

```bash title="terminal"
curl /api/acme-corp/posts
# → 401 { "message": "Unauthenticated." }
```

### Public Endpoints

Models listed in the `public` config skip authentication:

```php title="config/rhino.php"
'public' => ['posts'],  // /api/{org}/posts doesn't require auth
```

## Full Setup Example

Here's a complete multi-tenant setup from scratch:

### 1. Enable in Config

```php title="config/rhino.php"
return [
    'models' => [
        'posts'    => \App\Models\Post::class,
        'comments' => \App\Models\Comment::class,
    ],
    'multi_tenant' => [
        'enabled' => true,
        'organization_identifier_column' => 'slug',
    ],
];
```

### 2. Create Models

```php title="app/Models/Post.php"
class Post extends Model
{
    use SoftDeletes, HasValidation, BelongsToOrganization, HasAuditTrail;

    protected $fillable = ['title', 'content', 'status', 'organization_id', 'user_id'];

    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title'];
    public static $defaultSort     = '-created_at';
    public static $allowedIncludes = ['user', 'comments'];
    public static $allowedSearch   = ['title', 'content'];

    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published',
    ];

    // Field permissions are controlled by PostPolicy
    // See: permittedAttributesForCreate() / permittedAttributesForUpdate()

    public function user()     { return $this->belongsTo(User::class); }
    public function comments() { return $this->hasMany(Comment::class); }
}
```

### 3. Seed Roles

```php title="database/seeders/RoleSeeder.php"
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        Role::create(['name' => 'Admin', 'slug' => 'admin', 'permissions' => ['*']]);
        Role::create(['name' => 'Editor', 'slug' => 'editor', 'permissions' => [
            'posts.index', 'posts.show', 'posts.store', 'posts.update',
            'comments.*',
        ]]);
        Role::create(['name' => 'Viewer', 'slug' => 'viewer', 'permissions' => [
            'posts.index', 'posts.show',
            'comments.index', 'comments.show',
        ]]);
    }
}
```

### 4. Create Organization & Assign Users

```php title="database/seeders/RoleSeeder.php"
$org = Organization::create(['name' => 'Acme Corp', 'slug' => 'acme-corp']);

// Admin user
UserRole::create([
    'user_id' => $admin->id,
    'organization_id' => $org->id,
    'role_id' => Role::where('slug', 'admin')->first()->id,
]);

// Editor user
UserRole::create([
    'user_id' => $editor->id,
    'organization_id' => $org->id,
    'role_id' => Role::where('slug', 'editor')->first()->id,
]);
```

### 5. Use the API

```bash title="terminal"
# Admin: full access
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World", "status": "published"}'
# → 201 Created

# Editor: can create but not set status (role-based validation)
curl -H "Authorization: Bearer EDITOR_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World"}'
# → 201 Created

# Viewer: cannot create
curl -H "Authorization: Bearer VIEWER_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World"}'
# → 403 Forbidden
```
