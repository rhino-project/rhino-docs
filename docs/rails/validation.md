---
sidebar_position: 3
title: Validation
---

# Validation

Rhino automatically validates incoming request data on `store` and `update` endpoints using rules you define on your model. Field permissions (which fields each role can write) are controlled by policies. This separation keeps models focused on format constraints and policies focused on authorization.

## How Validation Works

Models opt into validation by including the `HasValidation` concern. You define format rules on the model and field permissions on the policy.

When a request hits a `store` or `update` endpoint, Rhino:

1. Checks the policy's `permitted_attributes_for_create()` or `permitted_attributes_for_update()` to see which fields the user is allowed to set
2. If the request contains forbidden fields, returns a `403 Forbidden` response
3. Runs ActiveModel validations on the permitted fields
4. On failure, returns a `422` response with field-level errors
5. On success, proceeds with the operation using only the validated fields

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation

  # Format rules — type and constraint validation
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true

  # Which fields each role can create or update is defined on the policy.
  # See Policies — Attribute Permissions.
end
```

:::info
Validation runs automatically. You do not need to call any validation method yourself — Rhino intercepts the request before the data reaches your model.
:::

## Model-Level Validation (ActiveModel)

Use standard Rails `validates` declarations for type and format constraints. These are the same validators you already know from Rails:

```ruby title="app/models/post.rb"
validates :title, length: { maximum: 255 }, allow_nil: true
validates :content, length: { maximum: 10_000 }, allow_nil: true
validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
validates :user_id, numericality: { only_integer: true }, allow_nil: true
validates :is_published, inclusion: { in: [true, false] }, allow_nil: true
validates :rating, numericality: { greater_than: 0, less_than_or_equal_to: 5 }, allow_nil: true
```

Any standard ActiveModel validator works: `length`, `numericality`, `inclusion`, `exclusion`, `format`, `uniqueness`, and so on.

:::warning
All validators **must** use `allow_nil: true`. This is critical because validation runs on a blank model instance (`Model.new`), not the actual record. Without `allow_nil: true`, fields that are simply not submitted would fail validation. Presence requirements are handled by the policy's field permissions.
:::

:::tip
Keep model-level validators focused on **type and format constraints** (e.g., `length: { maximum: 255 }`). Field access control (who can set which fields) belongs in the policy, not here.
:::

## Field Permissions via Policy

Which fields are accepted on `store` and `update` is determined by the policy's `permitted_attributes_for_create()` and `permitted_attributes_for_update()` methods. This is where role-based field access lives.

```ruby title="app/policies/post_policy.rb"
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def permitted_attributes_for_create(user)
    if has_role?(user, 'admin')
      ['*']  # Admins can set any field
    else
      ['title', 'content']  # Others can only set title and content
    end
  end

  def permitted_attributes_for_update(user)
    if has_role?(user, 'admin')
      ['*']
    else
      ['title', 'content']
    end
  end
end
```

When a user submits fields they are not permitted to set, the API returns a **403 Forbidden**:

```json title="Response"
{
    "message": "You are not allowed to set the following field(s): status, is_published"
}
```

If the permitted fields pass but fail format validation, the API returns a **422 Unprocessable Entity** with field-level errors (see [Error Response Format](#error-response-format) below).

:::tip
For full documentation on attribute permissions, including `permitted_attributes_for_show()` and `hidden_attributes_for_show()`, see [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

## Error Response Format

When validation fails, the API returns a `422 Unprocessable Entity` response with field-level errors:

```json title="Response"
{
    "errors": {
        "title": ["The title field is required."],
        "content": ["is too long (maximum is 10000 characters)"]
    }
}
```

Each key in the `errors` object corresponds to a field name, and the value is an array of error messages for that field. A single field can have multiple errors if it violates more than one rule.

## Complete Real-World Example

Here is a full `Post` model and policy with role-based field permissions for three roles: **admin**, **editor**, and a default fallback.

### Model

```ruby title="app/models/post.rb"
class Post < ApplicationRecord
  include Rhino::HasRhino
  include Rhino::HasValidation

  # -------------------------------------------------------
  # Format rules: type and constraint validation
  # -------------------------------------------------------
  validates :title, length: { maximum: 255 }, allow_nil: true
  validates :content, length: { maximum: 50_000 }, allow_nil: true
  validates :excerpt, length: { maximum: 500 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
  validates :category_id, numericality: { only_integer: true }, allow_nil: true
  validates :is_published, inclusion: { in: [true, false] }, allow_nil: true
  validates :featured, inclusion: { in: [true, false] }, allow_nil: true
  validates :is_pinned, inclusion: { in: [true, false] }, allow_nil: true
end
```

### Policy

```ruby title="app/policies/post_policy.rb"
class PostPolicy < Rhino::ResourcePolicy
  self.resource_slug = 'posts'

  def permitted_attributes_for_create(user)
    if has_role?(user, 'admin')
      ['*']
    elsif has_role?(user, 'editor')
      ['title', 'content', 'excerpt', 'category_id']
    else
      ['title', 'content']
    end
  end

  def permitted_attributes_for_update(user)
    if has_role?(user, 'admin')
      ['*']
    elsif has_role?(user, 'editor')
      ['title', 'content', 'excerpt', 'category_id']
    else
      ['title', 'content']
    end
  end
end
```

### What Each Role Can Do

| Action | Admin | Editor | Default |
|--------|-------|--------|---------|
| **Create** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |
| **Update** | All fields | `title`, `content`, `excerpt`, `category_id` | Only `title` and `content` |

An **editor** sending `{ "title": "New Post", "content": "...", "is_published": true }` gets a `403` because `is_published` is not in their permitted list.

An **admin** sending the same payload succeeds — all fields are accepted and validated against the format rules.
