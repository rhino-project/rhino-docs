---
sidebar_position: 4
title: Querying
---

# Advanced Querying

Every Rhino endpoint supports filtering, sorting, search, pagination, field selection, and eager loading — all via query parameters. Powered by [Spatie Query Builder](https://spatie.be/docs/laravel-query-builder).

## Model Configuration

Define what's queryable on your model:

```php title="app/Models/Post.php"
class Post extends Model
{
    // Fields that can be filtered
    public static $allowedFilters = ['status', 'user_id', 'category_id'];

    // Fields that can be sorted
    public static $allowedSorts = ['created_at', 'title', 'updated_at', 'published_at'];

    // Default sort when none specified (prefix with - for descending)
    public static $defaultSort = '-created_at';

    // Fields that can be selected
    public static $allowedFields = ['id', 'title', 'content', 'status', 'created_at'];

    // Relationships that can be eager loaded
    public static $allowedIncludes = ['user', 'comments', 'tags', 'category'];

    // Fields searched with ?search= parameter
    public static $allowedSearch = ['title', 'content', 'user.name'];
}
```

:::warning
Fields **not** listed in these arrays are silently ignored. This is a security feature — users can't filter or sort by columns you haven't explicitly allowed.
:::

### Attribute permissions apply to queries too

The allowlists above are global: they say which columns are queryable at all. The policy's [attribute permissions](./policies#attribute-level-permissions) then say which of those **this user** may query.

An attribute the policy hides is refused as a filter or a sort:

```bash title="terminal"
GET /api/employees?filter[salary]=300000
# → 403 { "message": "Filter 'salary' is not allowed" }

GET /api/employees?sort=-salary
# → 403 { "message": "Sort 'salary' is not allowed" }
```

Without this, a hidden column stayed usable as a predicate: the response never printed a salary, but narrowing the list by it told the caller what the value was, and sorting by it leaked the whole ordering.

Two related rules:

- **`?search=` skips hidden columns.** The client names a term, not a column, so there is nothing to refuse. The term reaches only the searchable columns this user may see. If every one of them is hidden, the search returns nothing rather than the unnarrowed list.
- **A column the model never allowlisted is still ignored, not refused.** Refusing it would tell the caller the column exists.

The model's declared `$defaultSort` is the server's own choice, so it applies regardless.

## Filtering

Filter records by field values:

```bash title="terminal"
# Single filter
GET /api/posts?filter[status]=published

# Multiple filters (AND)
GET /api/posts?filter[status]=published&filter[user_id]=1

# Multiple values for one field (OR)
GET /api/posts?filter[status]=draft,published
```

Only fields listed in `$allowedFilters` can be filtered.

### Examples

```bash title="terminal"
# Posts by a specific user
GET /api/posts?filter[user_id]=42

# Published posts in a category
GET /api/posts?filter[status]=published&filter[category_id]=5

# Posts that are either draft or published (excludes archived)
GET /api/posts?filter[status]=draft,published
```

## Sorting

Sort records by one or more fields:

```bash title="terminal"
# Ascending
GET /api/posts?sort=title

# Descending (prefix with -)
GET /api/posts?sort=-created_at

# Multiple sorts (first by status ascending, then by date descending)
GET /api/posts?sort=status,-created_at
```

Only fields listed in `$allowedSorts` can be sorted. If no sort is specified, `$defaultSort` is used.

## Search

Full-text search across configured fields:

```bash title="terminal"
GET /api/posts?search=laravel
```

Searches across all fields listed in `$allowedSearch`. You can search across relationships too:

```php title="app/Models/Post.php"
// Model config
public static $allowedSearch = ['title', 'content', 'user.name'];
```

```bash title="terminal"
# This searches in post.title, post.content, AND user.name
GET /api/posts?search=john
```

:::tip Combine search with filters
```bash title="terminal"
# Search for "laravel" only in published posts
GET /api/posts?search=laravel&filter[status]=published
```
:::

## Named Scopes

Named scopes let the client **select** a model-whitelisted query scope by name via `?scope=`. Unlike filters and sorts (which the client composes freely from allowed columns), a named scope is a reusable, server-defined query fragment — ideal for complex joins or user-specific constraints you don't want to express in the URL.

Declare the whitelist and a default on the model, then implement each scope as an Eloquent local scope:

```php title="app/Models/Route.php"
class Route extends RhinoModel
{
    // Scopes the client may select by name via ?scope=
    public static $allowedScopes = ['availableForDrivers'];

    // Applied automatically when no ?scope= is given
    public static $defaultScope = 'active';

    public function scopeActive(Builder $query, ?Authenticatable $user): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeAvailableForDrivers(Builder $query, ?Authenticatable $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0'); // fail closed when unauthenticated
        }

        return $query
            ->where('status', 'active')
            ->whereDoesntHave('assignments', fn ($q) => $q->whereNull('completed_at'))
            ->whereHas('region.driverQualifications', fn ($q) => $q
                ->where('driver_id', $user->id)
                ->where('expires_at', '>', now()));
    }
}
```

The scope method receives the **current authenticated user** as its first argument — resolved server-side from the request. The client never sends user identity; it only sends the scope name. Always fail closed (`whereRaw('1 = 0')`) when `$user` is null.

### Selecting a scope

```bash title="terminal"
# Apply the availableForDrivers scope
GET /api/routes?scope=availableForDrivers

# No ?scope= → the model's $defaultScope ('active') is applied automatically
GET /api/routes
```

### Scope parameters

A scope can take arguments the client fills in. Declare the parameter names in the order the scope method takes them, then send them in the bracket form:

```php title="app/Models/Route.php"
public static $allowedScopes = [
    'availableForDrivers',                       // no parameters
    'since' => 'date',                           // one parameter
    'window' => ['from', 'to'],                  // two, both required
    'titled' => ['params' => ['title', 'status'], 'optional' => ['status']],
];

public function scopeSince(Builder $query, ?Authenticatable $user, $date): Builder
{
    return $query->where('created_at', '>=', $date);
}

public function scopeWindow(Builder $query, ?Authenticatable $user, $from, $to): Builder
{
    return $query->whereBetween('created_at', [$from, $to]);
}
```

```bash title="terminal"
# One parameter: a bare value binds to the single declared name
GET /api/routes?scope[since]=2026-01-01

# Several: every argument is named
GET /api/routes?scope[window][from]=2026-01-01&scope[window][to]=2026-02-01

# An optional parameter may simply be left out
GET /api/routes?scope[titled][title]=Night+shift
```

Arguments bind **by name**, never by position, so the order of the keys in the URL does not matter. A positional list (`?scope[window][]=a`) is refused, and so is a bare value for a scope with more than one parameter: two arguments are never guessed at from one value.

The value `true` or `false` reaches the scope as a real boolean, so a check inside the scope body cannot be fooled by the string `"false"`.

A scope that declares no parameters never receives client input. Sending any is a `403`, which means a scope written without arguments can never be handed some later by a URL.

### Combining scopes

Up to three scopes may be combined, and they apply in the order the URL lists them:

```bash title="terminal"
GET /api/routes?scope[archived]=&scope[window][from]=2026-01-01&scope[window][to]=2026-02-01
```

The two forms cannot be mixed in one request, because they share the single `scope` query key. That is what the empty value on `archived` is for: it is how a no-argument scope joins a request that also carries one with arguments. On its own, `?scope=archived` is still the way to write it.

Each scope is a fragment that narrows the set, so they compose like filters. Write scopes that are safe to combine: a scope that sets its own ordering, limit or raw join can fight another one.

:::info Why three
The limit is about blast radius, not about a number anyone hits. A named scope is an arbitrary query fragment, so each one may add joins or subqueries; stacking many of them is how you end up with an accidental cross join, or a query nobody can explain from reading the URL. Three covers the shapes that come up in practice — a base scope, a window, and one more predicate.
:::

### Restricting scopes per user

The model says which scopes exist on the wire. The policy says which of them **this user** may select:

```php title="app/Policies/RoutePolicy.php"
public function permittedScopes(?Authenticatable $user): array
{
    if ($user?->hasRole('dispatcher')) {
        return ['*']; // every scope the model declares
    }

    return ['availableForDrivers'];
}
```

The default is `['*']`, so a policy written before this existed keeps allowing every declared scope. A denied scope and an undeclared one return the **same** message, so the endpoint never reveals which scopes a model has.

The model's `$defaultScope` is applied by the server when the client sends no scope at all, so it is not subject to this list. Requesting it by name is.

### Best practices for complex scopes

Once a scope grows past a couple of clauses — joins, subqueries, per-user or per-role logic — move it out of the model into its own class. These are the rules that keep a complex named scope correct and safe.

**1. Put it in a scope class, not a service.** A scope is a pure query transformation: `(query, user) -> narrowed query`. The framework only invokes real local scopes (`hasNamedScope` gates `?scope=`), so keep a one-line `scopeXxx` on the model that delegates to an invokable class in `app/Models/Scopes/`:

```php title="app/Models/Route.php"
public function scopeAvailableForDrivers(Builder $query, ?Authenticatable $user): Builder
{
    return (new AvailableForDriversScope)($query, $user);
}
```

```php title="app/Models/Scopes/AvailableForDriversScope.php"
namespace App\Models\Scopes;

class AvailableForDriversScope
{
    public function __invoke(Builder $query, ?Authenticatable $user): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0'); // fail closed
        }

        return $query
            ->where('status', 'active')
            ->whereDoesntHave('assignments', fn ($q) => $q->whereNull('completed_at'))
            ->whereHas('region.driverQualifications', fn ($q) => $q
                ->where('driver_id', $user->id)
                ->where('expires_at', '>', now()));
    }
}
```

The `scopeXxx` method stays thin — one line of delegation — so `?scope=availableForDrivers` still resolves, while the real logic lives in a testable class.

**2. Always derive from the query you are handed** — never start from a fresh model query. `$query` already carries the organization scope and every other global scope; `Route::query()` does not (global scopes bypassed from within package internals). Starting fresh silently turns a tenant-isolated list into a data leak.

```php title="app/Models/Scopes/AvailableForDriversScope.php"
// GOOD — narrows the org-scoped query you were given
return $query->where('status', 'active');

// BAD — drops org scoping; leaks other tenants' rows
return Route::query()->where('status', 'active');
```

**3. Fail closed when there is no user.** Return an empty set (`whereRaw('1 = 0')`), never the full set — an unauthenticated caller should see nothing, not everything.

**4. Prefer relation predicates over raw joins.** A raw `join()` duplicates rows under `paginate()` and makes `?sort` ambiguous; use `whereHas`/`whereExists` (as above) so counts and ordering stay correct. If you must use `distinct`, do not combine the scope with `?fields` (the resulting `COUNT(DISTINCT ...)` breaks under column selection). Add DB indexes for the columns your predicates filter on (`driver_id`, `expires_at`, `completed_at`).

:::warning A named scope only narrows — never widens
It runs **on top of** organization scoping and every global scope, so it can only shrink the already-authorized set. Do **not** put mandatory restrictions (tenancy, visibility) in a named scope — a client drops it the moment they select another `?scope=`. Those belong in an always-on global scope. See [the default scope is not a security boundary](#the-403-contract) below.
:::

**5. Offload external or expensive work to a service the scope calls.** If the scope needs an API call, a permission-graph lookup, or heavy computation, put that in a service that returns *raw material* — a set of ids or a subquery — cache it, and have the scope apply it. That keeps the thing that runs on every list request a cheap, pure query transform:

```php title="app/Models/Scopes/AvailableForDriversScope.php"
public function __invoke(Builder $query, ?Authenticatable $user): Builder
{
    if (! $user) {
        return $query->whereRaw('1 = 0');
    }

    // Service does the expensive lookup once, cached; scope just applies the ids
    $regionIds = app(DriverEligibility::class)->eligibleRegionIds($user);

    return $query->where('status', 'active')->whereIn('region_id', $regionIds);
}
```

**6. Test the class in isolation.** Because it is a plain class, unit-test `__invoke` with a stubbed user and a query builder — no HTTP round-trip needed:

```php title="tests/Unit/AvailableForDriversScopeTest.php"
public function test_unauthenticated_sees_nothing(): void
{
    $sql = (new AvailableForDriversScope)(Route::query(), null)->toSql();

    $this->assertStringContainsString('1 = 0', $sql);
}
```

:::tip
The one-line `scopeXxx` on the model is all the wiring the framework needs; everything else is an ordinary, unit-testable class you own.
:::

### The 403 contract

Unlike filters and sorts, an unknown or non-whitelisted scope name is **not** silently ignored — it returns a `403`, mirroring the [include-authorization](#include-authorization) behavior:

```bash title="terminal"
# 'archived' is not in $allowedScopes, or the policy does not permit it:
GET /api/routes?scope=archived
# → 403 { "message": "Scope 'archived' is not allowed" }
```

Argument mistakes are refused the same way, and these messages do name the parameter, because they are only ever reached after the scope itself was allowed for this user:

```bash title="terminal"
GET /api/routes?scope[window][from]=2026-01-01
# → 403 { "message": "Scope 'window' requires parameter 'to'" }

GET /api/routes?scope[window][nope]=1
# → 403 { "message": "Scope 'window' does not accept parameter 'nope'" }

GET /api/routes?scope[window]=a,b
# → 403 { "message": "Scope 'window' requires named parameters" }

GET /api/routes?scope[availableForDrivers]=yesterday
# → 403 { "message": "Scope 'availableForDrivers' does not accept arguments" }
```

Requesting the declared default scope by name (`?scope=active`) is always allowed, even if you did not list it in `$allowedScopes`.

:::warning The default scope is a convenience, not a security boundary
`$defaultScope` is a listing default that a client **replaces** the moment it selects another scope. Do **not** put mandatory row restrictions (tenancy, visibility) in it — those belong in an always-on **global scope** (`BelongsToOrganization`, `HasAutoScope`, or a manual global scope), which no `?scope=` value can bypass. Note the two meanings of "scope" in Rhino: a **named scope** *selects* a client-chosen subset, while a **global scope** *enforces* a subset on every query.

A named scope can only **narrow** the already-authorized, organization-scoped set — it is applied on top of global scoping and can never widen it.
:::

### Composition and where it applies

Named scopes compose with everything else — `filter`, `sort`, `search`, `fields`, `include`, and pagination all apply on top of the selected scope:

```bash title="terminal"
GET /api/routes?scope=availableForDrivers&sort=-created_at&include=region&page=1&per_page=20
```

Scoping applies to the **index** listing and the **trashed** (soft-delete) listing. A single-record `show` is **not** scoped.

:::tip Prefer `whereHas`/`whereExists` over `join()` in scope bodies
Raw `join()` duplicates rows under `paginate()` and makes `?sort` ambiguous. Use `whereHas`/`whereExists` (as above) so counts and sorting stay correct. If you must use `distinct`, do not combine the scope with `?fields`.
:::

## Pagination

Control page size and navigate through results:

```bash title="terminal"
# Page 1 with 20 items per page
GET /api/posts?page=1&per_page=20

# Page 3
GET /api/posts?page=3&per_page=20
```

### Pagination Headers

Pagination metadata is returned in **response headers**, not the body:

```
X-Current-Page: 2
X-Last-Page: 10
X-Per-Page: 20
X-Total: 195
```

The response body contains only the data array:

```json title="Response"
[
    { "id": 21, "title": "Post 21", ... },
    { "id": 22, "title": "Post 22", ... },
    ...
]
```

### Disabling Pagination

To return all results without pagination:

```php title="app/Models/Tag.php"
class Tag extends Model
{
    public static bool $paginationEnabled = false;
}
```

### Changing Default Page Size

```php title="app/Models/Post.php"
class Post extends Model
{
    protected $perPage = 25; // Default items per page
}
```

## Field Selection

Select only specific fields to reduce payload size:

```bash title="terminal"
# Select specific fields
GET /api/posts?fields[posts]=id,title,status

# Select fields on included relationships too
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

Only fields listed in `$allowedFields` can be selected.

:::info
The table name is used as the key in the `fields` parameter. For a `posts` table, use `fields[posts]=...`.
:::

## Eager Loading (Includes)

Load related models in a single request:

```bash title="terminal"
# Load single relationship
GET /api/posts?include=user

# Load multiple relationships
GET /api/posts?include=user,comments,tags

# Load nested relationships
GET /api/posts?include=comments.user
```

Only relationships listed in `$allowedIncludes` can be loaded.

### Count and Exists

You can get relationship counts or existence checks:

```bash title="terminal"
# Get the count of comments for each post
GET /api/posts?include=commentsCount

# Check if comments exist (boolean)
GET /api/posts?include=commentsExists
```

Response:
```json title="Response"
{
    "id": 1,
    "title": "My Post",
    "comments_count": 15,
    "comments_exists": true
}
```

### Include Authorization

When loading includes, Rhino checks if the user has `viewAny` permission on the included resource. If not, a 403 is returned:

```bash title="terminal"
# If user doesn't have 'comments.index' permission:
GET /api/posts?include=comments
# → 403 { "message": "You do not have permission to include comments." }
```

This prevents users from bypassing permissions through eager loading.

## Combined Example

```bash title="terminal"
GET /api/posts?scope=active&filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=laravel&page=1&per_page=20
```

This single request:
- Selects the `active` named scope (narrowing the base result set)
- Filters to published posts only
- Sorts newest first
- Eager loads user and comments
- Returns only id, title, and excerpt fields
- Searches for "laravel" in searchable columns
- Returns page 1 with 20 items per page

### Response

**Headers:**
```
X-Current-Page: 1
X-Last-Page: 3
X-Per-Page: 20
X-Total: 47
```

**Body:**
```json title="Response"
[
    {
        "id": 42,
        "title": "Getting Started with Laravel",
        "excerpt": "A beginner's guide to Laravel...",
        "user": {
            "id": 1,
            "name": "John Doe"
        },
        "comments": [
            { "id": 1, "content": "Great article!", "user_id": 2 }
        ]
    },
    ...
]
```
