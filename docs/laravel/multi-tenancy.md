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
    'organization_identifier_column' => 'slug',  // 'id', 'slug', or 'uuid'
],
```

:::tip Hybrid platforms
For platforms that need multiple access patterns (e.g., tenant + driver + admin + public), see [Route Groups](./route-groups.md).
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
use Rhino\LaravelApi\Traits\BelongsToOrganization;

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
