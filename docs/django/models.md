---
sidebar_position: 3
title: Models
---

# Models

Rhino models are standard Django models enhanced with class attributes and mixins that configure API behavior. By configuring these attributes directly on your model, Rhino automatically builds fully-featured API endpoints with filtering, sorting, searching, pagination, validation, and authorization.

## RhinoModel Base Class

The easiest way to get started is to extend `RhinoModel`, which bundles the most commonly needed mixins:

```python title="blog/models.py"
from django.db import models
from rhino.models import RhinoModel

class Post(RhinoModel):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=50, default='draft')

    rhino_allowed_filters = ['status']
    rhino_allowed_sorts = ['created_at', 'title']
    rhino_default_sort = '-created_at'
```

### Included Mixins

| Mixin                | Purpose                                                |
|----------------------|--------------------------------------------------------|
| `SoftDeleteMixin`    | `deleted_at` field, soft delete / restore / force-delete |
| `AuditTrailMixin`    | Automatic change logging via Django signals            |
| `HasValidationMixin` | Role-based validation rules                            |
| `HidableFieldsMixin` | Dynamic field hiding from API responses                |

### Optional Mixins

Add these manually when needed:

| Mixin                          | Purpose                                |
|--------------------------------|----------------------------------------|
| `BelongsToOrganizationMixin`   | Multi-tenant organization scoping      |
| `HasUuidMixin`                 | Auto-generated UUID on creation        |
| `HasPermissionsMixin`          | Permission checking (User model only)  |

```python title="blog/models.py"
from rhino.models import RhinoModel
from rhino.mixins import BelongsToOrganizationMixin, HasUuidMixin

class Invoice(BelongsToOrganizationMixin, HasUuidMixin, RhinoModel):
    # BelongsToOrganizationMixin and HasUuidMixin are added on top of RhinoModel
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    organization_id = models.PositiveIntegerField()
```

:::tip
Open the `RhinoModel` base class (`rhino/models/base.py`) to see all available properties with type hints, defaults, and examples. Your IDE will autocomplete all Rhino configuration attributes.
:::

If you only need a subset of features, use the individual mixins directly instead of subclassing `RhinoModel`.

## Model Configuration

### Query Builder Properties

```python title="blog/models.py"
class Post(RhinoModel):
    # Filtering — ?filter[status]=published&filter[user_id]=5
    rhino_allowed_filters = ['status', 'published', 'category_id']

    # Sorting — ?sort=-created_at or ?sort=title
    rhino_allowed_sorts = ['title', 'created_at', 'updated_at']

    # Default sort (prefix with - for descending)
    rhino_default_sort = '-created_at'

    # Sparse fieldsets — ?fields[posts]=id,title,status
    rhino_allowed_fields = ['id', 'title', 'status', 'created_at']

    # Search (case-insensitive across these fields) — ?search=django
    rhino_allowed_search = ['title', 'content']

    # Eager loading — ?include=author,comments
    rhino_allowed_includes = ['comments', 'author', 'category']
```

### Hidden Fields

```python title="blog/models.py"
class Post(RhinoModel):
    rhino_hidden_fields = ['internal_notes', 'admin_comment']
```

## Available Mixins

### SoftDeleteMixin

Adds `deleted_at` field and custom manager for soft deletes.

```python title="blog/models.py"
from rhino.mixins import SoftDeleteMixin

class Post(SoftDeleteMixin, models.Model):
    title = models.CharField(max_length=255)
```

Automatically adds these endpoints:
- `GET /posts/trashed` — list soft-deleted records
- `POST /posts/{id}/restore` — restore a record
- `DELETE /posts/{id}/force-delete` — permanently delete

### AuditTrailMixin

Automatically logs all create, update, and delete operations.

```python title="blog/models.py"
from rhino.mixins import AuditTrailMixin

class Post(AuditTrailMixin, models.Model):
    title = models.CharField(max_length=255)

    rhino_audit_exclude = ['password', 'secret_field']
```

### HasValidationMixin

Adds role-based field allowlisting with presence modifiers for create and update operations. DRF infers type/format constraints from Django model fields automatically.

```python title="blog/models.py"
from rhino.mixins import HasValidationMixin

class Post(HasValidationMixin, models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default='')

    rhino_store_validation = {
        'admin': {
            'title': 'required',
            'content': 'required',
            'published': 'sometimes',
        },
        'editor': {
            'title': 'required',
            'content': 'required',
        },
        '*': {'title': 'required'},
    }

    rhino_update_validation = ['title', 'content']
```

:::info
For a complete breakdown of validation behaviour, including presence modifiers and role-based rules, see the [Validation](./validation) page.
:::

### HasUuidMixin

Auto-generates a UUID field on creation.

```python title="blog/models.py"
from rhino.mixins import HasUuidMixin

class Post(HasUuidMixin, models.Model):
    title = models.CharField(max_length=255)
    # uuid field is automatically added
```

### BelongsToOrganizationMixin

Marks a model as belonging to an organization for multi-tenant scoping.

```python title="blog/models.py"
from rhino.mixins import BelongsToOrganizationMixin

class Post(BelongsToOrganizationMixin, models.Model):
    title = models.CharField(max_length=255)
    organization_id = models.PositiveIntegerField()
```

### HidableFieldsMixin

Defines fields that should be hidden from API responses.

```python title="blog/models.py"
from rhino.mixins import HidableFieldsMixin

class Post(HidableFieldsMixin, models.Model):
    title = models.CharField(max_length=255)
    internal_notes = models.TextField()

    rhino_hidden_fields = ['internal_notes']
```

### HasPermissionsMixin

Add to your User model to enable Rhino permission checking.

```python title="blog/models.py"
from rhino.mixins import HasPermissionsMixin

class User(HasPermissionsMixin, AbstractUser):
    pass
```

## Complete Example

```python title="blog/models.py"
from django.db import models
from rhino.models import RhinoModel
from rhino.mixins import BelongsToOrganizationMixin, HasUuidMixin

class BlogPost(BelongsToOrganizationMixin, HasUuidMixin, RhinoModel):
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    content = models.TextField(blank=True)
    status = models.CharField(max_length=20, default='draft')
    published = models.BooleanField(default=False)
    internal_notes = models.TextField(blank=True)
    organization_id = models.PositiveIntegerField()
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Query configuration
    rhino_allowed_filters = ['status', 'published', 'author_id']
    rhino_allowed_sorts = ['title', 'created_at', '-published']
    rhino_default_sort = '-created_at'
    rhino_allowed_search = ['title', 'content']
    rhino_allowed_includes = ['author', 'comments']

    # Hidden fields
    rhino_hidden_fields = ['internal_notes']

    # Validation (field allowlisting with presence modifiers)
    rhino_store_validation = {
        'admin': {
            'title': 'required',
            'content': 'required',
            'published': 'sometimes',
            'internal_notes': 'sometimes',
        },
        'editor': {
            'title': 'required',
            'content': 'required',
        },
        '*': {'title': 'required'},
    }

    rhino_update_validation = {
        'admin': {
            'title': 'sometimes',
            'content': 'sometimes',
            'status': 'nullable',
        },
        '*': {
            'title': 'sometimes',
            'content': 'sometimes',
        },
    }

    # Audit
    rhino_audit_exclude = ['internal_notes']
```

## Registration

Register models in your settings:

```python title="settings.py"
RHINO = {
    'MODELS': {
        'blog-posts': 'blog.BlogPost',    # slug → model path
        'categories': 'blog.Category',
    },
}
```

:::info
The dictionary key (e.g., `'blog-posts'`) becomes the URL slug and the permission prefix: `blog-posts.index`, `blog-posts.store`, etc.
:::
