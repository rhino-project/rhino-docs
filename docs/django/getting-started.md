---
sidebar_position: 1
title: Getting Started
---

# Getting Started

Rhino for Django automatically generates full CRUD REST API endpoints for your Django models with built-in security, validation, multi-tenancy, and audit trails.

## Installation

```bash title="terminal"
pip install rhino-django
```

Or add to your `requirements.txt`:

```text title="requirements.txt"
rhino-django>=0.1.0
```

## Setup

### 1. Add to INSTALLED_APPS

```python title="settings.py"
INSTALLED_APPS = [
    # ...
    'rest_framework',
    'rest_framework.authtoken',
    'django_filters',
    'rhino',
    # ...
]
```

### 2. Configure REST Framework

```python title="settings.py"
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}
```

### 3. Add Middleware

```python title="settings.py"
MIDDLEWARE = [
    # ...
    'rhino.signals.AuditMiddleware',  # Required for audit trail
]
```

### 4. Configure Rhino

```python title="settings.py"
RHINO = {
    'MODELS': {
        'posts': 'blog.Post',
        'categories': 'blog.Category',
        'comments': 'blog.Comment',
    },
    'PUBLIC': ['categories'],  # No auth required
    'MULTI_TENANT': {
        'ENABLED': False,
        'USE_SUBDOMAIN': False,
        'ORGANIZATION_MODEL': None,
        'ORGANIZATION_IDENTIFIER_FIELD': 'id',
    },
    'INVITATIONS': {
        'EXPIRES_DAYS': 7,
        'ALLOWED_ROLES': None,  # None = all roles can invite
    },
    'NESTED': {
        'PATH': 'nested',
        'MAX_OPERATIONS': 50,
        'ALLOWED_MODELS': None,  # None = all registered models
    },
}
```

### 5. Include URLs

```python title="urls.py"
from django.urls import path
from rhino.urls import get_urls

urlpatterns = [
    path('api/', include((get_urls(), 'rhino'))),
]
```

### 6. Run Migrations

```bash title="terminal"
python manage.py migrate
```

## Define Your Models

```python title="blog/models.py"
from django.db import models
from rhino.models import RhinoModel

class Post(RhinoModel):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=50, default='draft')
    published = models.BooleanField(default=False)

    # Rhino configuration
    rhino_allowed_filters = ['status', 'published']
    rhino_allowed_sorts = ['title', 'created_at']
    rhino_allowed_search = ['title', 'content']
    rhino_allowed_includes = ['comments']

    rhino_store_validation = ['title', 'content']
    rhino_update_validation = ['title', 'content', 'status']
```

:::tip RhinoModel
`RhinoModel` extends `django.db.models.Model` and includes `SoftDeleteMixin`, `AuditTrailMixin`, `HasValidationMixin`, and `HidableFieldsMixin` out of the box. Open the base class to see all available properties with type hints, defaults, and examples.

For additional features, add mixins manually:
```python title="blog/models.py"
from rhino.models import RhinoModel
from rhino.mixins import BelongsToOrganizationMixin, HasUuidMixin

class Post(BelongsToOrganizationMixin, HasUuidMixin, RhinoModel):
    # ...
```
:::

## Auto-Generated Endpoints

Once registered, Rhino generates these endpoints automatically:

| Method   | Endpoint              | Description           |
|----------|-----------------------|-----------------------|
| `GET`    | `/api/posts`          | List all posts        |
| `POST`   | `/api/posts`          | Create a post         |
| `GET`    | `/api/posts/{id}`     | Get a single post     |
| `PUT`    | `/api/posts/{id}`     | Update a post         |
| `DELETE` | `/api/posts/{id}`     | Delete (soft delete)  |
| `GET`    | `/api/posts/trashed`  | List soft-deleted     |
| `POST`   | `/api/posts/{id}/restore` | Restore deleted   |
| `DELETE` | `/api/posts/{id}/force-delete` | Permanently delete |

### Authentication Endpoints

| Method | Endpoint                    | Description                  |
|--------|-----------------------------|------------------------------|
| `POST` | `/api/auth/login`           | Login with email & password  |
| `POST` | `/api/auth/logout`          | Revoke token                 |
| `POST` | `/api/auth/password/recover`| Request password reset       |
| `POST` | `/api/auth/password/reset`  | Reset password with token    |
| `POST` | `/api/auth/register`        | Register via invitation      |

### Invitation Endpoints

| Method   | Endpoint                          | Description            |
|----------|-----------------------------------|------------------------|
| `GET`    | `/api/invitations`                | List invitations       |
| `POST`   | `/api/invitations`                | Create invitation      |
| `POST`   | `/api/invitations/{id}/resend`    | Resend invitation      |
| `DELETE` | `/api/invitations/{id}/cancel`    | Cancel invitation      |
| `POST`   | `/api/invitations/accept`         | Accept invitation      |

:::tip
Models in the `PUBLIC` list skip authentication, making them accessible without a token.
:::
