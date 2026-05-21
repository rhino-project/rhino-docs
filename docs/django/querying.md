---
sidebar_position: 5
title: Querying
---

# Querying

Rhino provides powerful query capabilities through URL parameters.

## Model Configuration

```python title="blog/models.py"
class Post(models.Model):
    rhino_allowed_filters = ['status', 'published', 'category_id']
    rhino_allowed_sorts = ['title', 'created_at']
    rhino_allowed_search = ['title', 'content']
    rhino_allowed_includes = ['comments', 'author']
```

## Filtering

Filter records using `filter[field]=value` syntax:

```text title="Request"
GET /api/posts?filter[status]=published
GET /api/posts?filter[published]=true
GET /api/posts?filter[category_id]=5
```

### Multiple Filters

Combine filters with AND logic:

```text title="Request"
GET /api/posts?filter[status]=published&filter[published]=true
```

### IN Filtering

Use comma-separated values for IN queries:

```text title="Request"
GET /api/posts?filter[status]=draft,published
```

:::info
Only fields listed in `rhino_allowed_filters` can be filtered. Unlisted fields are silently ignored.
:::

## Sorting

Sort results using the `sort` parameter. Prefix with `-` for descending:

```text title="Request"
GET /api/posts?sort=title           # Ascending
GET /api/posts?sort=-created_at     # Descending
GET /api/posts?sort=-published,title # Multiple sorts
```

## Search

Search across multiple fields with `?search=`:

```text title="Request"
GET /api/posts?search=django
```

This performs a case-insensitive search (`__icontains`) across all fields in `rhino_allowed_search`.

## Pagination

Request paginated results with `?per_page=`:

```text title="Request"
GET /api/posts?per_page=10
GET /api/posts?per_page=10&page=2
```

### Response Headers

Paginated responses include metadata in headers:

| Header          | Description                |
|-----------------|----------------------------|
| `X-Current-Page`| Current page number        |
| `X-Last-Page`   | Total number of pages      |
| `X-Per-Page`    | Items per page             |
| `X-Total`       | Total number of records    |

:::tip
Without `?per_page`, all records are returned without pagination.
:::

## Includes (Eager Loading)

Load related models using `?include=`:

```text title="Request"
GET /api/posts?include=comments
GET /api/posts?include=comments,author
```

Rhino automatically uses `select_related` for ForeignKey/OneToOne and `prefetch_related` for reverse/ManyToMany relationships.

### Include Authorization

Includes can be restricted via policies:

```python title="blog/policies.py"
class PostPolicy(ResourcePolicy):
    slug = 'posts'

    def view_include(self, user, include_name, organization=None):
        if include_name == 'comments':
            return self._check_permission(user, 'show', organization)
        return True
```

If denied, the API returns `403 Forbidden`.

## Field Selection

Select specific fields with `?fields=`:

```text title="Request"
GET /api/posts?fields=id,title,status
```

## Combined Example

```text title="Request"
GET /api/posts?filter[status]=published&sort=-created_at&search=django&include=comments&per_page=10&page=1
```

Response:
```text title="Response"
HTTP/1.1 200 OK
X-Current-Page: 1
X-Last-Page: 3
X-Per-Page: 10
X-Total: 25

[
  {
    "id": 1,
    "title": "Getting Started with Django",
    "status": "published",
    "comments": [
      {"id": 1, "body": "Great post!", "author_name": "Alice"}
    ]
  }
]
```
