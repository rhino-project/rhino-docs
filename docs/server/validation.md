---
sidebar_position: 3
title: Validation
---

# Validation

Rhino automatically validates incoming request data on `store` and `update` endpoints using rules you define on your model. Field permissions (which fields each role can write) are controlled by policies. This separation keeps models focused on format constraints and policies focused on authorization.

## How Validation Works

Models opt into validation by using the `HasValidation` trait. You define format rules on the model and field permissions on the policy.

When a request hits a `store` or `update` endpoint, Rhino:

1. Checks the policy's `permittedAttributesForCreate()` or `permittedAttributesForUpdate()` to see which fields the user is allowed to set
2. If the request contains forbidden fields, returns a `403 Forbidden` response
3. Loads the format rules from `$validationRules` for the permitted fields
4. Validates the request data against those rules
5. On failure, returns a `422` response with field-level errors
6. On success, proceeds with the operation using only the validated fields

```php title="app/Models/Post.php"
use Illuminate\Database\Eloquent\Model;
use Rhino\LaravelApi\Traits\HasValidation;
use Rhino\LaravelApi\Traits\HidableColumns;

class Post extends Model
{
    use HasValidation, HidableColumns;

    // Format rules — type and constraint validation
    protected $validationRules = [
        'title'   => 'string|max:255',
        'content' => 'string',
        'status'  => 'string|in:draft,published,archived',
    ];

    // Custom error messages (optional)
    protected $validationRulesMessages = [
        'title.required' => 'Every post needs a title.',
    ];
}
```

Which fields each role can create or update is defined on the policy. See [Policies — Attribute Permissions](./policies#attribute-permissions).

:::info
Validation runs automatically. You do not need to call any validation method yourself -- Rhino intercepts the request before the data reaches your model.
:::

## Validation Rules (`$validationRules`)

Define the validation constraints for **all** fields on the model. These rules specify the type and format of each field.

```php title="app/Models/Post.php"
protected $validationRules = [
    'title'        => 'string|max:255',
    'content'      => 'string',
    'status'       => 'string|in:draft,published,archived',
    'user_id'      => 'integer|exists:users,id',
    'is_published' => 'boolean',
    'featured'     => 'boolean',
    'published_at' => 'date',
    'tags'         => 'array',
    'tags.*'       => 'string|max:50',
];
```

Any standard Laravel validation rule works here: `email`, `unique`, `exists`, `image`, `json`, `min`, `max`, `regex`, and so on.

:::tip
Keep rules focused on **type and format constraints** (e.g., `string|max:255`). Field access control (who can set which fields) belongs in the policy, not here.
:::

## Field Permissions via Policy

Which fields are accepted on `store` and `update` is determined by the policy's `permittedAttributesForCreate()` and `permittedAttributesForUpdate()` methods. This is where role-based field access lives.

```php title="app/Policies/PostPolicy.php"
class PostPolicy extends ResourcePolicy
{
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*']; // Admins can set any field
        }

        return ['title', 'content']; // Others can only set title and content
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*'];
        }

        return ['title', 'content'];
    }
}
```

When a user submits fields they are not permitted to set, the API returns a **403 Forbidden**:

```json title="Response"
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

If the permitted fields pass but fail format validation, the API returns a **422 Unprocessable Entity** with field-level errors (see [Error Response Format](#error-response-format) below).

:::tip
For full documentation on attribute permissions, including `permittedAttributesForShow()` and `hiddenAttributesForShow()`, see [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

## Custom Error Messages

Define custom messages using the standard Laravel `field.rule` format:

```php title="app/Models/Post.php"
protected $validationRulesMessages = [
    'title.required'   => 'Every post needs a title.',
    'title.max'        => 'Title cannot exceed 255 characters.',
    'status.in'        => 'Status must be draft, published, or archived.',
    'content.required' => 'Please provide content for the post.',
];
```

These messages apply to both store and update actions. They follow the exact same syntax as [Laravel's custom validation messages](https://laravel.com/docs/validation#custom-error-messages).

:::tip
Define messages for the rules most likely to fail -- especially `required` and format rules like `in`, `email`, and `max`. This makes your API much friendlier for frontend developers consuming the error responses.
:::

## Error Response Format

When validation fails, the API returns a `422 Unprocessable Entity` response with field-level errors:

```json title="Response"
{
    "errors": {
        "title": ["Every post needs a title."],
        "status": ["Status must be draft, published, or archived."]
    }
}
```

Each key in the `errors` object corresponds to a field name, and the value is an array of error messages for that field. A single field can have multiple errors if it violates more than one rule.

## Complete Real-World Example

Here is a full `Post` model and policy with role-based field permissions for three roles: **admin**, **editor**, and a default fallback.

### Model

```php title="app/Models/Post.php"
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Rhino\LaravelApi\Traits\HasValidation;
use Rhino\LaravelApi\Traits\HidableColumns;

class Post extends Model
{
    use HasValidation, HidableColumns;

    protected $fillable = [
        'title', 'content', 'excerpt', 'status',
        'category_id', 'is_published', 'featured',
        'is_pinned', 'published_at', 'tags',
    ];

    // -------------------------------------------------------
    // Format rules: type and constraint validation
    // -------------------------------------------------------
    protected $validationRules = [
        'title'        => 'string|max:255',
        'content'      => 'string',
        'excerpt'      => 'string|max:500',
        'status'       => 'string|in:draft,published,archived',
        'category_id'  => 'integer|exists:categories,id',
        'is_published' => 'boolean',
        'featured'     => 'boolean',
        'is_pinned'    => 'boolean',
        'published_at' => 'date',
        'tags'         => 'array',
        'tags.*'       => 'string|max:50',
    ];

    // -------------------------------------------------------
    // Custom error messages
    // -------------------------------------------------------
    protected $validationRulesMessages = [
        'title.required'     => 'Every post needs a title.',
        'title.max'          => 'Title cannot exceed 255 characters.',
        'content.required'   => 'Please provide content for the post.',
        'excerpt.max'        => 'Excerpt cannot exceed 500 characters.',
        'status.in'          => 'Status must be one of: draft, published, or archived.',
        'category_id.exists' => 'The selected category does not exist.',
        'tags.*.max'         => 'Each tag must be 50 characters or fewer.',
    ];
}
```

### Policy

```php title="app/Policies/PostPolicy.php"
<?php

namespace App\Policies;

use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Policies\ResourcePolicy;

class PostPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'posts';

    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*'];
        }

        if ($this->hasRole($user, 'editor')) {
            return ['title', 'content', 'excerpt', 'category_id'];
        }

        return ['title', 'content'];
    }

    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        if ($this->hasRole($user, 'admin')) {
            return ['*'];
        }

        if ($this->hasRole($user, 'editor')) {
            return ['title', 'content', 'excerpt', 'category_id'];
        }

        return ['title', 'content'];
    }
}
```

### What Each Role Can Do

| Action | Admin | Editor | Default |
|--------|-------|--------|---------|
| **Create** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |
| **Update** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |

An **editor** sending `{ "title": "New Post", "content": "...", "is_published": true }` gets a `403` because `is_published` is not in their permitted list.

An **admin** sending the same payload succeeds -- all fields are accepted and validated against the format rules.
