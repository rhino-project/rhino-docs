---
sidebar_position: 5
title: Querying
---

# Advanced Querying

Every Rhino endpoint supports filtering, sorting, search, pagination, field selection, and eager loading -- all via query parameters. The `QueryBuilderService` translates URL parameters into Prisma queries.

## Model Configuration

Define what is queryable on the model registration in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',

  // Fields that can be filtered
  allowedFilters: ['status', 'userId', 'categoryId'],

  // Fields that can be sorted
  allowedSorts: ['createdAt', 'title', 'updatedAt', 'publishedAt'],

  // Default sort when none specified (prefix with - for descending)
  defaultSort: '-createdAt',

  // Fields that can be selected
  allowedFields: ['id', 'title', 'content', 'status', 'createdAt'],

  // Prisma relations that can be eager loaded
  allowedIncludes: ['author', 'comments', 'tags', 'category'],

  // Fields searched with ?search= parameter
  allowedSearch: ['title', 'content', 'author.name'],
},
```

:::warning
Fields **not** listed in these arrays are silently ignored. This is a security feature -- users cannot filter or sort by columns you have not explicitly allowed.
:::

## Filtering

Filter records by field values:

```bash title="terminal"
# Single filter
GET /api/posts?filter[status]=published

# Multiple filters (AND)
GET /api/posts?filter[status]=published&filter[user_id]=1

# Multiple values for one field (OR via comma-separated)
GET /api/posts?filter[status]=draft,published
```

Only fields listed in `allowedFilters` can be filtered.

When a filter value contains commas, the query builder produces a `WHERE col IN (...)` clause. Otherwise it produces a simple `WHERE col = ?` clause.

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

Only fields listed in `allowedSorts` can be sorted. If no sort is specified, `defaultSort` is used.

### Default Sort

Every model can specify a default sort that applies when no `?sort` parameter is provided:

```ts
defaultSort: '-createdAt',
```

The default sort supports the same comma-separated format as the query parameter. Use the `-` prefix for descending order.

## Search

Full-text search across configured fields:

```bash title="terminal"
GET /api/posts?search=nestjs
```

Searches across all fields listed in `allowedSearch`. The query builder produces an `OR` group of case-insensitive `contains` conditions, one for each configured column.

### Relationship Search

You can search across relationships using dot notation:

```ts
// Model registration
allowedSearch: ['title', 'content', 'author.name'],
```

```bash title="terminal"
# This searches in post.title, post.content, AND author.name
GET /api/posts?search=john
```

Dot-notation columns (e.g., `author.name`) are resolved with a nested Prisma relation filter so the `contains` match runs on the related table.

:::tip Combine search with filters
```bash title="terminal"
# Search for "nestjs" only in published posts
GET /api/posts?search=nestjs&filter[status]=published
```
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
    { "id": 21, "title": "Post 21" },
    { "id": 22, "title": "Post 22" }
]
```

### Per-Page Clamping

The `per_page` value is clamped to the range [1, 100]. Requesting `per_page=0` is clamped to 1, and `per_page=500` is clamped to 100.

### Disabling Pagination

To return all results without pagination:

```ts title="src/rhino.config.ts"
tags: {
  model: 'tag',
  paginationEnabled: false,
},
```

### Changing Default Page Size

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  perPage: 25, // Default items per page (default is 25)
},
```

### Pagination Behavior Summary

| Scenario | Result |
|----------|--------|
| No `?per_page`, `paginationEnabled = false` | Returns all results (no pagination) |
| No `?per_page`, `paginationEnabled = true` | Uses the registration's `perPage` (default 25) |
| `?per_page=20` | Overrides the default, paginates at 20 |
| `?per_page=0` | Clamped to 1 |
| `?per_page=500` | Clamped to 100 |

## Field Selection

Select only specific fields to reduce payload size:

```bash title="terminal"
# Select specific fields
GET /api/posts?fields[posts]=id,title,status

# Select fields on included relationships too
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

Only fields listed in `allowedFields` can be selected.

The `id` column is always included automatically, even if not specified. This ensures relationships and pagination work correctly.

:::info
The table name or model slug is used as the key in the `fields` parameter. For a `posts` table, use `fields[posts]=...`.
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

Only relationships listed in `allowedIncludes` can be loaded. Nested includes (e.g., `comments.user`) are supported via nested Prisma `include` clauses -- the top-level segment must be in the allowed list.

### Count and Exists

You can get relationship counts or existence checks by appending `Count` or `Exists` to an include name:

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

These suffixes are authorized against the base relationship name (`comments`), so the user needs `comments.index` permission.

### Include Authorization

When loading includes, Rhino checks if the user has `viewAny` permission on the included resource. If not, a 403 is returned:

```bash title="terminal"
# If user doesn't have 'comments.index' permission:
GET /api/posts?include=comments
# 403 { "message": "You do not have permission to include comments." }
```

This prevents users from bypassing permissions through eager loading. Each included resource is independently authorized, including nested ones.

:::warning
This applies to all includes, including nested ones. A request like `?include=comments.author` checks permissions on both `comments` and the author resource.
:::

## Combined Example

```bash title="terminal"
GET /api/posts?filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=nestjs&page=1&per_page=20
```

This single request:
- Filters to published posts only
- Sorts newest first
- Eager loads user and comments
- Returns only id, title, and excerpt fields
- Searches for "nestjs" in searchable columns
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
        "title": "Getting Started with NestJS",
        "excerpt": "A beginner's guide to NestJS...",
        "user": {
            "id": 1,
            "name": "John Doe"
        },
        "comments": [
            { "id": 1, "content": "Great article!", "user_id": 2 }
        ]
    }
]
```
