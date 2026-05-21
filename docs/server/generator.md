---
sidebar_position: 10
title: Generator
---

# Interactive Generator

Scaffold models, policies, scopes, and more with interactive CLI commands.

:::tip Blueprint for Bulk Generation
For batch generation with **fully working permission methods**, see [Blueprint](./blueprint.md) — define your entire permission matrix in YAML and generate deterministically.
:::

## Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `rhino:install` | — | Interactive project setup |
| `rhino:generate` | `rhino:g` | Scaffold resources (models, policies, scopes) |
| `rhino:blueprint` | — | Generate from YAML specs ([docs](./blueprint.md)) |
| `rhino:export-postman` | — | Generate Postman collection |
| `invitation:link` | — | Generate invitation link for testing |

## rhino:install

Interactive installer that sets up the entire Rhino framework:

```bash title="terminal"
php artisan rhino:install
```

The installer walks you through:

### 1. Core Setup
- Publishes `config/rhino.php`
- Publishes route files

### 2. Feature Selection
- **Multi-tenant support** — creates organizations, roles, user_roles tables, and middleware
- **Audit trail** — creates audit_logs migration
- **Cursor AI toolkit** — sets up AI rules, skills, and agents

### 3. Multi-Tenant Options (if enabled)
- **Resolution strategy**: route prefix vs subdomain
- **Organization identifier**: `id`, `slug`, or `uuid`
- **Default roles**: creates seeder with admin, editor, viewer roles

### 4. Test Framework
- Choose between **Pest** or **PHPUnit** for generated tests

## rhino:generate

Interactively scaffold resources:

```bash title="terminal"
php artisan rhino:generate
# or
php artisan rhino:g
```

### Generating a Model

```
+ Rhino :: Generate :: Scaffold your resources +

 What type of resource would you like to generate?
 > Model (with migration and factory)

 What is the resource name?
 > BlogPost

 Define your columns:

 Column name: title
 Column type: string
 Nullable? No
 Has index? No

 Column name: content
 Column type: text
 Nullable? No

 Column name: status
 Column type: string
 Default value: draft

 Column name: user_id
 Column type: foreignId

 Column name: published_at
 Column type: datetime
 Nullable? Yes

 Add another column? No

 Creating BlogPost model, migration, and factory .............. done
```

This generates:

**Model** (`app/Models/BlogPost.php`):
```php title="app/Models/BlogPost.php"
<?php

namespace App\Models;

use Rhino\LaravelApi\Models\RhinoModel;

class BlogPost extends RhinoModel
{
    protected $fillable = [
        'title', 'content', 'status', 'user_id', 'published_at',
    ];

    protected $validationRules = [
        'title'        => 'string|max:255',
        'content'      => 'string',
        'status'       => 'string',
        'user_id'      => 'integer|exists:users,id',
        'published_at' => 'date',
    ];

    // Field permissions are controlled by PostPolicy
    // See: permittedAttributesForCreate() / permittedAttributesForUpdate()

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
```php title="database/migrations/create_blog_posts_table.php"
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
```php title="database/factories/BlogPostFactory.php"
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

**Auto-registration** in `config/rhino.php`:
```php title="config/rhino.php"
'models' => [
    'blog-posts' => \App\Models\BlogPost::class,
],
```

### Generating a Policy

```bash title="terminal"
php artisan rhino:generate
# Select: Policy
# Resource name: BlogPost
```

Generates `app/Policies/BlogPostPolicy.php`:

```php title="app/Policies/BlogPostPolicy.php"
<?php

namespace App\Policies;

use Rhino\LaravelApi\Policies\ResourcePolicy;

class BlogPostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'blog-posts';

    // All CRUD methods inherited from ResourcePolicy
    // Override for custom authorization logic
}
```

### Generating a Scope

```bash title="terminal"
php artisan rhino:generate
# Select: Scope
# Resource name: BlogPost
```

Generates `app/Models/Scopes/BlogPostScope.php`:

```php title="app/Models/Scopes/BlogPostScope.php"
<?php

namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class BlogPostScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        // Add your global scope logic
        // e.g., $builder->where('is_visible', true);
    }
}
```

If the model uses the `HasAutoScope` trait, this scope is automatically applied.

## Supported Column Types

| Type | Migration | Factory | Example |
|------|-----------|---------|---------|
| `string` | `$table->string('name')` | `fake()->sentence()` | Titles, slugs, emails |
| `text` | `$table->text('body')` | `fake()->paragraphs(3, true)` | Long content |
| `integer` | `$table->integer('count')` | `fake()->numberBetween(0, 100)` | Counts, quantities |
| `boolean` | `$table->boolean('active')` | `fake()->boolean()` | Flags, toggles |
| `date` | `$table->date('published_at')` | `fake()->date()` | Dates without time |
| `datetime` | `$table->dateTime('starts_at')` | `fake()->dateTime()` | Dates with time |
| `decimal` | `$table->decimal('price', 10, 2)` | `fake()->randomFloat(2, 0, 999)` | Prices, amounts |
| `uuid` | `$table->uuid('external_id')` | `fake()->uuid()` | External IDs |
| `foreignId` | `$table->foreignId('user_id')->constrained()` | `User::factory()` | Relationships |

## rhino:export-postman

Generate a complete Postman Collection v2.1 for all registered models:

```bash title="terminal"
php artisan rhino:export-postman
```

This creates a JSON file you can import directly into Postman. The collection includes:

- All CRUD endpoints for every registered model
- Soft delete endpoints (trashed, restore, force-delete)
- Authentication endpoints (login, logout, register)
- Invitation endpoints (if multi-tenant)
- Nested operations endpoint
- Pre-configured authorization headers
- Example request bodies with validation rules

### Postman Config

```php title="config/rhino.php"
'postman' => [
    'role_class'      => 'App\Models\Role',
    'user_role_class'  => 'App\Models\UserRole',
    'user_class'       => 'App\Models\User',
],
```

## invitation:link

Generate an invitation link for testing:

```bash title="terminal"
php artisan invitation:link
```

Creates a new invitation and outputs the acceptance URL. Useful for testing the invitation flow without sending emails.
