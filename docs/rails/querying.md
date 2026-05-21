---
sidebar_position: 4
title: Querying
---

# Advanced Querying

Every Rhino endpoint supports filtering, sorting, search, pagination, field selection, and eager loading — all via query parameters. Powered by a custom `Rhino::QueryBuilder` that wraps ActiveRecord.

## Model Configuration

Define what's queryable on your model:

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino

  # Fields that can be filtered
  rhino_filters :status, :user_id, :category_id

  # Fields that can be sorted
  rhino_sorts :created_at, :title, :updated_at, :published_at

  # Default sort when none specified (prefix with - for descending)
  rhino_default_sort '-created_at'

  # Fields that can be selected
  rhino_fields :id, :title, :content, :status, :created_at

  # Relationships that can be eager loaded
  rhino_includes :user, :comments, :tags, :category

  # Fields searched with ?search= parameter
  rhino_search :title, :content, 'user.name'
end
```

:::warning
Fields **not** listed in these DSL calls are silently ignored. This is a security feature — users can't filter or sort by columns you haven't explicitly allowed.
:::

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

Only fields listed in `rhino_filters` can be filtered.

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

Only fields listed in `rhino_sorts` can be sorted. If no sort is specified, `rhino_default_sort` is used.

## Search

Full-text search across configured fields:

```bash title="terminal"
GET /api/posts?search=rails
```

Searches across all fields listed in `rhino_search`. You can search across relationships too:

```ruby title="app/models/post.rb"
rhino_search :title, :content, 'user.name'
```

```bash title="terminal"
# This searches in post.title, post.content, AND user.name
GET /api/posts?search=john
```

Rhino performs a case-insensitive `LIKE` search. For relationship fields (dot-notation), it automatically applies `left_outer_joins` to include the related table.

:::tip Combine search with filters
```bash title="terminal"
# Search for "rails" only in published posts
GET /api/posts?search=rails&filter[status]=published
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
    { "id": 21, "title": "Post 21", ... },
    { "id": 22, "title": "Post 22", ... },
    ...
]
```

### Enabling Pagination

Pagination is controlled at the model level:

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino

  rhino_pagination_enabled true
end
```

### Disabling Pagination

To return all results without pagination:

```ruby title="app/models/tag.rb"
class Tag < ApplicationRecord
  include Rhino::HasRhino

  rhino_pagination_enabled false  # or simply omit it (false by default)
end
```

### Changing Default Page Size

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino

  rhino_per_page 25  # Default items per page
end
```

:::info
Per-page values are clamped between 1 and 100 to prevent abuse.
:::

## Field Selection

Select only specific fields to reduce payload size:

```bash title="terminal"
# Select specific fields
GET /api/posts?fields[posts]=id,title,status

# Select fields on included relationships too
GET /api/posts?fields[posts]=id,title&fields[users]=id,name&include=user
```

Only fields listed in `rhino_fields` can be selected. The primary key (`id`) is always included automatically.

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

Only relationships listed in `rhino_includes` can be loaded.

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

When loading includes, Rhino checks if the user has `index` permission on the included resource. If not, a 403 is returned:

```bash title="terminal"
# If user doesn't have 'comments.index' permission:
GET /api/posts?include=comments
# → 403 { "message": "You do not have permission to include comments." }
```

This prevents users from bypassing permissions through eager loading.

## Combined Example

```bash title="terminal"
GET /api/posts?filter[status]=published&sort=-created_at&include=user,comments&fields[posts]=id,title,excerpt&search=rails&page=1&per_page=20
```

This single request:
- Filters to published posts only
- Sorts newest first
- Eager loads user and comments
- Returns only id, title, and excerpt fields
- Searches for "rails" in searchable columns
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
        "title": "Getting Started with Rails",
        "excerpt": "A beginner's guide to Rails...",
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
