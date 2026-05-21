---
sidebar_position: 11
title: Testing
---

# Testing

Rhino for Django includes a comprehensive test suite with 93 tests covering all features. This guide explains the test structure and how to write tests for your Rhino-powered API.

## Running Tests

```bash title="terminal"
# Run all tests
python -m pytest tests/ -v

# Run a specific test file
python -m pytest tests/test_crud.py -v

# Run a specific test class
python -m pytest tests/test_crud.py::TestCRUDOperations -v
```

## Test Structure

The test suite is organized by feature area:

| File                       | Tests | Description                          |
|----------------------------|-------|--------------------------------------|
| `test_route_registration.py` | 7   | URL pattern generation               |
| `test_crud.py`             | 11    | Create, Read, Update, Delete         |
| `test_pagination.py`       | 5     | Pagination headers and behavior      |
| `test_soft_delete.py`      | 6     | Soft delete, restore, force delete   |
| `test_search.py`           | 6     | Global search across fields          |
| `test_filters.py`          | 6     | Filtering and sorting                |
| `test_audit_trail.py`      | 7     | Audit log creation and accuracy      |
| `test_validation.py`       | 7     | Validation rules and role-based      |
| `test_permissions.py`      | 10    | Policy system and permission checks  |
| `test_nested.py`           | 8     | Nested batch operations              |
| `test_includes.py`         | 5     | Relationship includes and auth       |
| `test_multi_tenant.py`     | 8     | Organization scoping and middleware  |
| `test_hidable_fields.py`   | 6     | Dynamic field hiding                 |

**Total: 93 tests**

## Test Setup

### Settings

```python title="tests/settings.py"
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'rest_framework.authtoken',
    'django_filters',
    'rhino',
    'tests',
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

RHINO = {
    'MODELS': {
        'posts': 'tests.Post',
        'categories': 'tests.Category',
        'comments': 'tests.Comment',
        'articles': 'tests.Article',
    },
    'PUBLIC': ['categories'],
}
```

### Test Models

The test suite uses these models:

- **Post** — Full-featured: soft delete, audit trail, validation, hidden fields
- **Category** — Simple: no soft delete, public access
- **Comment** — Relationship: belongs to Post
- **Article** — Multi-tenant: organization scope, UUID

### Fixtures (conftest.py)

```python title="tests/conftest.py"
@pytest.fixture
def auth_client(api_client, user):
    """API client authenticated with a token."""
    token, _ = Token.objects.get_or_create(user=user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return api_client
```

## Writing Tests for Your App

### Testing CRUD Operations

```python title="tests/test_crud.py"
import pytest
from myapp.models import Post

@pytest.mark.django_db
class TestPostCRUD:

    def test_create_post(self, auth_client):
        response = auth_client.post('/api/posts', {
            'title': 'My Post',
            'content': 'Hello World',
        })
        assert response.status_code == 201
        assert response.json()['title'] == 'My Post'

    def test_list_posts(self, auth_client):
        Post.objects.create(title='Post 1')
        Post.objects.create(title='Post 2')

        response = auth_client.get('/api/posts')
        assert response.status_code == 200
        assert len(response.json()) == 2
```

### Testing Pagination

```python title="tests/test_pagination.py"
@pytest.mark.django_db
def test_pagination_headers(auth_client):
    for i in range(25):
        Post.objects.create(title=f'Post {i}')

    response = auth_client.get('/api/posts?per_page=10')
    assert response['X-Total'] == '25'
    assert response['X-Last-Page'] == '3'
    assert len(response.json()) == 10
```

### Testing Search

```python title="tests/test_search.py"
@pytest.mark.django_db
def test_search(auth_client):
    Post.objects.create(title='Django Guide', content='Learn Django')
    Post.objects.create(title='Flask Tutorial', content='Learn Flask')

    response = auth_client.get('/api/posts?search=Django')
    assert len(response.json()) == 1
```

### Testing Soft Deletes

```python title="tests/test_soft_delete.py"
@pytest.mark.django_db
def test_soft_delete_and_restore(auth_client):
    post = Post.objects.create(title='Test')

    # Soft delete
    auth_client.delete(f'/api/posts/{post.pk}')
    assert Post.objects.count() == 0
    assert Post.all_objects.count() == 1

    # Restore
    response = auth_client.post(f'/api/posts/{post.pk}/restore')
    assert response.status_code == 200
    assert Post.objects.count() == 1
```

### Testing Nested Operations

```python title="tests/test_nested.py"
@pytest.mark.django_db
def test_nested_create(auth_client):
    response = auth_client.post('/api/nested', {
        'operations': [
            {'model': 'posts', 'action': 'create', 'data': {'title': 'Post 1'}},
            {'model': 'posts', 'action': 'create', 'data': {'title': 'Post 2'}},
        ]
    }, format='json')
    assert response.status_code == 200
    assert Post.objects.count() == 2
```

### Testing Audit Trail

```python title="tests/test_audit_trail.py"
@pytest.mark.django_db
def test_audit_trail(auth_client):
    from rhino.models import AuditLog

    response = auth_client.post('/api/posts', {'title': 'Test'})
    assert response.status_code == 201

    logs = AuditLog.objects.filter(action='created')
    assert logs.count() == 1
    assert 'title' in logs.first().new_values
```

## URL Setup for Tests

Each test file uses a `rhino_urls` fixture to register routes:

```python title="tests/conftest.py"
@pytest.fixture
def rhino_urls(settings):
    from rhino.registry import ModelRegistry
    ModelRegistry.reset()
    import tests.urls as urls_module
    from rhino.router import get_rhino_urls
    from django.urls import path
    rhino_patterns = get_rhino_urls()
    urls_module.urlpatterns = [
        path(f'api/{u.pattern}', u.callback, name=u.name)
        for u in rhino_patterns
    ]
```

:::tip
Always reset the `ModelRegistry` in test setup to ensure clean state between tests.
:::
