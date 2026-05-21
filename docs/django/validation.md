---
sidebar_position: 4
title: Validation
---

# Validation

Rhino provides a two-layer validation system through the `HasValidationMixin`:

1. **DRF model-field inference** — Django REST Framework's `ModelSerializer` automatically reads `max_length`, `choices`, `validators`, etc. from your Django model field definitions. `rhino_validation_schema` lets you override the inferred behaviour for specific fields.
2. **Store/update rules** (`rhino_store_validation` / `rhino_update_validation`) — role-based field allowlisting with presence modifiers.

## HasValidationMixin

Apply the mixin to your model, or extend `RhinoModel` (which includes it automatically):

```python title="blog/models.py"
from django.db import models
from rhino.models import RhinoModel

class Post(RhinoModel):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=50, default='draft')

    rhino_store_validation = ['title', 'content']
    rhino_update_validation = ['title', 'content', 'status']
```

The mixin adds these class methods:

| Method | Description |
|---|---|
| `get_permitted_fields(action, role_slug)` | Returns `{field: modifier}` for the given action and role. |
| `get_serializer_extra_kwargs(action, role_slug)` | Returns `(fields, extra_kwargs)` for building DRF serializers. |

## DRF Model-Field Inference

DRF's `ModelSerializer` already reads type and format constraints from your Django model fields:

```python title="blog/models.py"
class Post(RhinoModel):
    title = models.CharField(max_length=255)           # → CharField(max_length=255, required=True)
    content = models.TextField(blank=True, default='') # → CharField(required=False)
    score = models.IntegerField(default=0)             # → IntegerField(required=False)
```

You do **not** need to redeclare these constraints. Only use `rhino_validation_schema` when the API contract should differ from the database schema.

## Validation Schema (Optional Overrides)

Use `rhino_validation_schema` to override DRF-inferred field behaviour for specific fields:

```python title="blog/models.py"
class Post(RhinoModel):
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=50, default='draft')
    score = models.IntegerField(default=0)

    # Only list fields that need overrides
    rhino_validation_schema = {
        'status': {'choices': ['draft', 'published', 'archived']},
        'score': {'min_value': 0, 'max_value': 100},
    }
```

Values are DRF serializer-field keyword arguments. Common overrides:

| kwarg | Example | Purpose |
|---|---|---|
| `choices` | `['draft', 'published']` | Restrict to allowed values |
| `min_value` | `0` | Minimum for numeric fields |
| `max_value` | `100` | Maximum for numeric fields |
| `max_length` | `100` | Override model's max_length |
| `validators` | `[validate_slug]` | Custom validator functions |

## Store and Update Rules

`rhino_store_validation` and `rhino_update_validation` control which fields are accepted for each operation. They act as an **allowlist** — fields not listed for the user's role are silently ignored.

### Flat List Format

The simplest approach. List the field names to permit (all treated as `required`):

```python title="blog/models.py"
class Post(RhinoModel):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default='')
    status = models.CharField(max_length=50, default='draft')

    # Only accept title and content when creating
    rhino_store_validation = ['title', 'content']

    # Accept title, content, and status when updating
    rhino_update_validation = ['title', 'content', 'status']
```

### Role-Keyed Dict Format

For role-based validation, use a dict where keys are role slugs and values map fields to presence modifiers:

```python title="blog/models.py"
rhino_store_validation = {
    'admin': {
        'title': 'required',
        'status': 'nullable',
        'internal_notes': 'nullable',
    },
    'editor': {
        'title': 'required',
        'content': 'required',
    },
    '*': {
        'title': 'required',
    },
}
```

The `'*'` key is the fallback used when the user's role does not match any specific key.

## Presence Modifiers

Each field in a role's rules maps to a presence modifier:

| Modifier | Behaviour |
|---|---|
| `required` | Field must be present and non-empty. Returns an error if missing. |
| `nullable` | Field is included in output. If not present in input, defaults to `None`. |
| `sometimes` | Field is only included if present in input. If absent, it is skipped entirely. |

## How Validation Works

When a create or update request arrives, Rhino follows this process:

1. **Resolve permitted fields** — find the matching role key (or `'*'` fallback) to determine which fields are allowed and their presence modifiers.
2. **Build dynamic serializer** — only the permitted fields are included in the `ModelSerializer`'s `fields` list. Fields not in the allowlist are excluded from the serializer entirely.
3. **Apply presence modifiers** — `required`, `nullable`, and `sometimes` are translated to DRF serializer kwargs (`required=True`, `allow_null=True`, etc.).
4. **Merge schema overrides** — any `rhino_validation_schema` entries for permitted fields are merged into `extra_kwargs`.
5. **DRF validation** — the dynamically-built `ModelSerializer` validates type, format, and presence constraints using DRF's native validation pipeline.
6. **Return result** — `201 Created` with data on success, or `400 Bad Request` with field-level errors.

:::info No config passthrough
If no store/update rules are defined (empty `{}` or `[]`), all model fields pass through unchanged. This is useful for models that don't need field allowlisting.
:::

## Validation Response

When validation fails, the API returns an HTTP `400 Bad Request` response:

```json title="Response"
{
    "title": ["This field is required."],
    "status": ["\"invalid\" is not a valid choice."]
}
```

Each field key maps to an array of error messages. These are standard DRF error messages.

## Complete Example

```python title="blog/models.py"
from django.db import models
from rhino.models import RhinoModel

class Article(RhinoModel):
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, default='draft')
    priority = models.IntegerField(default=1)
    author_email = models.EmailField(max_length=255, blank=True)

    # Override DRF-inferred behaviour for specific fields
    rhino_validation_schema = {
        'status': {'choices': ['draft', 'review', 'published']},
        'priority': {'min_value': 1, 'max_value': 10},
    }

    # Store: only title and body are required
    rhino_store_validation = {
        '*': {'title': 'required', 'body': 'required'},
    }

    # Update: role-based overrides
    rhino_update_validation = {
        'admin': {
            'title': 'sometimes',
            'body': 'sometimes',
            'status': 'nullable',
            'priority': 'nullable',
        },
        '*': {
            'title': 'sometimes',
            'body': 'sometimes',
            'status': 'sometimes',
        },
    }
```

In this example:

- **Creating** an article requires `title` and `body`. Other fields are silently ignored.
- **Updating** as an `admin` allows all four fields optionally, with `status` and `priority` accepting null.
- **Updating** as any other role allows `title`, `body`, and `status` optionally.
- DRF enforces that `title` is max 255 chars, `status` is one of the allowed values, `priority` is between 1-10, and `author_email` is a valid email — all inferred from the Django model fields and `rhino_validation_schema`.
