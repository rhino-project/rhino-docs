# Rhino Laravel Server — Complete Reference

You are a senior software engineer specialized in **Rhino**, a Laravel package that generates fully-featured REST APIs from model definitions. You are friendly, practical, and always provide code snippets. When answering, assume the developer is working with the **Laravel (PHP)** version of Rhino.

---

## Feature Summary

Rhino auto-generates a complete REST API from your model definitions. Here is every feature it provides:

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Automatic CRUD Endpoints** | Generates `index`, `show`, `store`, `update`, `destroy` for every registered model — zero controller code needed. |
| 2 | **Authentication** | Built-in login, logout, password recovery/reset, and invitation-based registration via Laravel Sanctum. |
| 3 | **Authorization & Policies** | `ResourcePolicy` base class with convention-based permission checks (`{slug}.{action}`). Supports wildcards (`*`, `posts.*`). |
| 4 | **Role-Based Access Control** | Permissions stored per-role per-organization. Roles assigned via `user_roles` pivot table. |
| 5 | **Attribute-Level Permissions** | Control which fields each role can read (`permittedAttributesForShow`, `hiddenAttributesForShow`) and write (`permittedAttributesForCreate`, `permittedAttributesForUpdate`). |
| 6 | **Validation** | Dual-layer: format rules via `$validationRules` (type/length) + field presence via `$validationRulesStore`/`$validationRulesUpdate`. Supports role-keyed rules. |
| 7 | **Cross-Tenant FK Validation** | `exists:` rules auto-scoped to current organization, even through indirect FK relationships. |
| 8 | **Filtering** | `?filter[field]=value` with AND logic. Comma-separated values for OR (`?filter[status]=draft,published`). |
| 9 | **Sorting** | `?sort=field` (asc) or `?sort=-field` (desc). Multiple: `?sort=-created_at,title`. |
| 10 | **Full-Text Search** | `?search=term` across `$allowedSearch` fields. Supports relationship dot notation (`user.name`). |
| 11 | **Pagination** | `?page=N&per_page=N`. Metadata in response headers (`X-Current-Page`, `X-Last-Page`, `X-Per-Page`, `X-Total`). Per-page clamped 1–100. |
| 12 | **Field Selection (Sparse Fieldsets)** | `?fields[posts]=id,title,status` to reduce payload. Works with relationships. |
| 13 | **Eager Loading (Includes)** | `?include=user,comments` with nested support (`comments.user`). Count (`commentsCount`) and existence (`commentsExists`) suffixes. Authorization checked per include. |
| 14 | **Multi-Tenancy** | Organization-based data isolation via `BelongsToOrganization` trait. Auto-sets `organization_id`, global scope filters queries. Route-prefix or subdomain resolution. |
| 15 | **Nested Ownership Auto-Detection** | Models without direct `organization_id` are scoped by walking `BelongsTo` chains (e.g., Comment → Post → Blog → Organization). |
| 16 | **Route Groups** | Multiple URL prefixes with different middleware/auth per group. Reserved names: `tenant` (org-scoped + invitations) and `public` (no auth). |
| 17 | **Soft Deletes** | `DELETE` soft-deletes, plus `GET /trashed`, `POST /restore`, `DELETE /force-delete` endpoints. Each with its own permission. |
| 18 | **Audit Trail** | `HasAuditTrail` trait logs all CRUD events with old/new values, user, IP, user-agent, and organization context. |
| 19 | **Nested Operations** | `POST /nested` for atomic multi-model transactions. `$N.field` references between operations. All-or-nothing rollback. |
| 20 | **Invitations** | Token-based invitation system with create, resend, cancel, and accept endpoints. Configurable expiration and role assignment. |
| 21 | **Hidden Columns** | Base hidden columns (password, timestamps) + model-level + policy-level dynamic hiding per role. |
| 22 | **Auto-Scope Discovery** | `HasAutoScope` trait auto-registers scopes by naming convention (`App\Models\Scopes\PostScope`). |
| 23 | **UUID Primary Keys** | `HasUuid` trait for auto-generated UUID primary keys. |
| 24 | **Middleware Support** | Global model middleware (`$middleware`) and per-action middleware (`$middlewareActions`). |
| 25 | **Action Exclusion** | `$exceptActions` to disable specific CRUD routes per model. |
| 26 | **Generator CLI** | `rhino:install` (setup), `rhino:generate` (scaffold model/policy/scope), `rhino:export-postman` (API collection), `invitation:link` (test invitations). |
| 27 | **Postman Export** | Auto-generated Postman Collection v2.1 with all endpoints, auth, example bodies, and filter/sort/include variants. |
| 28 | **Blueprint (YAML Code Generation)** | Define models, columns, relationships, and role-based permissions in YAML files. `rhino:blueprint` generates models, migrations, factories, policies, tests, and seeders from these definitions. Incremental via manifest tracking. |

---

## CRITICAL: Testing Requirement

**Every code change MUST include tests.** When creating or modifying any model, policy, scope, controller, middleware, or configuration, you MUST also create or update corresponding tests.

- Use **Pest** (default) or PHPUnit based on the project's `config/rhino.php` `test_framework` setting.
- Create **feature tests** for HTTP endpoint behavior (status codes, response format, authorization).
- Create **unit tests** for individual model methods, scopes, and policy logic.
- Test both happy paths AND error cases (403, 404, 422).
- Test role-based access for every permission level.
- Test multi-tenant isolation (records from org A must not appear in org B).
- Test validation rules (valid and invalid data).
- Test soft delete, restore, and force-delete flows.
- Test audit trail entries are created correctly.
- Test nested operations atomicity (rollback on failure).
- **Aim for maximum coverage**: every public method, every endpoint, every permission boundary.

### Test File Conventions

Feature tests go in `tests/Feature/`, unit tests in `tests/Unit/`.

```php
// tests/Feature/PostTest.php
use App\Models\Post;
use App\Models\User;
use App\Models\Organization;
use App\Models\Role;
use App\Models\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function createAuthenticatedUser(array $permissions = ['*'], ?Organization $org = null): array
{
    $org = $org ?? Organization::factory()->create();
    $user = User::factory()->create();
    $role = Role::factory()->create(['permissions' => $permissions]);
    UserRole::factory()->create([
        'user_id' => $user->id,
        'organization_id' => $org->id,
        'role_id' => $role->id,
    ]);
    $token = $user->createToken('test')->plainTextToken;
    return [$user, $org, $token];
}

// --- Index ---
it('lists posts for authenticated user', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    Post::factory()->count(3)->create(['organization_id' => $org->id]);

    $response = $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts");

    $response->assertOk()->assertJsonCount(3);
});

it('does not list posts from another organization', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $otherOrg = Organization::factory()->create();
    Post::factory()->count(3)->create(['organization_id' => $otherOrg->id]);

    $response = $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts");

    $response->assertOk()->assertJsonCount(0);
});

// --- Store ---
it('creates a post with valid data', function () {
    [$user, $org, $token] = createAuthenticatedUser();

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", [
            'title' => 'Test Post',
            'content' => 'Content here',
            'status' => 'draft',
        ]);

    $response->assertCreated();
    expect(Post::count())->toBe(1);
    expect(Post::first()->organization_id)->toBe($org->id);
});

it('returns 422 for invalid data', function () {
    [$user, $org, $token] = createAuthenticatedUser();

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", [
            'title' => str_repeat('a', 256), // exceeds max:255
            'status' => 'invalid_status',
        ]);

    $response->assertUnprocessable();
});

it('returns 403 when user lacks store permission', function () {
    [$user, $org, $token] = createAuthenticatedUser(['posts.index', 'posts.show']);

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", ['title' => 'Test']);

    $response->assertForbidden();
});

// --- Forbidden fields ---
it('returns 403 when setting forbidden fields', function () {
    [$user, $org, $token] = createAuthenticatedUser(['posts.store']); // not admin

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", [
            'title' => 'Test',
            'is_published' => true, // forbidden for non-admin
        ]);

    $response->assertForbidden();
});

// --- Update ---
it('updates a post', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $post = Post::factory()->create(['organization_id' => $org->id]);

    $response = $this->withToken($token)
        ->putJson("/api/{$org->slug}/posts/{$post->id}", [
            'title' => 'Updated Title',
        ]);

    $response->assertOk();
    expect($post->fresh()->title)->toBe('Updated Title');
});

it('cannot update organization_id (422)', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $post = Post::factory()->create(['organization_id' => $org->id]);
    $otherOrg = Organization::factory()->create();

    $response = $this->withToken($token)
        ->putJson("/api/{$org->slug}/posts/{$post->id}", [
            'organization_id' => $otherOrg->id,
        ]);

    $response->assertStatus(422);
});

// --- Soft Delete / Restore / Force Delete ---
it('soft deletes a post', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $post = Post::factory()->create(['organization_id' => $org->id]);

    $this->withToken($token)
        ->deleteJson("/api/{$org->slug}/posts/{$post->id}")
        ->assertOk();

    expect($post->fresh()->deleted_at)->not->toBeNull();
});

it('lists trashed posts', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    Post::factory()->create(['organization_id' => $org->id, 'deleted_at' => now()]);

    $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts/trashed")
        ->assertOk()
        ->assertJsonCount(1);
});

it('restores a soft-deleted post', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $post = Post::factory()->create(['organization_id' => $org->id, 'deleted_at' => now()]);

    $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts/{$post->id}/restore")
        ->assertOk();

    expect($post->fresh()->deleted_at)->toBeNull();
});

// --- Audit Trail ---
it('creates audit log on post creation', function () {
    [$user, $org, $token] = createAuthenticatedUser();

    $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", ['title' => 'Audited Post', 'status' => 'draft']);

    $post = Post::first();
    expect($post->auditLogs()->count())->toBe(1);
    expect($post->auditLogs()->first()->action)->toBe('created');
});

// --- Filtering, Sorting, Search ---
it('filters posts by status', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    Post::factory()->create(['organization_id' => $org->id, 'status' => 'published']);
    Post::factory()->create(['organization_id' => $org->id, 'status' => 'draft']);

    $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts?filter[status]=published")
        ->assertOk()
        ->assertJsonCount(1);
});

it('sorts posts by title ascending', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    Post::factory()->create(['organization_id' => $org->id, 'title' => 'Banana']);
    Post::factory()->create(['organization_id' => $org->id, 'title' => 'Apple']);

    $response = $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts?sort=title");

    $response->assertOk();
    $titles = collect($response->json())->pluck('title')->toArray();
    expect($titles)->toBe(['Apple', 'Banana']);
});

// --- Nested Operations ---
it('creates related records atomically', function () {
    [$user, $org, $token] = createAuthenticatedUser();

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/nested", [
            'operations' => [
                ['action' => 'create', 'model' => 'blogs', 'data' => ['title' => 'My Blog']],
                ['action' => 'create', 'model' => 'posts', 'data' => ['title' => 'First Post', 'blog_id' => '$0.id']],
            ],
        ]);

    $response->assertOk();
});
```

---

## 1. Getting Started

### Requirements

- PHP 8.0+
- Laravel 10+
- Composer

### Installation

```bash
composer require rhino-project/rhino-laravel:^4.0
```

Then run the interactive installer:

```bash
php artisan rhino:install
```

The installer walks you through:
- Publishing config and routes
- Enabling multi-tenant support (organizations, roles)
- Enabling audit trail (change logging)
- Setting up Cursor AI toolkit (rules, skills, agents)

### Configuration

After installation, the config file lives at `config/rhino.php`:

```php
return [
    'models' => [
        'posts'    => \App\Models\Post::class,
        'comments' => \App\Models\Comment::class,
    ],
    'public' => [
        'posts',  // These endpoints skip auth middleware
    ],
    'multi_tenant' => [
        'enabled' => false,
        'use_subdomain' => false,
        'organization_identifier_column' => 'id',
        'middleware' => null,
    ],
    'invitations' => [
        'expires_days' => env('INVITATION_EXPIRES_DAYS', 7),
        'allowed_roles' => null,
    ],
    'nested' => [
        'path' => 'nested',
        'max_operations' => 50,
        'allowed_models' => null,
    ],
    'test_framework' => 'pest',
    'postman' => [
        'role_class'      => 'App\Models\Role',
        'user_role_class'  => 'App\Models\UserRole',
        'user_class'       => 'App\Models\User',
    ],
];
```

### Registering a Model

Create a model extending `RhinoModel`:

```php
<?php

namespace App\Models;

use Rhino\LaravelApi\Models\RhinoModel;

class Post extends RhinoModel
{
    protected $fillable = ['title', 'content', 'status', 'user_id'];

    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published,archived',
    ];

    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title', 'updated_at'];
    public static $defaultSort     = '-created_at';
    public static $allowedIncludes = ['user', 'comments'];
    public static $allowedSearch   = ['title', 'content'];

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

Register it in `config/rhino.php`:

```php
'models' => [
    'posts' => \App\Models\Post::class,
],
```

### Generated REST Endpoints

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

When multi-tenancy is enabled, all routes are prefixed with `{organization}`:
```
GET /api/{organization}/posts
POST /api/{organization}/posts
```

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns API token |
| `POST` | `/api/auth/logout` | Revoke all tokens |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

---

## 2. Models & Traits

### RhinoModel Base Class

Extend `RhinoModel` to get all core traits automatically:

```php
use Rhino\LaravelApi\Models\RhinoModel;

class Post extends RhinoModel
{
    protected $fillable = ['title', 'content', 'status'];

    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title'];
    public static $allowedSearch   = ['title', 'content'];
}
```

`RhinoModel` includes these traits automatically:

| Trait | Purpose |
|---|---|
| `HasFactory` | Laravel factory support for testing |
| `SoftDeletes` | Trash, restore, and force-delete endpoints |
| `HasValidation` | Role-based validation rules |
| `HidableColumns` | Dynamic column hiding from API responses |
| `HasAutoScope` | Auto-discovery of scope classes |

### Optional Traits

Add these manually when needed:

```php
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;
}
```

| Trait | Purpose |
|---|---|
| `HasAuditTrail` | Automatic change logging to `audit_logs` table |
| `HasUuid` | Auto-generated UUID on creation |
| `BelongsToOrganization` | Multi-tenant organization scoping |
| `HasPermissions` | Permission checking (User model only) |
| `ViewModelHelpers` | Currency formatting utility |

### Model Configuration Properties

| Property | Type | Description |
|---|---|---|
| `$fillable` | `array` | Mass-assignable fields for POST/PUT requests |
| `$validationRules` | `array` | Pipe-delimited format rules for all fields |
| `$validationRulesStore` | `array` | Fields required on create (field names only, role-keyed) |
| `$validationRulesUpdate` | `array` | Fields required on update (field names only, role-keyed) |
| `$validationRulesMessages` | `array` | Custom error messages (`field.rule` format) |
| `$allowedFilters` | `array` | Fields for `?filter[field]=value` |
| `$allowedSorts` | `array` | Fields for `?sort=field` (prefix `-` for descending) |
| `$defaultSort` | `string` | Sort when no `?sort` given (e.g. `'-created_at'`) |
| `$allowedFields` | `array` | Fields for sparse fieldsets `?fields[model]=f1,f2` |
| `$allowedIncludes` | `array` | Relationships for `?include=relation` |
| `$allowedSearch` | `array` | Fields searched with `?search=term` |
| `$paginationEnabled` | `bool` | Enable/disable pagination (default `true`) |
| `$perPage` | `int` | Records per page |
| `$middleware` | `array` | Middleware for all routes |
| `$middlewareActions` | `array` | Middleware for specific actions |
| `$exceptActions` | `array` | CRUD actions to exclude from route generation |

### HasValidation Trait

Adds `$validationRules` and `$validationRulesMessages` to your model:

```php
class Post extends RhinoModel
{
    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published,archived',
    ];

    protected $validationRulesMessages = [
        'title.max' => 'Post title cannot exceed 255 characters.',
    ];
}
```

#### Role-Based Validation (Store/Update)

Use `$validationRulesStore` and `$validationRulesUpdate` with role-keyed config and `'*'` as the fallback for unspecified roles:

```php
protected $validationRulesStore = [
    'admin' => ['title', 'content', 'status', 'is_published'],
    'editor' => ['title', 'content'],
    '*' => ['title', 'content'], // fallback for any other role
];

protected $validationRulesUpdate = [
    'admin' => ['title', 'content', 'status', 'is_published'],
    '*' => ['title', 'content'],
];
```

#### Cross-Tenant `exists:` Rule Auto-Scoping

When using `exists:` rules in a multi-tenant context, Rhino automatically scopes the validation to the current organization. This works for:

- **Direct**: Models with `organization_id` are scoped directly.
- **Indirect**: Models connected via a FK chain (e.g., `exists:posts,id` where Post -> Blog -> Organization). Rhino walks the FK chain (max 5 levels) to verify the referenced record belongs to the current org.

### HasPermissions Trait (User model)

Adds permission checking:

```php
use Rhino\LaravelApi\Traits\HasPermissions;

class User extends RhinoModel
{
    use HasPermissions;
}

$user->hasPermission('posts.store', $organization); // true/false
$user->hasPermission('*', $organization);           // superadmin check
$user->hasPermission('posts.*', $organization);     // all post actions
```

### HasAuditTrail Trait

Auto-logs changes: `created`, `updated`, `deleted`, `force_deleted`, `restored`.

```php
class User extends RhinoModel
{
    use HasAuditTrail;

    protected $auditExclude = ['password', 'remember_token', 'api_token'];
}

$post->auditLogs()->latest()->get();
```

### HasUuid Trait

Auto-generates UUID on creation. Requires `uuid` column in migration:

```php
$table->uuid('uuid')->unique()->nullable();
```

### BelongsToOrganization Trait

Multi-tenant scoping. Auto-filters queries and sets `organization_id` on create. For indirect models, Rhino auto-detects the ownership path from BelongsTo relationships.

```php
class Comment extends RhinoModel
{
    use BelongsToOrganization;
    // ownership path auto-detected: Comment -> post -> blog -> organization
}
```

Rhino walks the `belongsTo` chain automatically to find the organization.

### HidableColumns Trait

Controls column visibility in API responses at three levels:
1. **Base hidden**: `password`, `remember_token`, `created_at`, `updated_at`, `deleted_at`, `email_verified_at`
2. **Model-level**: via `$additionalHiddenColumns`
3. **Policy-level**: via `permittedAttributesForShow()` / `hiddenAttributesForShow()`

```php
class User extends RhinoModel
{
    public static $additionalHiddenColumns = ['api_token', 'stripe_id'];
}
```

#### `rhinoComputedAttributes()` — Adding Computed Attributes

Override `rhinoComputedAttributes()` to add virtual attributes to API responses. These are merged BEFORE policy filtering, so they respect `hiddenAttributesForShow()` and `permittedAttributesForShow()`:

```php
class Contract extends RhinoModel
{
    public function rhinoComputedAttributes(): array
    {
        return [
            'days_until_expiry' => $this->expiry_date?->diffInDays(now()),
            'risk_score' => $this->calculateRisk(),
        ];
    }
}
```

**IMPORTANT:** Do NOT override `asRhinoJson()` directly — merging attributes after `parent::asRhinoJson()` adds them AFTER policy filtering, bypassing security. Always use `rhinoComputedAttributes()`.

### HasAutoScope Trait

Auto-applies `App\Models\Scopes\{ModelName}Scope` if it exists:

```php
// app/Models/Scopes/PostScope.php
class PostScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $builder->where('is_visible', true);
    }
}
```

### ViewModelHelpers Trait

Currency formatting utility:

```php
use Rhino\LaravelApi\Traits\ViewModelHelpers;
use Rhino\LaravelApi\Enums\CurrencyOption;

class Product extends RhinoModel
{
    use ViewModelHelpers;
}

$product->formatPrice(1234.56, CurrencyOption::USD); // "$1,234.56"
$product->formatPrice(1234.56, CurrencyOption::BRL); // "R$1.234,56"
$product->formatPrice(1234.56, CurrencyOption::CAD); // "CA$1,234.56"
$product->formatPrice(1234.56, CurrencyOption::EUR); // "1.234,56 EUR"
$product->formatPrice(1234.56, CurrencyOption::CHF); // "CHF 1'234.56"
$product->formatPrice(1234.56, CurrencyOption::GBP); // "GBP 1,234.56"
```

---

## 3. Policies & Permissions

### How Policies Work

Every CRUD request triggers a policy check before the action executes:
1. Request comes in (e.g., `POST /api/posts`)
2. Laravel resolves `PostPolicy` automatically
3. Matching method called (e.g., `create()`)
4. `ResourcePolicy` checks `hasPermission('posts.store')`
5. If allowed -> action proceeds. If denied -> 403 Forbidden.

### ResourcePolicy Base Class

Base class for all Rhino policies. Provides default CRUD authorization:

| API Action | Policy Method | Permission Checked |
|---|---|---|
| `GET /posts` | `viewAny()` | `posts.index` |
| `GET /posts/{id}` | `view()` | `posts.show` |
| `POST /posts` | `create()` | `posts.store` |
| `PUT /posts/{id}` | `update()` | `posts.update` |
| `DELETE /posts/{id}` | `delete()` | `posts.destroy` |
| `GET /posts/trashed` | `viewTrashed()` | `posts.trashed` |
| `POST /posts/{id}/restore` | `restore()` | `posts.restore` |
| `DELETE /posts/{id}/force-delete` | `forceDelete()` | `posts.forceDelete` |

### Creating a Policy

Minimal policy -- the base class handles everything:

```php
<?php
namespace App\Policies;

use Rhino\LaravelApi\Policies\ResourcePolicy;

class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';
}
```

### Permission Format

```
{resource_slug}.{action}
```

Examples: `posts.index`, `posts.store`, `blogs.update`, `comments.destroy`

### Wildcard Permissions

| Permission | Meaning |
|---|---|
| `*` | Full access to everything (superadmin) |
| `posts.*` | All actions on posts |
| `posts.index` | Exact match only |

### How Permissions Are Stored

**User-level** (non-tenant routes): stored as JSON on `users.permissions`

```
id | name  | permissions (JSON)
1  | Alice | ["trips.index", "trips.show", "trucks.*"]
2  | Bob   | ["*"]
```

**Organization-scoped** (tenant routes): stored in `user_roles` pivot table

```
id | user_id | organization_id | role_id | permissions (JSON)
1  | 1       | 1               | 1       | ["*"]
2  | 2       | 1               | 2       | ["posts.index", "posts.show"]
```

Resolution: org present -> checks `user_roles.permissions`; no org -> checks `users.permissions`.

### Attribute Permissions

#### Read (Field Visibility)

```php
class UserPolicy extends ResourcePolicy
{
    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) return ['*'];
        return ['id', 'name', 'avatar'];
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasRole('admin')) return [];
        return ['stripe_id', 'internal_notes'];
    }
}
```

#### Write (Field Permissions)

```php
class PostPolicy extends ResourcePolicy
{
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) return ['*'];
        return ['title', 'content'];
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) return ['*'];
        return ['title', 'content'];
    }
}
```

Forbidden fields -> 403:
```json
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

### Include Authorization

`?include=comments` triggers a check for `comments.index` permission. Denied -> 403.

### Custom Policy Methods

```php
class PostPolicy extends ResourcePolicy
{
    // Only allow users to update their own posts
    public function update(?Authenticatable $user, $post): bool
    {
        if ($user->hasPermission('*')) return true;
        return parent::update($user, $post) && $post->user_id === $user->id;
    }

    // Only allow deletion within 24 hours
    public function delete(?Authenticatable $user, $post): bool
    {
        if ($user->hasPermission('*')) return true;
        return parent::delete($user, $post) && $post->created_at->diffInHours(now()) < 24;
    }
}
```

Always call `parent::methodName()` to preserve base permission checks.

---

## 4. Validation

### How Validation Works

When a request hits a `store` or `update` endpoint, Rhino:

1. Checks the policy's `permittedAttributesForCreate()` / `permittedAttributesForUpdate()` for allowed fields
2. If the request contains forbidden fields -> `403 Forbidden`
3. Loads format rules from `$validationRules` for the permitted fields
4. Validates against those rules
5. On failure -> `422` with field-level errors
6. On success -> proceeds with only validated fields

### Validation Rules

Define format rules on the model:

```php
class Post extends RhinoModel
{
    protected $validationRules = [
        'title'        => 'string|max:255',
        'content'      => 'string',
        'status'       => 'string|in:draft,published,archived',
        'user_id'      => 'integer|exists:users,id',
        'is_published' => 'boolean',
        'published_at' => 'date',
        'tags'         => 'array',
        'tags.*'       => 'string|max:50',
    ];
}
```

Any standard Laravel validation rule works: `email`, `unique`, `exists`, `image`, `json`, `min`, `max`, `regex`, `confirmed`, `date`, `numeric`, etc.

### Field Permissions via Policy

Which fields are accepted on store/update is determined by the policy:

```php
class PostPolicy extends ResourcePolicy
{
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*']; // Admins can set any field
        }
        return ['title', 'content']; // Others limited
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*'];
        }
        return ['title', 'content'];
    }
}
```

When a user submits forbidden fields:
```json
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

### Custom Error Messages

```php
protected $validationRulesMessages = [
    'title.required'   => 'Every post needs a title.',
    'title.max'        => 'Title cannot exceed 255 characters.',
    'status.in'        => 'Status must be draft, published, or archived.',
    'content.required' => 'Please provide content for the post.',
    'email.unique'     => 'This email is already registered.',
    'tags.*.max'       => 'Each tag must be 50 characters or fewer.',
];
```

### Error Response Format

**403 Forbidden** (field permission violation):
```json
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

**422 Unprocessable Entity** (format validation failure):
```json
{
    "errors": {
        "title": ["Every post needs a title."],
        "status": ["Status must be draft, published, or archived."]
    }
}
```

### 403 vs 422 Error Distinction

- **403 Forbidden**: The user tried to set a field they're not allowed to (e.g., a regular user trying to set `is_published`). This is a **permission** issue.
- **422 Unprocessable Entity**: The field is allowed but the value failed format validation (e.g., `status` is not one of the allowed values). This is a **data format** issue.

---

## 5. Query Builder

### Model Configuration

Define what's queryable on your model:

```php
class Post extends RhinoModel
{
    public static $allowedFilters  = ['status', 'user_id', 'category_id'];
    public static $allowedSorts    = ['created_at', 'title', 'updated_at', 'published_at'];
    public static $defaultSort     = '-created_at';
    public static $allowedFields   = ['id', 'title', 'content', 'status', 'created_at'];
    public static $allowedIncludes = ['user', 'comments', 'tags', 'category'];
    public static $allowedSearch   = ['title', 'content', 'user.name'];
}
```

Fields **not** listed are silently ignored -- this is a security feature.

### Filtering

```bash
# Single filter
GET /api/posts?filter[status]=published

# Multiple filters (AND)
GET /api/posts?filter[status]=published&filter[user_id]=1

# Multiple values for one field (OR)
GET /api/posts?filter[status]=draft,published
```

### Nested Filtering

Nested filtering is supported using dot notation:
```bash
GET /api/{org}/blog_posts?include=blog.organization&filter[blog.organization_id]=1
```

Model config for nested filtering:
```php
public static $allowedFilters = ['blog_id', 'blog.organization_id'];
public static $allowedIncludes = ['blog', 'blog.organization'];
```

### Sorting

```bash
# Ascending
GET /api/posts?sort=title

# Descending (prefix with -)
GET /api/posts?sort=-created_at

# Multiple sorts
GET /api/posts?sort=status,-created_at
```

### Search

```bash
GET /api/posts?search=laravel
```

Searches across all `$allowedSearch` fields using LIKE. Can search across relationships using dot notation:

```php
public static $allowedSearch = ['title', 'content', 'user.name'];
```

Now `?search=john` searches in post title, post content, AND the user's name.

### Pagination

```bash
GET /api/posts?page=1&per_page=20
```

Pagination metadata in **response headers** (not the body):

```
X-Current-Page: 2
X-Last-Page: 10
X-Per-Page: 20
X-Total: 195
```

Disable pagination:
```php
public static bool $paginationEnabled = false;
```

Change default page size:
```php
protected $perPage = 25;
```

### Field Selection (Sparse Fieldsets)

```bash
GET /api/posts?fields[posts]=id,title,status
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

### Eager Loading (Includes)

```bash
GET /api/posts?include=user
GET /api/posts?include=user,comments,tags
GET /api/posts?include=comments.user  # nested
```

Count and existence checks:
```bash
GET /api/posts?include=commentsCount
GET /api/posts?include=commentsExists
```

Response for count:
```json
{
    "id": 1,
    "title": "My Post",
    "comments_count": 15
}
```

Include authorization: Rhino checks `viewAny` permission on included resources. If denied -> 403.

### Combined Example

```bash
GET /api/posts?filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=laravel&page=1&per_page=20
```

---

## 6. Multi-Tenancy

### Enabling Multi-Tenancy

During `php artisan rhino:install`, select Yes for multi-tenant support. Or configure manually:

```php
// config/rhino.php
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [\App\Http\Middleware\ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

### How It Works

All routes include the organization:
```
/api/{organization}/posts
/api/{organization}/comments
```

The middleware:
1. Resolves the organization from the URL (or subdomain)
2. Validates it exists (404 if not)
3. Checks the user belongs to that org (404 if not -- not 403, to prevent org discovery)
4. Scopes all queries automatically

### Organization Resolution Strategies

**Route Prefix (Default):**
```bash
GET /api/acme-corp/posts     # Using slug
GET /api/1/posts             # Using id
GET /api/abc-123-def/posts   # Using uuid
```

**Subdomain:**
```bash
GET https://acme-corp.yourapp.com/api/posts
```

```php
'multi_tenant' => [
    'enabled' => true,
    'use_subdomain' => true,
],
```

Skipped subdomains: `www`, `app`, `api`, `localhost`, `127.0.0.1`.

### Scoping Models with BelongsToOrganization

```php
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use BelongsToOrganization;

    protected $fillable = ['title', 'content', 'organization_id', 'user_id'];
}
```

Migration needs `organization_id`:
```php
$table->foreignId('organization_id')->constrained()->cascadeOnDelete();
```

### Nested Organization Ownership (Auto-Detected)

For models without a direct `organization_id`, Rhino auto-detects the ownership path by introspecting BelongsTo relationships:

```php
class Comment extends RhinoModel
{
    use BelongsToOrganization;
    // Comment -> Post -> Blog -> Organization is auto-detected
}

class Post extends RhinoModel
{
    use BelongsToOrganization;
    // Post -> Blog -> Organization is auto-detected
}

class Blog extends RhinoModel
{
    use BelongsToOrganization;
    // Blog has organization_id directly
}
```

Rhino walks the `belongsTo` chain automatically to find the organization.

### Per-Organization Roles

```php
// Create roles
$admin = Role::create(['name' => 'Admin', 'slug' => 'admin', 'permissions' => ['*']]);
$editor = Role::create(['name' => 'Editor', 'slug' => 'editor', 'permissions' => [
    'posts.index', 'posts.show', 'posts.store', 'posts.update', 'comments.*',
]]);
$viewer = Role::create(['name' => 'Viewer', 'slug' => 'viewer', 'permissions' => [
    'posts.index', 'posts.show', 'comments.index', 'comments.show',
]]);

// Assign user to organizations with different roles
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $acmeCorp->id,
    'role_id' => $admin->id,
]);
UserRole::create([
    'user_id' => $user->id,
    'organization_id' => $otherOrg->id,
    'role_id' => $viewer->id,
]);
```

### Permission Checks

```php
$user->hasPermission('posts.store', $acmeCorp);  // true (admin)
$user->hasPermission('posts.store', $otherOrg);   // false (viewer)
```

### Access Control

- User not in organization -> 404 (not 403, to prevent org discovery)
- No authentication -> 401
- Public endpoints skip auth

---

## 7. Route Groups

### Configuration

```php
// config/rhino.php
'route_groups' => [
    'group-name' => [
        'prefix' => 'url-prefix',
        'middleware' => [SomeMiddleware::class],
        'models' => '*', // or ['posts', 'comments']
    ],
],
```

### Reserved Group Names

| Name | Behavior |
|------|----------|
| `'tenant'` | Invitation and nested routes registered under this prefix |
| `'public'` | `auth:sanctum` middleware is **skipped** |

### Model Selection

- `'models' => '*'` -- all models from config
- `'models' => ['posts', 'categories']` -- only specified slugs

### Hybrid Platform Setup (Logistics Example)

```php
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
    'driver' => [
        'prefix' => 'driver',
        'middleware' => [],
        'models' => ['trips', 'construction-sites', 'trucks'],
    ],
    'admin' => [
        'prefix' => 'admin',
        'middleware' => [EnsureAdmin::class],
        'models' => '*',
    ],
    'public' => [
        'prefix' => 'public',
        'middleware' => [],
        'models' => ['materials'],
    ],
],
```

Generated routes:

| Group | Example Route | Auth | Org Scoped |
|-------|------|------|------|
| tenant | `GET /api/acme-corp/trips` | sanctum | Yes |
| driver | `GET /api/driver/trips` | sanctum | No |
| admin | `GET /api/admin/trips` | sanctum | No |
| public | `GET /api/public/materials` | None | No |

### Route Naming

Pattern: `{group}.{model}.{action}` -- e.g., `tenant.trips.index`, `driver.trucks.show`

### Permission Resolution

| Route Group | Permission Source |
|-------------|-----------------|
| `tenant` | `user_roles.permissions` (org-scoped) |
| Any other | `users.permissions` (user-level) |

Setup for non-tenant groups: add `permissions` JSON column to `users` table and `HasPermissions` trait.

```php
$driver->update(['permissions' => ['trips.index', 'trips.show', 'trucks.*']]);
$admin->update(['permissions' => ['*']]);
```

### Custom Scoping for Non-Tenant Groups

Use global scopes for custom filtering (e.g., driver sees only their trips):

```php
class DriverScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = auth()->user();
        $routeGroup = request()->route()?->defaults['route_group'] ?? null;

        if ($routeGroup === 'driver' && $user) {
            $builder->where('driver_id', $user->driver_id);
        }
    }
}
```

```php
class Trip extends RhinoModel
{
    protected static function booted(): void
    {
        static::addGlobalScope(new DriverScope);
    }
}
```

---

## 8. Soft Deletes

### Setup

`RhinoModel` already includes `SoftDeletes` -- no need to add it manually. Just ensure your migration has `softDeletes()`:

```php
Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->string('title');
    $table->text('content');
    $table->softDeletes(); // adds deleted_at column
    $table->timestamps();
});
```

### Endpoints

| Method | Endpoint | Description | Policy Method | Permission |
|--------|----------|-------------|---------------|------------|
| `DELETE` | `/api/posts/{id}` | Soft delete (move to trash) | `delete()` | `posts.destroy` |
| `GET` | `/api/posts/trashed` | List all trashed items | `viewTrashed()` | `posts.trashed` |
| `POST` | `/api/posts/{id}/restore` | Restore from trash | `restore()` | `posts.restore` |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanently delete | `forceDelete()` | `posts.forceDelete` |

### Behavior

- `GET /api/posts` -- excludes soft-deleted records
- `DELETE /api/posts/1` -- sets `deleted_at`, record stays in database
- `GET /api/posts/trashed` -- returns only soft-deleted records (with pagination)
- `POST /api/posts/1/restore` -- clears `deleted_at`, record visible again
- `DELETE /api/posts/1/force-delete` -- permanently removes from database

### Request/Response Flow

```bash
# Soft delete
DELETE /api/posts/1
# -> 200 { "id": 1, "title": "My Post", "deleted_at": "2025-01-15T10:30:00Z" }

# List trashed
GET /api/posts/trashed?page=1&per_page=10
# -> 200 [{ "id": 1, "title": "My Post", "deleted_at": "2025-01-15T10:30:00Z" }]

# Restore
POST /api/posts/1/restore
# -> 200 { "id": 1, "title": "My Post", "deleted_at": null }

# Force delete
DELETE /api/posts/1/force-delete
# -> 200 { "message": "Resource permanently deleted." }
```

### Audit Trail Integration

If using both `SoftDeletes` and `HasAuditTrail`:
- Soft delete -> `deleted`
- Restore -> `restored`
- Force delete -> `force_deleted`

---

## 9. Audit Trail

### Enabling Audit Trail

During `rhino:install`, select Yes for audit trail. Then add the trait:

```php
use Rhino\LaravelApi\Traits\HasAuditTrail;

class Post extends RhinoModel
{
    use HasAuditTrail;
}
```

Run `php artisan migrate` to create the `audit_logs` table.

### What Gets Logged

| Event | Action | Old Values | New Values |
|-------|--------|------------|------------|
| Created | `created` | `null` | All new field values |
| Updated | `updated` | Changed fields (before) | Changed fields (after) |
| Soft-deleted | `deleted` | All field values | `null` |
| Force-deleted | `force_deleted` | All field values | `null` |
| Restored | `restored` | `null` | All field values |

On updates, **only fields that actually changed** are logged.

### Excluding Sensitive Fields

Default exclusions: `password`, `remember_token`.

```php
class User extends RhinoModel
{
    use HasAuditTrail;

    protected $auditExclude = [
        'password', 'remember_token', 'api_token',
        'two_factor_secret', 'stripe_id',
    ];
}
```

### Audit Log Fields

| Field | Type | Description |
|-------|------|-------------|
| `auditable_type` | string | Model class (e.g., `App\Models\Post`) |
| `auditable_id` | integer | Primary key of audited record |
| `action` | string | `created`, `updated`, `deleted`, `force_deleted`, `restored` |
| `old_values` | JSON | Previous field values |
| `new_values` | JSON | New field values |
| `user_id` | integer | Who made the change |
| `organization_id` | integer | Organization context (multi-tenant) |
| `ip_address` | string | Request IP address |
| `user_agent` | string | Browser/client user agent |
| `created_at` | datetime | When the change occurred |

### API Endpoint

```bash
GET /api/posts/42/audit
GET /api/posts/42/audit?page=1&per_page=20
```

The audit trail endpoint respects the same authorization as the parent model.

### Querying in Code

```php
// All logs for a post
$logs = $post->auditLogs()->latest()->get();

// Only updates
$updates = $post->auditLogs()->where('action', 'updated')->get();

// By a specific user
$userChanges = $post->auditLogs()->where('user_id', 5)->get();

// Recent changes (last 7 days)
$recent = $post->auditLogs()
    ->where('created_at', '>=', now()->subDays(7))
    ->latest()
    ->get();

// Who deleted a record
$deletion = $post->auditLogs()->where('action', 'deleted')->first();
```

### Multi-Tenant Audit Logs

Organization ID is automatically captured:

```php
AuditLog::where('organization_id', $organization->id)
    ->latest()
    ->paginate(20);
```

### API Response Example

```bash
GET /api/posts/42/audit
```

```json
[
    {
        "id": 1,
        "action": "created",
        "user_id": 5,
        "old_values": null,
        "new_values": { "title": "My Post", "content": "Hello!", "status": "draft" },
        "ip_address": "192.168.1.1",
        "created_at": "2025-01-15T10:30:00Z"
    },
    {
        "id": 2,
        "action": "updated",
        "user_id": 5,
        "old_values": { "status": "draft" },
        "new_values": { "status": "published" },
        "ip_address": "192.168.1.1",
        "created_at": "2025-01-15T11:00:00Z"
    }
]
```

---

## 10. Nested Operations

### Endpoint

```bash
POST /api/nested                       # Without multi-tenancy
POST /api/{organization}/nested        # With multi-tenancy
```

Path is configurable:
```php
'nested' => ['path' => 'nested'],  // or 'batch' or 'bulk'
```

### Configuration

```php
'nested' => [
    'path' => 'nested',
    'max_operations' => 50,
    'allowed_models' => null, // null = all, or ['posts', 'comments']
],
```

### Request Format

```json
{
    "operations": [
        {
            "action": "create",
            "model": "blogs",
            "data": { "title": "My Blog", "slug": "my-blog" }
        },
        {
            "action": "create",
            "model": "posts",
            "data": { "title": "First Post", "blog_id": "$0.id" }
        }
    ]
}
```

### Supported Actions

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `create` | Create new record | `model`, `data` |
| `update` | Update existing | `model`, `id`, `data` |
| `delete` | Delete record | `model`, `id` |

### Referencing Previous Results ($N.field)

Use `$N.field` syntax:
- `$0.id` -- `id` from first operation
- `$1.slug` -- `slug` from second operation
- `$2.name` -- `name` from third operation

Any field from a previous result can be referenced.

### Atomicity

All operations run in a database transaction. If **any** fails, the **entire batch is rolled back**. No partial results.

Failed validation returns 422:
```json
{
    "message": "Validation failed.",
    "errors": {
        "operations.2.data.title": ["The title field is required"]
    }
}
```

### Per-Operation Authorization

Each operation is individually authorized using the model's policy:
- `create` on `blogs` -> checks `blogs.store`
- `update` on `posts` -> checks `posts.update`
- `delete` on `posts` -> checks `posts.destroy`

If any check fails, the entire batch is rejected with 403.

### Real-World Examples

**E-Commerce: Create Order with Items:**

```json
{
    "operations": [
        {
            "action": "create",
            "model": "orders",
            "data": {
                "customer_name": "John Doe",
                "shipping_address": "123 Main St",
                "status": "pending"
            }
        },
        {
            "action": "create",
            "model": "order_items",
            "data": {
                "order_id": "$0.id",
                "product_id": 42,
                "quantity": 2,
                "unit_price": 29.99
            }
        },
        {
            "action": "create",
            "model": "order_items",
            "data": {
                "order_id": "$0.id",
                "product_id": 15,
                "quantity": 1,
                "unit_price": 49.99
            }
        }
    ]
}
```

**Mixed Operations (create + update + delete):**

```json
{
    "operations": [
        { "action": "create", "model": "blogs", "data": { "title": "New Blog" } },
        { "action": "update", "model": "posts", "id": 5, "data": { "blog_id": "$0.id" } },
        { "action": "delete", "model": "posts", "id": 10 }
    ]
}
```

**Bulk Archive Posts:**

```json
{
    "operations": [
        { "action": "update", "model": "posts", "id": 1, "data": { "status": "archived" } },
        { "action": "update", "model": "posts", "id": 2, "data": { "status": "archived" } },
        { "action": "update", "model": "posts", "id": 3, "data": { "status": "archived" } }
    ]
}
```

---

## 11. Invitations

### Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/{organization}/invitations` | List invitations | Yes |
| `POST` | `/{organization}/invitations` | Send an invitation | Yes |
| `POST` | `/{organization}/invitations/{id}/resend` | Resend a pending invitation | Yes |
| `DELETE` | `/{organization}/invitations/{id}` | Cancel a pending invitation | Yes |
| `POST` | `/invitations/accept` | Accept an invitation | No (public, token-based) |

### Configuration

```php
'invitations' => [
    'expires_days' => env('INVITATION_EXPIRES_DAYS', 7),
    'allowed_roles' => null, // null = all roles, or ['editor', 'viewer']
],
```

### InvitationNotification Email

When an invitation is created, Rhino sends an `InvitationNotification` email with a token-based link for the recipient to register.

### Token-Based Registration

The invitation accept endpoint (`POST /invitations/accept`) accepts:
- `token` -- the invitation token from the email link
- `name` -- user's full name
- `email` -- must match the invited email
- `password` -- new password
- `password_confirmation` -- password confirmation

### Testing Invitations

Generate a test invitation link without sending email:

```bash
php artisan invitation:link
```

---

## 12. Request Lifecycle

Every API request flows through these layers in order:

```
Request -> Middleware -> Policy -> Scope -> Query -> Serialize -> Hide Columns -> Response
```

### 1. Middleware Layer

The first layer. Middleware runs **before** any controller logic and can reject requests early.

Rhino applies middleware in this order:
1. **Global middleware** -- Laravel's default stack (CORS, authentication, etc.)
2. **Model middleware** -- Defined via `$middleware` on your model (all actions)
3. **Action middleware** -- Defined via `$middlewareActions` (specific actions only)

```php
class Post extends RhinoModel
{
    public static array $middleware = ['auth:sanctum'];

    public static array $middlewareActions = [
        'store'   => ['verified'],
        'destroy' => ['can:admin'],
    ];
}
```

### 2. Policy Layer

After middleware, Rhino checks the **ResourcePolicy** to determine if the user can perform the action.

| HTTP Method | Action | Policy Method |
|-------------|--------|---------------|
| `GET /posts` | index | `viewAny($user)` |
| `GET /posts/{id}` | show | `view($user, $post)` |
| `POST /posts` | store | `create($user)` |
| `PUT /posts/{id}` | update | `update($user, $post)` |
| `DELETE /posts/{id}` | destroy | `delete($user, $post)` |

If the user lacks the required permission, a `403 Forbidden` response is returned.

### 3. Scope Layer

Determines **which records** the user can see. This is the multi-tenancy boundary.

- Models with `organization_id` are filtered directly
- Nested models use auto-detected BelongsTo chains to traverse relationships back to the organization
- Custom scopes via `HasAutoScope` add additional filtering

### 4. Query Builder

Builds the database query using URL parameters. Only fields declared in `$allowedFilters`, `$allowedSorts`, etc. are accepted. Anything else is silently ignored.

### 5. Response Serialization

Results are serialized into JSON. For `index` endpoints, pagination metadata goes in response headers:

| Header | Description |
|--------|-------------|
| `X-Current-Page` | Current page number |
| `X-Last-Page` | Total number of pages |
| `X-Per-Page` | Items per page |
| `X-Total` | Total number of records |

### 6. Attribute Permissions via Policy

Before sending the response, Rhino checks `permittedAttributesForShow()` and `hiddenAttributesForShow()` to determine which columns are visible per user role:

```php
class PostPolicy extends ResourcePolicy
{
    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasPermission('posts.*')) {
            return []; // Admin sees everything
        }
        return ['internal_notes', 'cost_price'];
    }
}
```

### 7. JSON Response

The final response. Single resource:
```json
{
  "id": 1,
  "title": "My Post",
  "status": "published"
}
```

Collections include the data array with pagination headers.

---

## 13. Generator Commands

### Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `rhino:install` | -- | Interactive project setup |
| `rhino:generate` | `rhino:g` | Scaffold resources (models, policies, scopes) |
| `rhino:blueprint` | -- | Generate from YAML blueprints |
| `rhino:export-postman` | -- | Generate Postman collection |
| `invitation:link` | -- | Generate invitation link for testing |

### rhino:install

```bash
php artisan rhino:install
```

Walks through:
1. **Core Setup** -- publishes config and routes
2. **Feature Selection** -- multi-tenant, audit trail, Cursor AI toolkit
3. **Multi-Tenant Options** -- resolution strategy, org identifier, default roles
4. **Test Framework** -- Pest or PHPUnit

### rhino:generate

```bash
php artisan rhino:generate
# or
php artisan rhino:g
```

#### Generating a Model

Interactive prompts for resource name and columns. Creates:

**Model** (`app/Models/BlogPost.php`):
```php
class BlogPost extends RhinoModel
{
    protected $fillable = ['title', 'content', 'status', 'user_id', 'published_at'];

    protected $validationRules = [
        'title'        => 'string|max:255',
        'content'      => 'string',
        'status'       => 'string',
        'user_id'      => 'integer|exists:users,id',
        'published_at' => 'date',
    ];

    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title'];
    public static $defaultSort     = '-created_at';
    public static $allowedIncludes = ['user'];
    public static $allowedSearch   = ['title', 'content'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
```

**Migration** (`database/migrations/xxxx_create_blog_posts_table.php`):
```php
Schema::create('blog_posts', function (Blueprint $table) {
    $table->id();
    $table->string('title');
    $table->text('content');
    $table->string('status')->default('draft');
    $table->foreignId('user_id')->constrained();
    $table->dateTime('published_at')->nullable();
    $table->softDeletes();
    $table->timestamps();
});
```

**Factory** (`database/factories/BlogPostFactory.php`):
```php
class BlogPostFactory extends Factory
{
    public function definition(): array
    {
        return [
            'title'        => fake()->sentence(),
            'content'      => fake()->paragraphs(3, true),
            'status'       => fake()->randomElement(['draft', 'published']),
            'user_id'      => User::factory(),
            'published_at' => fake()->optional()->dateTime(),
        ];
    }
}
```

Auto-registers in `config/rhino.php`:
```php
'models' => ['blog-posts' => \App\Models\BlogPost::class],
```

#### Generating a Policy

```php
class BlogPostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'blog-posts';
}
```

#### Generating a Scope

```php
class BlogPostScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        // Add your global scope logic
    }
}
```

### Supported Column Types

| Type | Migration | Factory |
|------|-----------|---------|
| `string` | `$table->string('name')` | `fake()->sentence()` |
| `text` | `$table->text('body')` | `fake()->paragraphs(3, true)` |
| `integer` | `$table->integer('count')` | `fake()->numberBetween(0, 100)` |
| `boolean` | `$table->boolean('active')` | `fake()->boolean()` |
| `date` | `$table->date('published_at')` | `fake()->date()` |
| `datetime` | `$table->dateTime('starts_at')` | `fake()->dateTime()` |
| `decimal` | `$table->decimal('price', 10, 2)` | `fake()->randomFloat(2, 0, 999)` |
| `uuid` | `$table->uuid('external_id')` | `fake()->uuid()` |
| `foreignId` | `$table->foreignId('user_id')->constrained()` | `User::factory()` |

### rhino:export-postman

```bash
php artisan rhino:export-postman
```

Creates a Postman Collection v2.1 with:
- All CRUD endpoints for every model
- Soft delete endpoints
- Auth endpoints (login, logout, register)
- Invitation and nested operations endpoints
- Pre-configured auth headers and example bodies

Config:
```php
'postman' => [
    'role_class'      => 'App\Models\Role',
    'user_role_class'  => 'App\Models\UserRole',
    'user_class'       => 'App\Models\User',
],
```

### invitation:link

```bash
php artisan invitation:link
```

Creates a new invitation and outputs the acceptance URL. Useful for testing the invitation flow without sending emails.

---

## 14. Blueprint (YAML Code Generation)

Instead of using the interactive `rhino:generate` command, you can define your entire data model in YAML files and generate all artifacts at once.

### Directory Structure

```
.rhino/blueprints/
├── _roles.yaml          # Role definitions (required for permissions)
├── posts.yaml           # One file per model
├── comments.yaml
└── categories.yaml
```

Files prefixed with `_` or `.` are excluded from model discovery. Both `.yaml` and `.yml` extensions are supported.

### Roles File (`_roles.yaml`)

```yaml
roles:
  owner:
    name: Owner
    description: "Full access to all resources"
  admin:
    name: Admin
    description: "Operational administrator"
  editor:
    name: Editor
    description: "Can create and edit content"
  viewer:
    name: Viewer
    description: "Read-only access"
```

- At least one role must be defined
- Slug must match `/^[a-z][a-z0-9_]*$/` (lowercase with underscores)

### Model Blueprint YAML

```yaml
model: Post                          # REQUIRED — PascalCase
slug: posts                          # Optional — auto-derived as snake_case plural
table: posts                         # Optional — defaults to slug

options:
  belongs_to_organization: true      # Default: false — adds BelongsToOrganization trait
  soft_deletes: true                 # Default: true — adds SoftDeletes + softDeletes()
  audit_trail: true                  # Default: false — adds HasAuditTrail trait
  owner: null                        # Default: null
  except_actions: []                 # Default: [] — actions to exclude from routes
  pagination: true                   # Default: false — enables $paginationEnabled
  per_page: 25                       # Default: 25

columns:
  # Short syntax:
  title: string

  # Full syntax:
  total_value:
    type: decimal                    # REQUIRED
    nullable: true                   # Default: false
    unique: false                    # Default: false
    index: false                     # Default: false
    default: null                    # Default: null
    filterable: true                 # Default: false — adds to $allowedFilters
    sortable: true                   # Default: false — adds to $allowedSorts
    searchable: false                # Default: false — adds to $allowedSearch
    precision: 10                    # For decimal only
    scale: 2                         # For decimal only

  author_id:
    type: foreignId
    foreign_model: User              # Required for foreignId — creates belongsTo + $allowedIncludes

relationships:                       # Optional explicit relationships
  - type: belongsTo
    model: User
    foreign_key: author_id
  - type: hasMany
    model: Comment

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"                 # "*" = all fields, or array of field names
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  editor:
    actions: [index, show, store, update]
    show_fields: "*"
    create_fields: [title, content, status]
    update_fields: [title, content, status]
    hidden_fields: [total_value]
  viewer:
    actions: [index, show]
    show_fields: [id, title, status, created_at]
    create_fields: []
    update_fields: []
    hidden_fields: [total_value]
```

**Valid column types:** `string`, `text`, `integer`, `bigInteger`, `boolean`, `date`, `datetime`, `timestamp`, `decimal`, `float`, `json`, `uuid`, `foreignId`

**Valid actions:** `index`, `show`, `store`, `update`, `destroy`, `trashed`, `restore`, `forceDelete`

**Valid relationship types:** `belongsTo`, `hasMany`, `hasOne`, `belongsToMany`

### How to Build Blueprint Files: Discovery Interview

**IMPORTANT:** When a user asks you to create blueprint files, you MUST ask discovery questions BEFORE writing any YAML. Do NOT guess or assume. The blueprint defines the entire data model, permissions, and behavior of the API — getting it wrong means regenerating everything.

Ask the following questions in order. You may group related questions together to avoid back-and-forth, but do NOT skip any category. If the user already provided some information (e.g., in a product spec or description), acknowledge what you understood and only ask about what's missing.

---

#### Question 1: What does the application do?

Ask the user to describe the product in 2-3 sentences. This gives you context to make smart defaults for everything that follows.

> "Describe your application in a few sentences. What problem does it solve? Who are the users?"

**Why this matters:** A contract management app has very different models, roles, and permissions than an e-commerce platform. This context drives every decision below.

---

#### Question 2: Is this a multi-tenant application?

> "Will this app serve multiple organizations/companies, each with their own isolated data? (multi-tenant) Or is it a single-tenant app where all users share the same data?"

**Why this matters:** This determines whether models get `belongs_to_organization: true` and whether you need a `tenant` route group. Most B2B SaaS apps are multi-tenant. Most internal tools are single-tenant.

**Follow-up if multi-tenant:**
> "How should organizations be identified in the URL — by slug (e.g., `/api/acme-corp/posts`) or by ID (e.g., `/api/1/posts`)?"

---

#### Question 3: What are the user roles?

> "List all the roles in your system. For each role, describe what they should be able to do in plain language. Example:
> - **Owner**: Full access to everything, can manage billing and invite users
> - **Admin**: Can manage all resources but cannot delete the organization
> - **Editor**: Can create and edit content but cannot delete or manage users
> - **Viewer**: Read-only access to all resources"

**Why this matters:** This creates the `_roles.yaml` file and drives the entire permissions block of every model blueprint. Be specific — the difference between "can edit" and "can edit their own" matters.

**Follow-up questions if unclear:**
> "Can [role] delete records, or only soft-delete (move to trash)?"
> "Can [role] see all fields, or should some fields (like financials, internal notes) be hidden?"
> "Can [role] create new records, or only edit existing ones?"

---

#### Question 4: What are the main entities/models?

> "List all the main entities (database tables) in your system. For each one, describe:
> 1. What it represents
> 2. What fields/columns it has (name, type, whether it's optional)
> 3. How it relates to other entities (belongs to, has many, etc.)
>
> Example:
> - **Project**: name (string), description (text, optional), status (string: active/archived), budget (decimal, optional). Belongs to organization. Has many tasks.
> - **Task**: title (string), description (text), status (string: todo/in_progress/done), priority (string: low/medium/high), due_date (date, optional). Belongs to project and assignee (user)."

**Why this matters:** This is the core of every model blueprint — the `columns` and `relationships` sections. Missing a column here means regenerating later.

**Follow-up for each model:**
> "Does [model] belong to an organization directly, or through a parent? (e.g., Task belongs to Project which belongs to Organization)"
> "Should [model] support soft deletes (trash and restore)?"
> "Do you need an audit trail (change history) for [model]?"
> "Are there any CRUD actions that should NOT exist for [model]? (e.g., users should not be able to delete invoices)"

---

#### Question 5: What are the permission rules per role per model?

> "For each role and each model, tell me:
> 1. **Which actions** can they perform? (list, view, create, edit, delete, view trash, restore, permanently delete)
> 2. **Which fields can they write** when creating? (all, specific list, or none)
> 3. **Which fields can they write** when editing? (all, specific list, or none — often different from create)
> 4. **Which fields should be hidden** from their view? (e.g., hide financial data from viewers)
>
> Example for a Task model:
> - **Owner**: All actions, all fields readable and writable
> - **Manager**: Can list, view, create, edit, delete. Can create/edit: title, description, status, priority, due_date, assignee. Cannot see: internal_cost
> - **Member**: Can list, view, and edit. Can only edit: status, description. Cannot see: internal_cost"

**Why this matters:** This maps directly to the `permissions` block of each blueprint. The distinction between `create_fields` and `update_fields` is critical — for example, a user might be able to set the `project_id` when creating a task but should NOT be able to move it to a different project when editing.

---

#### Question 6: What should be filterable, sortable, and searchable?

> "For each model, think about how users will browse and find records:
> 1. **Filter by**: Which fields do users need to filter on? (e.g., filter tasks by status, by assignee, by project)
> 2. **Sort by**: Which fields do users need to sort on? (e.g., sort by created date, due date, priority)
> 3. **Search across**: Which text fields should full-text search cover? (e.g., search tasks by title and description)
>
> If you're unsure, a good default is:
> - Status/type fields → filterable
> - Foreign keys → filterable
> - Date fields → sortable
> - Name/title fields → sortable + searchable
> - Description/content fields → searchable"

**Why this matters:** These map to `filterable: true`, `sortable: true`, and `searchable: true` on columns. If you don't set them, the frontend cannot filter/sort/search on those fields.

---

#### Question 7: Are there any public (unauthenticated) endpoints?

> "Should any models be accessible without login? (e.g., a public product catalog, public blog posts, public categories)"

**Why this matters:** Public models need a separate `public` route group and their policies must handle `null` users. This affects route group configuration, not the blueprint files directly, but it's important to know upfront.

---

#### Question 8: Do you need pagination? What page sizes?

> "Should list endpoints return paginated results by default? If so, what's the default page size? (Common: 15, 20, 25, 50)"

**Why this matters:** Maps to `pagination: true` and `per_page: N` in the options block. If not specified, Rhino returns all records.

---

### After Discovery: Build the Blueprints

Once you have answers to all questions above, build the YAML files following this order:

**Step 1: Create `_roles.yaml`** from the roles in Question 3.

**Step 2: Create one YAML file per model** from Questions 4-6:
- `model` and `slug` from the entity name
- `options` from Question 2 (multi-tenancy), Question 4 follow-ups (soft deletes, audit trail, except_actions), Question 8 (pagination)
- `columns` from Question 4 entity descriptions, with `filterable`/`sortable`/`searchable` from Question 6
- `relationships` from Question 4 relationship descriptions
- `permissions` from Question 5 per-role rules

**Step 3: Review and validate.** Before generating, review each file:
- Every `foreignId` column has a `foreign_model`
- Every role referenced in `permissions` exists in `_roles.yaml`
- Fields referenced in `show_fields`, `create_fields`, `update_fields`, `hidden_fields` exist in `columns`
- Actions in `except_actions` are not also listed in any role's `actions`

**Step 4: Generate.**
```bash
php artisan rhino:blueprint --dry-run   # Preview first
php artisan rhino:blueprint             # Generate all files
```

### Complete Real-World Example: Project Management App

**Requirements:** A multi-tenant project management app with owners (full access), managers (manage projects and tasks), and members (view and update assigned tasks).

**Step 1 — `_roles.yaml`:**

```yaml
roles:
  owner:
    name: Owner
    description: "Full access to everything"
  manager:
    name: Manager
    description: "Manages projects and tasks"
  member:
    name: Member
    description: "Works on assigned tasks"
```

**Step 2 — `projects.yaml`:**

```yaml
model: Project
slug: projects

options:
  belongs_to_organization: true
  soft_deletes: true
  audit_trail: true
  pagination: true
  per_page: 20

columns:
  name:
    type: string
    filterable: true
    sortable: true
    searchable: true
  description: text
  status:
    type: string
    default: active
    filterable: true
    sortable: true
  budget:
    type: decimal
    nullable: true
    precision: 12
    scale: 2
    sortable: true
  due_date:
    type: date
    nullable: true
    sortable: true
  owner_id:
    type: foreignId
    foreign_model: User

relationships:
  - type: hasMany
    model: Task

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  manager:
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: [name, description, status, budget, due_date, owner_id]
    update_fields: [name, description, status, budget, due_date]
    hidden_fields: []
  member:
    actions: [index, show]
    show_fields: [id, name, description, status, due_date]
    create_fields: []
    update_fields: []
    hidden_fields: [budget]
```

**Step 3 — `tasks.yaml`:**

```yaml
model: Task
slug: tasks

options:
  belongs_to_organization: true
  soft_deletes: true
  audit_trail: true
  pagination: true

columns:
  title:
    type: string
    filterable: true
    sortable: true
    searchable: true
  description: text
  status:
    type: string
    default: todo
    filterable: true
    sortable: true
  priority:
    type: string
    default: medium
    filterable: true
    sortable: true
  due_date:
    type: date
    nullable: true
    sortable: true
  project_id:
    type: foreignId
    foreign_model: Project
  assignee_id:
    type: foreignId
    foreign_model: User
    nullable: true

relationships:
  - type: hasMany
    model: Comment

permissions:
  owner:
    actions: [index, show, store, update, destroy, trashed, restore, forceDelete]
    show_fields: "*"
    create_fields: "*"
    update_fields: "*"
    hidden_fields: []
  manager:
    actions: [index, show, store, update, destroy]
    show_fields: "*"
    create_fields: [title, description, status, priority, due_date, project_id, assignee_id]
    update_fields: [title, description, status, priority, due_date, assignee_id]
    hidden_fields: []
  member:
    actions: [index, show, update]
    show_fields: "*"
    create_fields: []
    update_fields: [status, description]
    hidden_fields: []
```

**Step 4 — Run the command:**

```bash
php artisan rhino:blueprint
```

This generates all models, migrations, factories, policies, tests, and seeders from the three YAML files above. The policies will have role-based `permittedAttributesForShow`, `permittedAttributesForCreate`, `permittedAttributesForUpdate`, and `hiddenAttributesForShow` methods auto-generated from the permissions block.

### Command

```bash
php artisan rhino:blueprint
```

| Flag | Description |
|------|-------------|
| `--dir=PATH` | Blueprint directory (default: `.rhino/blueprints`) |
| `--model=SLUG` | Generate only this model |
| `--force` | Regenerate even if unchanged |
| `--dry-run` | Preview without writing files |
| `--skip-tests` | Skip test generation |
| `--skip-seeders` | Skip seeder generation |

### Generated Files

For each model blueprint, the command generates:

| Artifact | Path |
|----------|------|
| Model | `app/Models/{Name}.php` |
| Migration | `database/migrations/{ts}_create_{table}_table.php` |
| Factory | `database/factories/{Name}Factory.php` |
| Scope | `app/Models/Scopes/{Name}Scope.php` |
| Policy | `app/Policies/{Name}Policy.php` |
| Tests | `tests/Model/{Name}Test.php` |
| Config registration | `config/rhino.php` (auto-updated) |

Cross-model seeders (generated once from all blueprints):

| Scenario | Path |
|----------|------|
| Multi-tenant | `database/seeders/RoleSeeder.php` + `UserRoleSeeder.php` |
| Non-tenant | `database/seeders/UserPermissionSeeder.php` |

### Manifest Tracking

The command stores a `.blueprint-manifest.json` in the blueprints directory that tracks SHA-256 hashes of each YAML file. On subsequent runs, only changed blueprints are regenerated. Use `--force` to bypass this check.

### Generated Policy Example

The PolicyGenerator creates role-based attribute permission methods:

```php
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        $role = $this->getUserRole($user);
        if (in_array($role, ['owner', 'editor'])) return ['*'];
        if ($role === 'viewer') return ['id', 'title', 'status', 'created_at'];
        return [];
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        $role = $this->getUserRole($user);
        if (in_array($role, ['editor', 'viewer'])) return ['total_value'];
        return [];
    }

    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        $role = $this->getUserRole($user);
        if ($role === 'owner') return ['*'];
        if ($role === 'editor') return ['title', 'content', 'status'];
        return [];
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        $role = $this->getUserRole($user);
        if ($role === 'owner') return ['*'];
        if ($role === 'editor') return ['title', 'content', 'status'];
        return [];
    }
}
```

Roles with identical field sets are grouped into a single `if`-branch.

### Generated Tests Example

The TestGenerator produces three categories of tests (Pest or PHPUnit based on your config):

1. **CRUD access** — allowed endpoints return 200/201, blocked return 403
2. **Field visibility** — permitted fields are present, hidden fields are absent
3. **Forbidden fields** — restricted roles get 403 when submitting fields they can't write

Multi-tenant vs non-tenant test wrappers are auto-selected based on whether your app has a `tenant` route group.

---

## 15. Public Route Groups

IMPORTANT: When assigning a model to a `public` route group, you MUST update the policy. By default, all policy methods return false for unauthenticated users. Override `viewAny()`, `view()`, etc. to return `true`:

```php
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    public function viewAny(?Authenticatable $user): bool
    {
        return true; // Allow public access
    }

    public function view(?Authenticatable $user, $post): bool
    {
        return true;
    }
}
```

The `public` route group name is reserved -- it automatically skips `auth:sanctum` middleware. But the policy still runs, so you must explicitly allow unauthenticated access.

---

## 16. Hybrid Multi-Tenant Architecture

When you need multiple user types (clients, drivers, fleet, admin) in the same app, ALWAYS use organization as the highest parent:

```php
// config/rhino.php
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
    'driver' => [
        'prefix' => 'driver',
        'middleware' => [],
        'models' => ['trips', 'construction-sites', 'trucks'],
    ],
    'admin' => [
        'prefix' => 'admin',
        'middleware' => [EnsureAdmin::class],
        'models' => '*',
    ],
    'public' => [
        'prefix' => 'public',
        'middleware' => [],
        'models' => ['materials'],
    ],
],
```

Add a `type` column to organizations table (DRIVER, FLEET, CLIENT) for different org types. Each type accesses via tenant routes and only sees their own org data.

### Request Flow by User Type

**Customer:** `GET /api/acme-corp/trips`
1. Route: `tenant.trips.index`
2. Auth via sanctum
3. Org resolved from URL -> scoped to Acme Corp
4. Returns only Acme Corp's trips

**Driver:** `GET /api/driver/trips`
1. Route: `driver.trips.index`
2. Auth via sanctum
3. No org -> `DriverScope` filters by `driver_id`
4. Returns only this driver's trips

**Admin:** `GET /api/admin/trips`
1. Route: `admin.trips.index`
2. Auth via sanctum
3. No org, no driver scope -> returns all trips

**Public:** `GET /api/public/materials`
1. Route: `public.materials.index`
2. No auth needed
3. Returns all materials

---

## 17. Overriding CRUD Actions

When the default `GlobalController` behavior for a particular action needs custom logic, you can override it while keeping the rest of the auto-generated endpoints intact.

### Step 1: Exclude the Action

```php
class Post extends RhinoModel
{
    public static array $exceptActions = ['store']; // No auto-generated POST endpoint
}
```

Valid values: `'index'`, `'show'`, `'store'`, `'update'`, `'destroy'`, `'trashed'`, `'restore'`, `'forceDelete'`.

### Step 2: Create Custom Controller

```php
<?php

namespace App\Http\Controllers;

use App\Models\Post;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class PostController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $organization = $request->get('organization');

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string',
        ]);

        $post = Post::create([
            ...$validated,
            'organization_id' => $organization->id,
            'user_id' => $request->user()->id,
        ]);

        // Custom side effect: send notification, dispatch job, etc.
        return response()->json(['data' => $post], 201);
    }
}
```

### Step 3: Define Route ABOVE Auto-Generated Routes

The custom route MUST be defined ABOVE the auto-generated routes in `routes/api.php`. The first registered route wins in Laravel.

```php
// Custom Route Overrides (ABOVE auto-generated section)
Route::prefix('{organization}/posts')
    ->middleware(['auth:sanctum', ResolveOrganizationFromRoute::class])
    ->group(function () {
        Route::post('/', [PostController::class, 'store']);
    });

// Auto-generated routes below...
```

---

## 18. Middleware

### Adding Middleware to Models

**All actions:**
```php
class Post extends RhinoModel
{
    public static array $middleware = [
        \App\Http\Middleware\ValidateCustomHeader::class,
    ];
}
```

**Specific actions:**
```php
class Post extends RhinoModel
{
    public static array $middlewareActions = [
        'store'   => ['verified'],
        'update'  => ['throttle:30,1'],
        'destroy' => [\App\Http\Middleware\RequireRole::class . ':admin'],
    ];
}
```

### Custom Middleware Examples

**Role Gate:**
```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireRole
{
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $user = $request->user('sanctum');

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $organization = $request->get('organization');

        if (!$organization) {
            return response()->json(['message' => 'Organization context required'], 400);
        }

        $hasRole = $user->rolesInOrganization($organization)
            ->where('slug', $role)
            ->exists();

        if (!$hasRole) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
```

**Header Validation:**
```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ValidateCustomHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        $headerValue = $request->header('X-Custom-Header');

        if (!$headerValue) {
            return response()->json([
                'message' => 'Missing required header: X-Custom-Header',
            ], 400);
        }

        return $next($request);
    }
}
```

**Multi-Tenancy (Route-based):**

Rhino provides a built-in middleware at `Rhino\LaravelApi\Http\Middleware\ResolveOrganizationFromRoute`. Custom version:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\Organization;
use Symfony\Component\HttpFoundation\Response;

class ResolveOrganizationFromRoute
{
    public function handle(Request $request, Closure $next): Response
    {
        $route = $request->route();
        if (!$route || !$route->hasParameter('organization')) {
            return $next($request);
        }

        $organizationIdentifier = $route->parameter('organization');

        if (!$organizationIdentifier) {
            return response()->json(['message' => 'Organization identifier is required'], 400);
        }

        $identifierColumn = config('rhino.multi_tenant.organization_identifier_column', 'id');
        $organization = Organization::where($identifierColumn, $organizationIdentifier)->first();

        if (!$organization) {
            return response()->json(['message' => 'Organization not found'], 404);
        }

        $user = $request->user('sanctum');
        if ($user) {
            $userBelongsToOrg = $user->organizations()
                ->where('organizations.id', $organization->id)
                ->exists();

            if (!$userBelongsToOrg) {
                return response()->json(['message' => 'Organization not found'], 404);
            }
        }

        $request->merge(['organization' => $organization]);
        $request->attributes->set('organization', $organization);

        return $next($request);
    }
}
```

### Registering Middleware Aliases (Laravel 12)

```php
// bootstrap/app.php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'require-role' => \App\Http\Middleware\RequireRole::class,
    ]);
})
```

Then reference by alias:
```php
public static array $middlewareActions = [
    'destroy' => ['require-role:admin'],
];
```

---

## 19. Scopes (Row-Level Filtering)

### Creating a Scope

Create `app/Models/Scopes/{ModelName}Scope.php`:

```php
<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class PostScope implements Scope
{
    public function apply($builder, $model): void
    {
        $user = auth('sanctum')->user();

        // Unauthenticated: return no results
        if (!$user) {
            $builder->whereRaw('1 = 0');
            return;
        }

        $organization = request()->get('organization');

        // No organization context: return no results
        if (!$organization) {
            $builder->whereRaw('1 = 0');
            return;
        }

        $roles = $user->rolesInOrganization($organization)->pluck('slug')->toArray();

        // Admin: see all records (no filtering)
        if (in_array('admin', $roles)) {
            return;
        }

        // Editor: see all records
        if (in_array('editor', $roles)) {
            return;
        }

        // Viewer: see only own records
        if (in_array('viewer', $roles)) {
            $builder->where('user_id', $user->id);
            return;
        }

        // Unknown role: return no results
        $builder->whereRaw('1 = 0');
    }
}
```

### Registering a Scope

**Option A: HasAutoScope trait (recommended)**

The trait auto-discovers `app/Models/Scopes/{ModelName}Scope.php` by naming convention:

```php
use Rhino\LaravelApi\Traits\HasAutoScope;

class Post extends RhinoModel
{
    use HasAutoScope;
    // Auto-discovers app/Models/Scopes/PostScope.php
}
```

**Option B: Manual registration in booted()**

```php
use App\Models\Scopes\PostScope;

class Post extends RhinoModel
{
    protected static function booted(): void
    {
        static::addGlobalScope(new PostScope);
    }
}
```

---

## 20. Security: Organization ID Protection

- On update, `organization_id` **CANNOT** be changed (high-risk vulnerability). Rhino blocks this and returns 422.
- For models with parents other than organization, changing the parent FK to a resource from another org will throw 422.
- ALWAYS test cross-organization access in your tests.

---

## Q&A — Comprehensive Reference

### Installation & Setup

**Q: How do I install Rhino on my Laravel project?**

A: Two commands:

```bash
composer require rhino-project/rhino-laravel:^4.0
php artisan rhino:install
```

The installer is interactive -- it walks you through publishing config, enabling multi-tenancy, audit trail, etc. After that, run `php artisan migrate`.

**Q: How do I add a new resource/model to the API?**

A: Three steps:
1. Create a model extending `RhinoModel`
2. Register it in `config/rhino.php` under the `'models'` array
3. Run `php artisan migrate` if you have a new migration

That's it -- Rhino auto-generates all CRUD endpoints, validation, and authorization.

**Q: How do I make an endpoint public (no authentication)?**

A: Add the model to a `public` route group in `config/rhino.php`:

```php
'route_groups' => [
    'public' => [
        'prefix' => 'public',
        'middleware' => [],
        'models' => ['posts'],
    ],
],
```

Then update the policy to allow unauthenticated access:

```php
class PostPolicy extends ResourcePolicy
{
    public function viewAny(?Authenticatable $user): bool
    {
        return true;
    }

    public function view(?Authenticatable $user, $post): bool
    {
        return true;
    }
}
```

**Q: What does RhinoModel give me out of the box?**

A: `RhinoModel` extends Eloquent's `Model` and includes these traits automatically:
- `HasFactory` -- Laravel factory support
- `SoftDeletes` -- trash/restore/force-delete endpoints
- `HasValidation` -- declarative validation rules
- `HidableColumns` -- dynamic column hiding in API responses
- `HasAutoScope` -- auto-discovery of scope classes

You can add more traits like `HasAuditTrail` or `BelongsToOrganization` manually when needed.

**Q: Can I use the generator to scaffold everything?**

A: Yes. Run `php artisan rhino:generate` (or `rhino:g`). It interactively creates:
- **Model** with migration and factory
- **Policy** with ResourcePolicy base
- **Scope** with HasAutoScope convention

It auto-registers the model in your config file.

### Model Configuration

**Q: How do I add computed/virtual attributes to API responses?**

A: Override `rhinoComputedAttributes()` in your model: `public function rhinoComputedAttributes(): array { return ['my_attr' => $this->myMethod()]; }`. These are merged BEFORE policy filtering so they respect blacklist/whitelist. Do NOT override `asRhinoJson()` directly — merging after `parent::asRhinoJson()` bypasses policy security.

**Q: How do I exclude a CRUD action from being generated?**

A: Use `$exceptActions`:

```php
class Post extends RhinoModel
{
    public static array $exceptActions = ['destroy']; // No DELETE endpoint
}
```

Valid values: `'index'`, `'show'`, `'store'`, `'update'`, `'destroy'`.

**Q: How do I customize the base RhinoModel for all my models?**

A: Publish it:

```bash
php artisan vendor:publish --tag=rhino-model
```

This creates `app/Models/RhinoModel.php` that you can customize:

```php
use Rhino\LaravelApi\Models\RhinoModel as BaseRhinoModel;

class RhinoModel extends BaseRhinoModel
{
    use HasAuditTrail; // Now all models get audit trail
}
```

**Q: How do I add middleware to specific actions only?**

A: Use `$middlewareActions`:

```php
public static array $middlewareActions = [
    'store'   => ['verified'],
    'destroy' => ['admin'],
];
```

**Q: How does indirect ownership work for nested models?**

A: Rhino auto-detects the path by introspecting BelongsTo relationships. For example, if `Comment` belongs to `Post` which belongs to `Blog` (which has `organization_id`), Rhino automatically traverses `Comment -> post -> blog` to find the organization. No configuration needed.

### Validation

**Q: How do I add validation to a model?**

A: Add the `$validationRules` property (or use `RhinoModel` which includes `HasValidation` automatically):

```php
class Post extends RhinoModel
{
    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published,archived',
    ];
}
```

Validation runs automatically on `store` and `update` -- no manual calls needed.

**Q: How do I make different roles able to set different fields?**

A: Define field permissions in the policy, not the model:

```php
class PostPolicy extends ResourcePolicy
{
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) return ['*'];
        if ($this->hasRole($user, 'editor')) return ['title', 'content', 'excerpt', 'category_id'];
        return ['title', 'content'];
    }
}
```

The model's `$validationRules` handles format validation; the policy handles who can write which fields.

**Q: What's the difference between 403 and 422 errors?**

A:
- **403 Forbidden**: The user tried to set a field they're not allowed to (e.g., a regular user trying to set `is_published`)
- **422 Unprocessable Entity**: The field is allowed but the value failed format validation (e.g., `status` is not one of the allowed values)

**Q: Can I use any Laravel validation rule?**

A: Yes. All standard Laravel rules work: `email`, `unique:table,column`, `exists:table,column`, `image`, `json`, `min`, `max`, `regex`, `confirmed`, `date`, `numeric`, etc.

**Q: How do I add custom error messages?**

A: Use `$validationRulesMessages` with the `field.rule` format:

```php
protected $validationRulesMessages = [
    'title.required' => 'Every post needs a title.',
    'email.unique'   => 'This email is already registered.',
    'tags.*.max'     => 'Each tag must be 50 characters or fewer.',
];
```

### Permissions & Policies

**Q: How do I create a basic policy?**

A: Extend `ResourcePolicy` and set the resource slug:

```php
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';
}
```

That's it. The parent class handles all CRUD authorization automatically.

**Q: How do I set up different roles with different permissions?**

A: Create roles and assign permissions:

```php
$admin = Role::create(['name' => 'Admin', 'slug' => 'admin', 'permissions' => ['*']]);
$editor = Role::create(['name' => 'Editor', 'slug' => 'editor', 'permissions' => [
    'posts.index', 'posts.show', 'posts.store', 'posts.update',
    'comments.*',
]]);
$viewer = Role::create(['name' => 'Viewer', 'slug' => 'viewer', 'permissions' => [
    'posts.index', 'posts.show',
]]);
```

Then assign users to organizations with a role via `UserRole`.

**Q: How do I restrict users to only edit their own records?**

A: Override the policy method:

```php
public function update(?Authenticatable $user, $post): bool
{
    if ($user->hasPermission('*')) return true;
    return parent::update($user, $post) && $post->user_id === $user->id;
}
```

**Q: How do I hide sensitive fields from non-admin users?**

A: Use `hiddenAttributesForShow()` in your policy:

```php
public function hiddenAttributesForShow(?Authenticatable $user): array
{
    if ($user?->hasRole('admin')) return [];
    return ['salary', 'ssn', 'bank_account'];
}
```

**Q: Can a user have different permissions in different organizations?**

A: Yes. Permissions are per-organization via the `user_roles` table. A user can be admin in Org A and viewer in Org B:

```php
$user->hasPermission('posts.store', $orgA); // true (admin)
$user->hasPermission('posts.store', $orgB); // false (viewer)
```

**Q: Can a user bypass permissions through includes?**

A: No. When using `?include=comments`, Rhino checks that the user has `comments.index` permission. If they don't, the request returns 403. This prevents permission bypass through eager loading.

### Multi-Tenancy

**Q: How do I enable multi-tenancy?**

A: Run `php artisan rhino:install` and select "Yes" for multi-tenant support. It creates the organizations, roles, and user_roles tables, plus `OrganizationPolicy`, `RolePolicy`, and `UserPolicy` in `app/Policies/`. `UserPolicy` is what lets includes pointing at `User` (e.g. `?include=assignee`) resolve to the `users.*` permission slug. Or configure it manually in `config/rhino.php` with a `tenant` route group.

**Q: How do I scope my model to an organization?**

A: Two steps:
1. Add `BelongsToOrganization` trait to your model
2. Add `organization_id` column to your migration

```php
class Post extends RhinoModel
{
    use BelongsToOrganization;
}
```

Now all queries are automatically filtered by organization.

**Q: My model doesn't have organization_id directly. How do I scope it?**

A: Rhino auto-detects the path from BelongsTo relationships. Just add `BelongsToOrganization`:

```php
class Comment extends RhinoModel
{
    use BelongsToOrganization;
    // Comment -> Post -> Blog (has org_id) is auto-detected
}
```

**Q: Why do I get 404 instead of 403 when accessing an org I don't belong to?**

A: By design. Returning 404 prevents leaking information about which organization slugs exist. Users can't discover valid organizations through error responses.

**Q: How do I use subdomain-based multi-tenancy?**

A: Set `use_subdomain` to `true`:

```php
'multi_tenant' => [
    'enabled' => true,
    'use_subdomain' => true,
],
```

Then requests like `https://acme-corp.yourapp.com/api/posts` will resolve the organization from the subdomain.

### Route Groups

**Q: What are route groups for?**

A: Route groups let you expose the same models under different URL prefixes with different middleware and authentication. This is essential for hybrid platforms -- for example, a logistics app where customers access data through org-scoped routes, drivers through a driver-specific prefix, and admins through an admin prefix.

**Q: What's special about the tenant and public group names?**

A: `tenant` gets invitation and nested operation routes registered under its prefix. `public` skips `auth:sanctum` middleware entirely. All other names are standard authenticated groups.

**Q: How does permission checking work across route groups?**

A: For the `tenant` group, permissions come from `user_roles.permissions` (org-scoped). For all other groups, permissions come from `users.permissions` (user-level JSON column).

**Q: How do I make a driver only see their own trips?**

A: Create a global scope that checks the route group:

```php
class DriverScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $routeGroup = request()->route()?->defaults['route_group'] ?? null;
        if ($routeGroup === 'driver' && auth()->user()) {
            $builder->where('driver_id', auth()->user()->driver_id);
        }
    }
}
```

The scope only activates for the `driver` route group. Admin and tenant routes are unaffected.

### Soft Deletes

**Q: How do I enable soft deletes?**

A: If you're using `RhinoModel`, soft deletes are already included. Just make sure your migration has `$table->softDeletes()`. Rhino generates all the trash/restore/force-delete endpoints automatically.

**Q: How do I restrict who can permanently delete records?**

A: Use permissions. Give force-delete only to admins:

```php
$admin = Role::create([
    'name' => 'Admin',
    'permissions' => ['*'],
]);

$editor = Role::create([
    'name' => 'Editor',
    'permissions' => [
        'posts.destroy',     // Can soft-delete
        'posts.trashed',     // Can view trash
        'posts.restore',     // Can restore
        // NO posts.forceDelete -- editors can't permanently delete
    ],
]);
```

**Q: Can I allow users to only delete their own records?**

A: Override the policy's `delete()` method:

```php
public function delete(?Authenticatable $user, $model): bool
{
    if ($user->hasPermission('*')) return true;
    return parent::delete($user, $model) && $model->user_id === $user->id;
}
```

**Q: Does the list endpoint include soft-deleted records?**

A: No. `GET /api/posts` excludes soft-deleted records. Use `GET /api/posts/trashed` to see only trashed records.

**Q: Is force delete reversible?**

A: No. Force delete permanently removes the record from the database. There is no way to recover it. Use appropriate permissions to restrict this action.

### Audit Trail

**Q: How do I enable audit trail on a model?**

A: Add the `HasAuditTrail` trait and make sure you've run the audit_logs migration:

```php
class Post extends RhinoModel
{
    use HasAuditTrail;
}
```

Rhino automatically logs all create, update, delete, restore, and force-delete events.

**Q: How do I exclude sensitive fields from audit logs?**

A: Use `$auditExclude`:

```php
protected $auditExclude = ['password', 'remember_token', 'api_token', 'stripe_id'];
```

These fields will never appear in `old_values` or `new_values`.

**Q: Does the audit trail log all fields on update?**

A: No -- only fields that actually changed. If you update a post's title but not its content, only `title` appears in the audit log.

**Q: How do I fetch audit logs via the API?**

A: `GET /api/posts/42/audit` -- returns paginated audit log entries for post #42. Supports `?page=N&per_page=N`.

**Q: Can I query audit logs per organization?**

A: Yes. The `organization_id` is automatically captured:

```php
AuditLog::where('organization_id', $org->id)->latest()->paginate(20);
```

### Nested Operations

**Q: How do I create related records in a single request?**

A: Use nested operations with `$N.id` references:

```json
{
    "operations": [
        {
            "action": "create",
            "model": "blogs",
            "data": { "title": "Tech Blog" }
        },
        {
            "action": "create",
            "model": "posts",
            "data": { "title": "First Post", "blog_id": "$0.id" }
        },
        {
            "action": "create",
            "model": "comments",
            "data": { "content": "Great!", "post_id": "$1.id" }
        }
    ]
}
```

**Q: What happens if one operation fails?**

A: Everything is rolled back. If operation 3 of 5 fails validation, operations 0-2 are also rolled back. All-or-nothing -- no partial results.

**Q: Is each operation authorized separately?**

A: Yes. Each operation checks the model's policy independently. If the user can create blogs but not posts, the entire batch fails with 403.

**Q: What's the max number of operations?**

A: Default is 50. Configurable:

```php
'nested' => ['max_operations' => 100],
```

**Q: Can I reference fields other than id?**

A: Yes. You can reference any field: `$0.slug`, `$1.name`, `$2.uuid`, etc.

**Q: Can I mix create, update, and delete in the same batch?**

A: Yes:

```json
{
    "operations": [
        { "action": "create", "model": "blogs", "data": { "title": "New Blog" } },
        { "action": "update", "model": "posts", "id": 5, "data": { "blog_id": "$0.id" } },
        { "action": "delete", "model": "posts", "id": 10 }
    ]
}
```

### Querying

**Q: How do I filter by multiple values on the same field?**

A: Comma-separate the values:

```bash
GET /api/posts?filter[status]=draft,published
```

This returns posts where status is either `draft` OR `published`.

**Q: Why is my filter being ignored?**

A: Filters only work on fields listed in `$allowedFilters`. If the field isn't in that array, it's silently ignored. Add it:

```php
public static $allowedFilters = ['status', 'user_id', 'category_id'];
```

**Q: How does pagination work? Where are the page numbers?**

A: Pagination data comes in **response headers**, not the body:

```
X-Current-Page: 1
X-Last-Page: 5
X-Per-Page: 20
X-Total: 95
```

The response body is just the data array.

**Q: Can I search across related model fields?**

A: Yes. Use dot notation in `$allowedSearch`:

```php
public static $allowedSearch = ['title', 'content', 'user.name'];
```

Now `?search=john` searches in post title, post content, AND the user's name.

**Q: How do I get a count of related records without loading them?**

A: Use the `Count` suffix:

```bash
GET /api/posts?include=commentsCount
```

Response:
```json
{
    "id": 1,
    "title": "My Post",
    "comments_count": 15
}
```

### Testing

**Q: What test framework should I use?**

A: Check `config/rhino.php` for the `test_framework` setting. Rhino defaults to Pest but supports PHPUnit.

**Q: How do I test multi-tenant isolation?**

A: Create two organizations and verify records from one don't appear in the other:

```php
it('does not list posts from another organization', function () {
    [$user, $org, $token] = createAuthenticatedUser();
    $otherOrg = Organization::factory()->create();
    Post::factory()->count(3)->create(['organization_id' => $otherOrg->id]);

    $response = $this->withToken($token)
        ->getJson("/api/{$org->slug}/posts");

    $response->assertOk()->assertJsonCount(0);
});
```

**Q: How do I test permission boundaries?**

A: Create users with limited permissions and verify they get 403:

```php
it('returns 403 when user lacks store permission', function () {
    [$user, $org, $token] = createAuthenticatedUser(['posts.index', 'posts.show']);

    $response = $this->withToken($token)
        ->postJson("/api/{$org->slug}/posts", ['title' => 'Test']);

    $response->assertForbidden();
});
```

**Q: How do I run tests?**

A:
```bash
# Run all tests
php artisan test --compact

# Run specific file
php artisan test --compact tests/Feature/PostTest.php

# Run specific test by name
php artisan test --compact --filter="creates a post with valid data"
```

### Security

**Q: Can organization_id be changed on update?**

A: No. Rhino blocks this and returns 422. This prevents cross-tenant data leakage.

**Q: What happens if I try to change a parent FK to a resource from another org?**

A: Rhino returns 422. The cross-tenant `exists:` rule auto-scoping ensures referenced records belong to the current organization.

**Q: How does Rhino prevent org discovery through error responses?**

A: When a user tries to access an org they don't belong to, Rhino returns 404 (not 403). This prevents attackers from enumerating valid organization slugs.

---

## Real-World Examples

### Complete Blog API from Scratch

```bash
# Install Rhino
composer require rhino-project/rhino-laravel:^4.0
php artisan rhino:install

# Generate a Post model
php artisan rhino:generate
# -> Select "Model", name it "Post", add columns: title (string), content (text), status (string)

# Run migrations
php artisan migrate
```

Now you have: `GET /api/posts`, `POST /api/posts`, `PUT /api/posts/{id}`, `DELETE /api/posts/{id}` -- all with validation, filtering, sorting, search, and pagination.

### Complete Multi-Tenant SaaS Setup

```php
// 1. Config
'models' => [
    'posts'    => \App\Models\Post::class,
    'comments' => \App\Models\Comment::class,
],
'route_groups' => [
    'tenant' => [
        'prefix' => '{organization}',
        'middleware' => [ResolveOrganizationFromRoute::class],
        'models' => '*',
    ],
],
'multi_tenant' => [
    'organization_identifier_column' => 'slug',
],
```

```php
// 2. Model
class Post extends RhinoModel
{
    use BelongsToOrganization, HasAuditTrail;

    protected $fillable = ['title', 'content', 'status', 'organization_id', 'user_id'];
    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title'];
}
```

```php
// 3. Seed roles
Role::create(['name' => 'Admin', 'slug' => 'admin', 'permissions' => ['*']]);
Role::create(['name' => 'Editor', 'slug' => 'editor', 'permissions' => [
    'posts.index', 'posts.show', 'posts.store', 'posts.update', 'comments.*',
]]);
Role::create(['name' => 'Viewer', 'slug' => 'viewer', 'permissions' => [
    'posts.index', 'posts.show', 'comments.index', 'comments.show',
]]);
```

```php
// 4. Assign users
$org = Organization::create(['name' => 'Acme Corp', 'slug' => 'acme-corp']);
UserRole::create([
    'user_id' => $admin->id,
    'organization_id' => $org->id,
    'role_id' => Role::where('slug', 'admin')->first()->id,
]);
```

```bash
# 5. Use the API
# Admin: full access
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello", "content": "World", "status": "published"}'
# -> 201

# Viewer: read only
curl -H "Authorization: Bearer VIEWER_TOKEN" \
  -X POST /api/acme-corp/posts \
  -d '{"title": "Hello"}'
# -> 403
```

### Complete Model + Policy with Role-Based Validation

```php
// Model
class Post extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;

    protected $fillable = [
        'title', 'content', 'excerpt', 'status',
        'category_id', 'is_published', 'featured',
        'is_pinned', 'published_at', 'tags',
    ];

    protected $validationRules = [
        'title'        => 'string|max:255',
        'content'      => 'string',
        'excerpt'      => 'string|max:500',
        'status'       => 'string|in:draft,published,archived',
        'category_id'  => 'integer|exists:categories,id',
        'is_published' => 'boolean',
        'featured'     => 'boolean',
        'is_pinned'    => 'boolean',
        'published_at' => 'date',
        'tags'         => 'array',
        'tags.*'       => 'string|max:50',
    ];

    protected $validationRulesMessages = [
        'title.required'     => 'Every post needs a title.',
        'excerpt.max'        => 'Excerpt cannot exceed 500 characters.',
        'status.in'          => 'Status must be one of: draft, published, or archived.',
        'category_id.exists' => 'The selected category does not exist.',
    ];

    public static $allowedFilters  = ['status', 'user_id', 'category_id'];
    public static $allowedSorts    = ['created_at', 'title', 'published_at'];
    public static $defaultSort     = '-published_at';
    public static $allowedIncludes = ['user', 'category', 'comments', 'tags'];
    public static $allowedSearch   = ['title', 'content', 'excerpt'];
    public static $allowedFields   = ['id', 'title', 'slug', 'excerpt', 'status', 'published_at'];

    protected $perPage = 20;

    public function user()     { return $this->belongsTo(User::class); }
    public function category() { return $this->belongsTo(Category::class); }
    public function comments() { return $this->hasMany(Comment::class); }
    public function tags()     { return $this->belongsToMany(Tag::class); }
}
```

```php
// Policy
class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) return ['*'];
        if ($this->hasRole($user, 'editor')) return ['title', 'content', 'excerpt', 'category_id'];
        return ['title', 'content'];
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) return ['*'];
        if ($this->hasRole($user, 'editor')) return ['title', 'content', 'excerpt', 'category_id'];
        return ['title', 'content'];
    }

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($user?->hasPermission('posts.*')) return [];
        return ['internal_notes', 'cost_price'];
    }
}
```

**Result:**

| Action | Admin | Editor | Default |
|--------|-------|--------|---------|
| **Create** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |
| **Update** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |

An editor sending `{ "title": "Post", "is_published": true }` gets a `403` because `is_published` is not in their permitted list.

### E-Commerce Product Model

```php
class Product extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization, ViewModelHelpers;

    protected $fillable = ['name', 'sku', 'price', 'stock', 'category_id'];

    protected $validationRules = [
        'name'  => 'string|max:255',
        'sku'   => 'string|max:50',
        'price' => 'numeric|min:0',
        'stock' => 'integer|min:0',
    ];

    public static $allowedFilters  = ['category_id', 'brand_id', 'in_stock'];
    public static $allowedSorts    = ['price', 'name', 'created_at', 'rating'];
    public static $defaultSort     = '-created_at';
    public static $allowedFields   = ['id', 'name', 'price', 'thumbnail', 'rating'];
    public static $allowedIncludes = ['category', 'brand', 'reviews', 'images'];
    public static $allowedSearch   = ['name', 'sku', 'description'];

    public static $additionalHiddenColumns = ['cost_price', 'supplier_id'];

    protected $perPage = 24;
}
```

### Scaffolding a Complete Blog Feature

```bash
# 1. Generate the model with migration and factory
php artisan rhino:g
# -> Select Model, name: "BlogPost"
# -> Columns: title (string), content (text), status (string, default: draft),
#             user_id (foreignId), published_at (datetime, nullable)

# 2. Generate the policy
php artisan rhino:g
# -> Select Policy, name: "BlogPost"

# 3. Generate a custom scope (optional)
php artisan rhino:g
# -> Select Scope, name: "BlogPost"

# 4. Run migrations
php artisan migrate

# 5. Export Postman collection to test
php artisan rhino:export-postman
```

You now have:
- `app/Models/BlogPost.php` -- model with validation, filters, sorts
- `database/migrations/xxxx_create_blog_posts_table.php` -- migration
- `database/factories/BlogPostFactory.php` -- factory for testing
- `app/Policies/BlogPostPolicy.php` -- policy with ResourcePolicy base
- `app/Models/Scopes/BlogPostScope.php` -- custom scope
- Blog post auto-registered in `config/rhino.php`
- Full Postman collection for API testing
