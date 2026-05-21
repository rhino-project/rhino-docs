---
sidebar_position: 2
title: Models
---

# Models

Rhino models are standard Laravel Eloquent models enhanced with declarative static properties and traits that control how REST API endpoints are generated and behave. By configuring these properties directly on your model, Rhino automatically builds fully-featured API endpoints with filtering, sorting, searching, pagination, validation, and authorization -- all without writing controllers or routes.

## RhinoModel Base Class

The recommended way to create Rhino models is to extend `RhinoModel` — a convenience base class that pre-includes all the core traits you need:

```php title="app/Models/Post.php"
use Rhino\LaravelApi\Models\RhinoModel;

class Post extends RhinoModel
{
    protected $fillable = ['title', 'content', 'status'];

    public static $allowedFilters  = ['status', 'user_id'];
    public static $allowedSorts    = ['created_at', 'title'];
    public static $allowedSearch   = ['title', 'content'];
}
```

`RhinoModel` extends `Illuminate\Database\Eloquent\Model` and includes these traits automatically:

| Trait | Purpose |
|---|---|
| `HasFactory` | Laravel factory support for testing |
| `SoftDeletes` | Trash, restore, and force-delete endpoints |
| `HasValidation` | Role-based validation rules |
| `HidableColumns` | Dynamic column hiding from API responses |
| `HasAutoScope` | Auto-discovery of `App\Models\Scopes\{Model}Scope` classes |

You no longer need to manually `use` these traits on every model.

### Optional Traits

These traits are **not** included in `RhinoModel` because they require additional database columns or configuration. Add them manually when needed:

```php title="app/Models/Post.php"
use Rhino\LaravelApi\Models\RhinoModel;
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;
    // ...
}
```

| Trait | Purpose |
|---|---|
| `HasAuditTrail` | Automatic change logging to `audit_logs` table |
| `HasUuid` | Auto-generated UUID on creation |
| `BelongsToOrganization` | Multi-tenant organization scoping |
| `HasPermissions` | Permission checking (User model only) |

### Customizing RhinoModel

You can publish and customize the base class for your application:

```bash title="terminal"
php artisan vendor:publish --tag=rhino-model
```

This creates `app/Models/RhinoModel.php` in your project, which extends the package's base class. Add your own traits or configuration that should apply to all Rhino models:

```php title="app/Models/RhinoModel.php"
use Rhino\LaravelApi\Models\RhinoModel as BaseRhinoModel;

class RhinoModel extends BaseRhinoModel
{
    use HasAuditTrail; // Now all models get audit trail by default
}
```

:::tip
You can still extend `Illuminate\Database\Eloquent\Model` directly and apply traits manually if you prefer full control. `RhinoModel` is a convenience, not a requirement.
:::

## Model Configuration Properties

Below is a complete model example demonstrating **all** available static properties that Rhino recognizes:

```php title="app/Models/Post.php"
<?php

namespace App\Models;

use Rhino\LaravelApi\Models\RhinoModel;
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use HasAuditTrail, BelongsToOrganization;

    protected $fillable = [
        'title', 'content', 'status', 'user_id', 'category_id',
    ];

    // ── Query Builder ────────────────────────────────────────────
    public static $allowedFilters  = ['status', 'user_id', 'category_id'];
    public static $allowedSorts    = ['created_at', 'title', 'updated_at'];
    public static $defaultSort     = '-created_at';
    public static $allowedFields   = ['id', 'title', 'content', 'status'];
    public static $allowedIncludes = ['user', 'comments', 'tags'];
    public static $allowedSearch   = ['title', 'content'];

    // ── Pagination ───────────────────────────────────────────────
    public static bool $paginationEnabled = true;
    protected $perPage = 25;

    // ── Middleware ────────────────────────────────────────────────
    public static array $middleware = ['throttle:60,1'];
    public static array $middlewareActions = [
        'store'   => ['verified'],
        'destroy' => ['admin'],
    ];

    // ── Route Exclusion ──────────────────────────────────────────
    public static array $exceptActions = ['destroy']; // skip DELETE endpoint

}
```

### Property Reference

| Property | Type | Description |
|---|---|---|
| `$fillable` | `array` | Standard Eloquent mass-assignable fields. Rhino uses this to determine which fields can be set via `POST` and `PUT`/`PATCH` requests. |
| `$allowedFilters` | `array` | Fields available for query-string filtering via `?filter[field]=value`. Only the fields listed here can be filtered on. |
| `$allowedSorts` | `array` | Fields available for sorting via `?sort=field`. Prefix with `-` for descending order (e.g., `?sort=-created_at`). |
| `$defaultSort` | `string` | The sort applied when no `?sort` parameter is provided. Use the `-` prefix for descending (e.g., `'-created_at'`). |
| `$allowedFields` | `array` | Fields that can be selected via sparse fieldsets (`?fields[model]=field1,field2`). Limits which columns are returned. |
| `$allowedIncludes` | `array` | Relationships that can be eager-loaded via `?include=relation`. Must correspond to defined Eloquent relationships on the model. |
| `$allowedSearch` | `array` | Fields searched when `?search=term` is used. Rhino performs a case-insensitive `LIKE` search across all listed fields. |
| `$paginationEnabled` | `bool` | Enables or disables pagination for the index endpoint. Defaults to `true`. |
| `$perPage` | `int` | Number of records per page when pagination is enabled. Standard Eloquent property. |
| `$middleware` | `array` | Middleware applied to **all** routes for this model. |
| `$middlewareActions` | `array` | Middleware applied to **specific** actions only. Keys are action names (`index`, `show`, `store`, `update`, `destroy`). |
| `$exceptActions` | `array` | List of CRUD actions to exclude from route generation. Valid values: `'index'`, `'show'`, `'store'`, `'update'`, `'destroy'`. |

:::tip
You only need to declare properties that differ from their defaults. For example, if you do not need filtering, simply omit `$allowedFilters` entirely.
:::

## Available Traits

Rhino provides a collection of traits that add specific behaviors to your models. When using `RhinoModel`, the core traits (HasValidation, HidableColumns, HasAutoScope, SoftDeletes) are already included. The traits documented below can be added individually when needed.

### HasValidation

Adds declarative validation to your model via `validateStore()` and `validateUpdate()` methods that Rhino calls automatically during `store` and `update` actions.

**Included in RhinoModel** — no need to add manually.

**Model properties:**

| Property | Type | Description |
|---|---|---|
| `$validationRules` | `array` | Format rules keyed by field name (e.g., `['title' => 'string\|max:255']`). |
| `$validationRulesMessages` | `array` | Custom error messages, following the Laravel validation message format. |

Which fields each role can create or update is controlled by the policy's `permittedAttributesForCreate()` and `permittedAttributesForUpdate()` methods. See [Policies — Attribute Permissions](./policies#attribute-permissions).

```php title="app/Models/Post.php"
use Rhino\LaravelApi\Models\RhinoModel;

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

:::info
For a complete breakdown of validation behavior, including how store and update rules interact, see the [Validation](./validation) page.
:::

---

### HasPermissions

Adds role-based permission checking to the **User** model. Rhino uses this trait to authorize API actions automatically when policies are in place.

**Methods:**

| Method | Description |
|---|---|
| `hasPermission(string $permission, ?Organization $org)` | Returns `true` if the user has the given permission within the specified organization. |
| `getRoleSlugForValidation($organization)` | Returns the user's role slug within an organization, used for role-based validation rules. |
| `userRoles()` | Eloquent relationship to the user's role assignments. |

**Permission format:** `{resource_slug}.{action}`

Permissions follow the pattern of the resource slug (the key in your `config/rhino.php` models array) combined with the CRUD action:

- `posts.index` -- can list posts
- `posts.store` -- can create posts
- `blogs.update` -- can update blogs
- `posts.destroy` -- can delete posts

**Wildcard support:**

- `*` -- grants access to everything across all resources
- `posts.*` -- grants access to all actions on posts

```php title="app/Models/User.php"
use Rhino\LaravelApi\Traits\HasPermissions;

class User extends RhinoModel
{
    use HasPermissions;
}

// Check if a user can create posts within an organization
if ($user->hasPermission('posts.store', $organization)) {
    // User can create posts
}

// Check for full access
if ($user->hasPermission('*', $organization)) {
    // User has unrestricted access to everything
}

// Check for all post actions
if ($user->hasPermission('posts.*', $organization)) {
    // User can index, show, store, update, and destroy posts
}
```

---

### HasAuditTrail

Automatically records changes to your model in an audit log. Rhino tracks creation, updates, deletion, force-deletion, and restoration events and stores the old and new values for each change.

**Tracked events:** `created`, `updated`, `deleted`, `force_deleted`, `restored`

**Model properties:**

| Property | Type | Default | Description |
|---|---|---|---|
| `$auditExclude` | `array` | `['password', 'remember_token']` | Fields excluded from audit log entries. Use this to prevent sensitive data from being recorded. |

```php title="app/Models/User.php"
use Rhino\LaravelApi\Traits\HasAuditTrail;

class User extends RhinoModel
{
    use HasAuditTrail;

    // Exclude sensitive fields from audit logs
    protected $auditExclude = ['password', 'remember_token', 'api_token'];
}

// Query the audit trail for any model instance
$logs = $post->auditLogs()->latest()->get();

// Each log entry contains:
// - event (created, updated, deleted, etc.)
// - old_values (previous state)
// - new_values (current state)
// - user_id (who made the change)
// - timestamps
```

The `auditLogs()` method is a polymorphic relationship, so it works identically on any model that uses the trait.

:::info
For full details on querying and managing audit logs, see the [Audit Trail](./audit-trail) page.
:::

---

### HasUuid

Automatically generates a UUID for the model when it is created. The trait hooks into Eloquent's `creating` event and fills the `uuid` column if it is empty.

```php title="app/Models/Invoice.php"
use Rhino\LaravelApi\Traits\HasUuid;

class Invoice extends RhinoModel
{
    use HasUuid;

    // No additional configuration needed.
    // A UUID is generated and assigned to the `uuid` column on creation.
}
```

:::warning
Your database table must have a `uuid` column. Add it in your migration:

```php title="database/migrations/create_invoices_table.php"
$table->uuid('uuid')->unique()->nullable();
```
:::

---

### BelongsToOrganization

Provides multi-tenant organization scoping. This trait automatically filters all queries to the current organization and sets the `organization_id` when creating new records.

**Adds:**

| Member | Type | Description |
|---|---|---|
| `organization()` | BelongsTo relationship | Links the model to its owning organization. |
| `scopeForOrganization($query, $org)` | Query scope | Manually scope a query to a specific organization. |
| Global scope | Automatic | All queries are automatically filtered by `organization_id`. |
| Auto-set on create | Automatic | `organization_id` is filled from the current request context on creation. |

```php title="app/Models/Post.php"
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class Post extends RhinoModel
{
    use BelongsToOrganization;

    // All queries are now scoped to the current organization automatically.
    // GET /api/acme-corp/posts -> only returns posts where organization_id matches acme-corp
}
```

**Nested ownership (auto-detected):**

Not every model has a direct `organization_id` column. Rhino auto-detects the path by introspecting `BelongsTo` relationships — just define your relationships and scoping works automatically.

```php title="app/Models/Comment.php"
class Comment extends RhinoModel
{
    use BelongsToOrganization;

    // Comment → Post → Blog → Organization (auto-detected via BelongsTo chain)
    public function post()
    {
        return $this->belongsTo(Post::class);
    }
}
```

Rhino traverses `Comment -> post -> blog` to find the organization automatically. The chain can be up to 3 levels deep.

:::info
For a full explanation of multi-tenancy and organization scoping, see the [Multi-Tenancy](./multi-tenancy) page.
:::

---

### HidableColumns

Controls which columns are hidden from API responses. This trait provides multiple layers of column visibility control: base defaults, model-level configuration, and policy-based per-user hiding.

**Layers of hidden columns (applied in order):**

1. **Base hidden columns** (always hidden): `password`, `remember_token`, `created_at`, `updated_at`, `deleted_at`, `email_verified_at`
2. **Model-level hidden columns** via `$additionalHiddenColumns`: additional fields to always hide for this model
3. **Policy-level attribute permissions** via `permittedAttributesForShow()` and `hiddenAttributesForShow()` on the model's policy: per-user dynamic visibility

```php title="app/Models/User.php"
class User extends RhinoModel
{

    // Always hide these columns from API responses (in addition to base defaults)
    public static $additionalHiddenColumns = ['api_token', 'stripe_id'];
}
```

:::tip
Hidden columns are cached per user for performance. If you change visibility rules, the cache updates automatically on the next request cycle.
:::

:::info
For policy-based field visibility (showing different fields to different users), see [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

#### Computed Attributes with `rhinoComputedAttributes()`

Override `rhinoComputedAttributes()` in your model to add virtual (computed) attributes to API responses. These attributes are not database columns — they are calculated at runtime and merged into the serialized output.

```php title="app/Models/Contract.php"
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

The returned array is merged into the JSON response **before** policy filtering is applied. This means computed attributes are always subject to policy-level blacklist and whitelist — just like database columns. The controller calls `asRhinoJson()` automatically when rendering responses.

:::warning
Do **not** override `asRhinoJson()` directly. Use `rhinoComputedAttributes()` instead. Overriding `asRhinoJson()` with `parent::asRhinoJson() + [...]` would add attributes **after** policy filtering, bypassing `hiddenAttributesForShow()` and `permittedAttributesForShow()` — a security risk.
:::

Computed attributes can be controlled per-role via policy:

```php title="app/Policies/ContractPolicy.php"
class ContractPolicy extends ResourcePolicy
{
    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return [];
        }

        return ['risk_score']; // Only admins see the risk score
    }
}
```

You can also use `permittedAttributesForShow()` to whitelist which attributes (including computed ones) each role can see.

---

### HasAutoScope

Automatically applies a global scope to the model based on a naming convention. When this trait is used, Rhino looks for a scope class at `App\Models\Scopes\{ModelName}Scope` and applies it if found. No manual registration is needed.

```php title="app/Models/Post.php"
class Post extends RhinoModel
{

    // Automatically loads App\Models\Scopes\PostScope (if it exists)
}
```

Create the corresponding scope class:

```php title="app/Models/Scopes/PostScope.php"
<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class PostScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $builder->where('is_visible', true);
    }
}
```

With this in place, every query for `Post` automatically includes `WHERE is_visible = true`. This is useful for soft-visibility flags, status filtering, or any default constraint you want applied globally.

:::tip
The scope is only applied if the class exists. You can safely add the `HasAutoScope` trait to any model without creating the scope class until you need it.
:::

---

### ViewModelHelpers

Adds utility methods for formatting data in API responses. Currently provides currency formatting with support for multiple international currencies.

**Method:** `formatPrice(float $amount, CurrencyOption $currency): string`

**Supported currencies:**

| Enum Value | Symbol | Format Example |
|---|---|---|
| `CurrencyOption::USD` | `$` | `$1,234.56` |
| `CurrencyOption::CAD` | `C$` | `C$1,234.56` |
| `CurrencyOption::GBP` | `£` | `£1,234.56` |
| `CurrencyOption::BRL` | `R$` | `R$1.234,56` |
| `CurrencyOption::EUR` | `€` | `€1.234,56` |
| `CurrencyOption::CHF` | `CHF` | `CHF1,234.56` |

```php title="app/Models/Product.php"
use Rhino\LaravelApi\Traits\ViewModelHelpers;
use Rhino\LaravelApi\Enums\CurrencyOption;

class Product extends RhinoModel
{
    use ViewModelHelpers;
}

$product->formatPrice(1234.56, CurrencyOption::USD); // "$1,234.56"
$product->formatPrice(1234.56, CurrencyOption::BRL); // "R$1.234,56"
$product->formatPrice(1234.56, CurrencyOption::EUR); // "€1.234,56"
$product->formatPrice(1234.56, CurrencyOption::GBP); // "£1,234.56"
```

:::info
Note that BRL and EUR use dot as the thousands separator and comma as the decimal separator, matching their regional conventions.
:::

## Complete Model Example

Below is a full real-world model that combines multiple Rhino traits into a feature-rich API resource:

```php title="app/Models/BlogPost.php"
<?php

namespace App\Models;

use Rhino\LaravelApi\Models\RhinoModel;
use Rhino\LaravelApi\Traits\HasAuditTrail;
use Rhino\LaravelApi\Traits\HasUuid;
use Rhino\LaravelApi\Traits\BelongsToOrganization;

class BlogPost extends RhinoModel
{
    use HasAuditTrail, HasUuid, BelongsToOrganization;

    protected $fillable = [
        'title', 'slug', 'content', 'excerpt',
        'status', 'featured_image', 'user_id',
        'category_id', 'published_at',
    ];

    protected $casts = [
        'published_at' => 'datetime',
    ];

    // ── Validation ───────────────────────────────────────────────
    protected $validationRules = [
        'title'   => 'string|max:255',
        'slug'    => 'string|max:255',
        'content' => 'string',
        'excerpt' => 'string|max:500',
        'status'  => 'string|in:draft,published,archived',
    ];

    // Field permissions (which roles can write which fields)
    // are controlled by the PostPolicy — see Policies page.

    // ── Audit Trail ──────────────────────────────────────────────
    // No extra exclusions beyond the defaults (password, remember_token)
    protected $auditExclude = [];

    // ── Query Configuration ──────────────────────────────────────
    public static $allowedFilters  = ['status', 'user_id', 'category_id'];
    public static $allowedSorts    = ['created_at', 'title', 'published_at'];
    public static $defaultSort     = '-published_at';
    public static $allowedIncludes = ['user', 'category', 'comments', 'tags'];
    public static $allowedSearch   = ['title', 'content', 'excerpt'];
    public static $allowedFields   = ['id', 'title', 'slug', 'excerpt', 'status', 'published_at'];

    // ── Pagination ───────────────────────────────────────────────
    public static bool $paginationEnabled = true;
    protected $perPage = 20;

    // ── Relationships ────────────────────────────────────────────
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function comments()
    {
        return $this->hasMany(Comment::class);
    }

    public function tags()
    {
        return $this->belongsToMany(Tag::class);
    }
}
```

This single model definition gives you:

- **REST endpoints** for listing, showing, creating, updating, and soft-deleting blog posts
- **Filtering** by status, user, and category (`?filter[status]=published`)
- **Sorting** by creation date, title, or publish date (`?sort=-published_at`)
- **Full-text search** across title, content, and excerpt (`?search=laravel`)
- **Eager loading** of user, category, comments, and tags (`?include=user,comments`)
- **Sparse fieldsets** to reduce payload size (`?fields[blog_posts]=id,title,excerpt`)
- **Pagination** at 20 records per page
- **Validation** with different required fields for creation vs. update
- **Audit logging** of every change with before/after values
- **UUID generation** for external-facing identifiers
- **Organization scoping** for multi-tenant data isolation
- **Column hiding** to keep sensitive fields out of API responses

## Registration

Models are registered in `config/rhino.php`. The key becomes the URL slug and the permission prefix:

```php title="config/rhino.php"
'models' => [
    'blog-posts' => \App\Models\BlogPost::class,
    'comments'   => \App\Models\Comment::class,
    'categories' => \App\Models\Category::class,
    'tags'       => \App\Models\Tag::class,
],
```

With this configuration, Rhino generates routes such as:

```
GET    /api/{organization}/blog-posts
GET    /api/{organization}/blog-posts/{id}
POST   /api/{organization}/blog-posts
PUT    /api/{organization}/blog-posts/{id}
DELETE /api/{organization}/blog-posts/{id}
```

:::warning
The model key (e.g., `blog-posts`) is used as the permission prefix. Make sure it matches what you use in your role permission definitions (e.g., `blog-posts.store`, `blog-posts.index`).
:::
