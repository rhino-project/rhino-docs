---
sidebar_position: 98
title: Upgrading
---

# Upgrading

Version-to-version upgrade notes for Rhino for Rails. Each section lists what is required, what is optional, and what changes on its own. For the full list of what shipped in a release, see the [Release Notes](./release-notes).

## 4.9 → 4.10 {#4-9-4-10}

**Nothing is required.** Upgrade the gem and your app behaves exactly as it did on 4.9.0.

```bash title="terminal"
bundle update rhino-rails
```

- **No initializer change.** `config/initializers/rhino.rb` gains optional `store_request:` / `update_request:` keywords on `config.model`, but nothing existing has to move.
- **No `eager_load_paths` entry, no engine change.** Request classes live in `app/requests/`, and Zeitwerk autoloads every `app/*` directory already. Create the directory when you need it.
- **No database changes, no new routes, no response-shape changes.**

### One thing to check before you deploy

:::warning An existing `Rhino::ResourceRequest` subclass named `{Model}StoreRequest` is now applied
Rhino discovers request classes by convention: for every `store` and `update` it constantizes `{Model}StoreRequest` / `{Model}UpdateRequest`, where `{Model}` is the model class name without its namespace.

A constant with one of those names that is **not** a `Rhino::ResourceRequest` is logged and ignored, so an unrelated class of the same name keeps working. In practice that means nothing in a 4.9.0 app can be picked up accidentally — the base class did not exist yet. Check anyway if you vendored a preview build.
:::

### One behavior change inside `POST /nested`

:::warning Nested operations now run the cross-tenant FK check on the request-class path
The model-level nested path validates each operation's data **without** the organization, so its cross-tenant foreign-key check does not run there. An operation validated by a **request class** does run it, exactly as the top-level `store` / `update` endpoints do.

The practical effect is that a nested operation referencing another organization's row, which used to be written, is now a `422`:

```json title="422 Unprocessable Entity"
{
    "message": "Validation failed.",
    "errors": { "operations.0.data.category_id": ["does not belong to your organization"] }
}
```

This is a fix, not a regression, and it only applies once you move a model to a request class. Nothing changes for models still on model-level validations.
:::

### Model-level validation is deprecated

ActiveModel validations declared on the model itself — the `validates ..., allow_nil: true` convention read by `Rhino::HasValidation` — still work, byte for byte, and are consulted for every model and action with no request class. They are **deprecated** and will be **removed in 5.0**.

There is no runtime deprecation warning — nothing is logged and nothing is emitted on the wire.

### Moving a model to request classes

Migration is per action, so you can move `store` and leave `update` alone. The three things that change when you move a model:

**1. Validations move into a class, and gain an `attribute` declaration.**

```ruby title="app/models/post.rb"
# Before — on the model
class Post < Rhino::RhinoModel
  validates :title, presence: true, length: { maximum: 255 }, allow_nil: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
  validates :category_id, numericality: { only_integer: true }, allow_nil: true
end
```

```ruby title="app/requests/post_store_request.rb"
# After — one class per action
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string
  attribute :content, :string
  attribute :status, :string
  attribute :category_id, :integer

  validates :title, presence: true, length: { maximum: 255 }
  validates :content, presence: true
  validates :status, inclusion: { in: %w[draft published archived] }, allow_nil: true
  validates :category_id, presence: true, numericality: { only_integer: true }
end
```

The `attribute` lines are the part with no equivalent on the model: a request class is an `ActiveModel::Model`, not the record, so it has to be told which fields exist and what type each one is.

**2. `allow_nil: true` stops being mandatory.** The model-level path validated a blank `Model.new`, so every validator needed `allow_nil: true` or an unsubmitted field would fail. A request class validates the input it was actually given, so **`presence: true` finally means what it says** — use it for fields a `store` genuinely requires, and keep `allow_nil: true` on an update class where a partial payload is normal.

**3. Rules that depended on the user, the route group or the record become ordinary branches.** They had nowhere to live on the model; now the context readers are in scope.

```ruby title="app/requests/post_update_request.rb"
validates :status, inclusion: { in: %w[draft published] },
          if: -> { user&.role_slug_for_validation(organization) != "admin" }

validates :budget, presence: true, if: -> { route_group == "admin" }

validate :published_posts_stay_published

private

def published_posts_stay_published
  return if record.nil? || status.nil?
  return unless record.status == "published" && status == "draft"

  errors.add(:status, "cannot be returned to draft once published")
end
```

:::warning Declare an `attribute` for every field the action writes
The write payload is the declared attributes present in the prepared input. A field with no `attribute` is **silently dropped**: the request succeeds, and the column is unchanged. There is no error and no log line.

That also applies to the cross-tenant FK check, which reads the write payload — an undeclared foreign key is neither written nor checked.

The most common way to get bitten is to port the validations and forget the columns that had no validation at all but were still written. Compare against the model's writable columns, field by field. The generator's template exists for this reason — `rails rhino:generate` → **Request**.
:::

You can delete the model's `validates` lines once both actions have a request class, or leave them; they are simply not consulted for an action that has one.

### Related

- [Validation](./validation) — request classes in full
- [Release Notes — 4.10.0](./release-notes)
