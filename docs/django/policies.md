---
sidebar_position: 6
title: Policies
---

# Policies

Policies control who can perform which actions on your resources.

## How Policies Work

1. User makes a request (e.g., `POST /api/posts`)
2. Rhino finds the policy registered for the `posts` slug
3. The policy method for the action is called (e.g., `create()`)
4. If denied, a `403 Forbidden` response is returned

## Creating a Policy

```python title="blog/policies.py"
from rhino.policies import ResourcePolicy

class PostPolicy(ResourcePolicy):
    slug = 'posts'
```

Register the policy:

```python title="blog/apps.py"
from django.apps import AppConfig

class BlogConfig(AppConfig):
    def ready(self):
        from rhino.registry import registry
        from .policies import PostPolicy
        registry.register_policy('posts', PostPolicy)
```

## Permission Format

Permissions follow the pattern `{slug}.{action}`:

| Permission         | Grants Access To               |
|--------------------|--------------------------------|
| `posts.index`      | List posts                     |
| `posts.show`       | View a single post             |
| `posts.store`      | Create posts                   |
| `posts.update`     | Update posts                   |
| `posts.destroy`    | Delete posts                   |
| `posts.trashed`    | View trashed posts             |
| `posts.restore`    | Restore trashed posts          |
| `posts.force_delete` | Permanently delete posts     |

### Wildcards

```python title="blog/policies.py"
['*']           # All permissions on all resources
['posts.*']     # All permissions on posts
```

## Permission Storage

Permissions are stored as a JSON list on the Role model:

```python title="blog/models.py"
class Role(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    permissions = models.JSONField(default=list)

class UserRole(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True)
```

### Example Roles

```python title="terminal"
# Admin - full access
Role.objects.create(name='Admin', slug='admin', permissions=['*'])

# Editor - limited access
Role.objects.create(name='Editor', slug='editor', permissions=[
    'posts.index', 'posts.show', 'posts.store', 'posts.update',
])

# Viewer - read only
Role.objects.create(name='Viewer', slug='viewer', permissions=[
    'posts.index', 'posts.show',
])
```

## Column Hiding

Policies can hide fields from API responses:

```python title="blog/policies.py"
class PostPolicy(ResourcePolicy):
    slug = 'posts'

    def hidden_fields(self, user):
        if is_admin(user):
            return []
        return ['internal_notes', 'admin_comment']
```

## Include Authorization

Control access to relationship includes:

```python title="blog/policies.py"
class PostPolicy(ResourcePolicy):
    slug = 'posts'

    def view_include(self, user, include_name, organization=None):
        if include_name == 'audit_logs':
            return self._check_permission(user, 'show', organization)
        return True
```

## Custom Policy Logic

Override any method for custom authorization:

```python title="blog/policies.py"
class PostPolicy(ResourcePolicy):
    slug = 'posts'

    def update(self, user, obj, organization=None):
        # Only allow updating own posts (or admin)
        if user.has_rhino_permission('*', organization):
            return True
        return obj.author_id == user.pk

    def delete(self, user, obj, organization=None):
        # Only allow deletion within 24 hours of creation
        from django.utils import timezone
        from datetime import timedelta
        if timezone.now() - obj.created_at > timedelta(hours=24):
            return False
        return self._check_permission(user, 'destroy', organization)
```

## Error Responses

- **`401 Unauthorized`** — No authentication token provided
- **`403 Forbidden`** — Authenticated but lacks permission
