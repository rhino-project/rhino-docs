---
sidebar_position: 3
title: Validation
---

# Validation

Validation for `store` and `update` lives in a **request class** — one class per model, per action. A request class owns the whole shape and format contract for that one action: it decides whether the request may proceed at all, what a valid payload looks like, and — because its declared attributes *are* the write payload — which fields are persisted.

Request classes see the full request context. A validation can branch on the authenticated user, the resolved organization, the matched route group, and, on update, the record as it exists before the write.

```ruby title="app/requests/post_store_request.rb"
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

That file is all the wiring there is. `app/requests/` is autoloaded by Zeitwerk like every other `app/*` directory, so there is **no initializer to edit and no `eager_load_paths` entry to add**. Rhino finds the class by name and runs it on `POST /api/posts`.

```bash title="terminal"
curl -X POST http://localhost:3000/api/acme/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"","content":"...","status":"pending","category_id":4}'
```

```json title="422 Unprocessable Entity"
{
    "errors": {
        "title": ["can't be blank"],
        "status": ["is not included in the list"]
    }
}
```

Each key is a field name and each value is an array of messages, so one field can report several failures at once.

:::tip Field permissions are a policy concern
A request class never *grants* a field. **Which fields a role may write** is decided by the policy's `permitted_attributes_for_create` / `permitted_attributes_for_update`, which run before the request class and answer `403`. See [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

## Discovery

Rhino resolves a request class **per action, independently**, on every request:

1. **Explicit registration** — `store_request:` / `update_request:` on the model's `config.model` call.
2. **Convention** — `{Model}StoreRequest` / `{Model}UpdateRequest`, where `{Model}` is the model class name without its namespace (`Blog::Post` → `PostStoreRequest`).
3. **None** — the action falls back to the model-level validations described at the [bottom of this page](#model-level-validation-deprecated).

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |config|
  config.model :posts, "Post"
  config.model :tasks, "Task", store_request: "CreateTask", update_request: "EditTask"
end
```

Registrations are **class names, as strings**, never constants: Rhino re-resolves them on every request so a dev-mode Zeitwerk reload never hands back an unloaded class.

Resolution is per action, so a model may declare only `PostStoreRequest` and leave `update` alone.

:::warning A registered class that cannot be loaded is a hard error
A `store_request:` / `update_request:` naming a constant that does not exist, or that does not inherit from `Rhino::ResourceRequest`, raises `Rhino::ConfigurationError: Rhino: request class [CreateTask] configured for [tasks.store] does not exist.` A validation class that is silently ignored is a security hole, so Rhino refuses the request instead.

A **convention** name that resolves to something that is not a `Rhino::ResourceRequest` is logged and ignored — the convention is Rhino's guess, not something you asked for, so an unrelated class of the same name never breaks the app.
:::

## The context

Six readers are available inside `authorize?`, `prepare` and every validation:

| Reader | Value |
|---|---|
| `user` | The authenticated user, or `nil`. |
| `organization` | The resolved tenant. `nil` outside a tenant route group and in single-tenant apps. |
| `route_group` | The matched route's group (`"tenant"`, `"public"`, …), or `nil`. |
| `action` | `"store"` or `"update"` — useful when one class is registered for both. |
| `record` | On update, the record **as it was before the write**. `nil` on store. |
| `input` | The prepared request data, string-keyed. |

`record` comes from the organization-scoped query the update already performed, never from a fresh lookup by bare id, so a record-dependent validation can never see another tenant's state.

```ruby title="app/requests/post_update_request.rb"
class PostUpdateRequest < Rhino::ResourceRequest
  attribute :title, :string
  attribute :content, :string
  attribute :status, :string

  validates :title, length: { maximum: 255 }, allow_nil: true

  # A published post cannot be dragged back to draft by anyone but an admin.
  validate :published_posts_stay_published

  private

  def published_posts_stay_published
    return if record.nil? || status.nil?
    return unless record.status == "published" && status == "draft"
    return if user&.role_slug_for_validation(organization) == "admin"

    errors.add(:status, "cannot be returned to draft once published")
  end
end
```

:::note There is no `rules` method and no `messages` method
Rules are ordinary ActiveModel declarations — that is what makes this a *Rails* request class. Dynamic rules use `validate :method_name` or `validates ..., if: -> { … }` with the readers in scope, and messages use the standard `message:` option or i18n:

```ruby
validates :title, presence: true, message: "is required on every post"
validates :budget, presence: true, if: -> { route_group == "admin" }
```
:::

## `authorize?` — refusing the request

`authorize?` returns `false` to refuse the whole request with a **403**. It is a second, narrower gate than the policy's `create?` / `update?` check, which has already passed by the time it runs.

```ruby title="app/requests/post_store_request.rb"
def authorize?
  route_group != "public"
end
```

```json title="403 Forbidden"
{
    "message": "This action is unauthorized."
}
```

:::danger The 403 body is deliberately indistinguishable from a policy denial
The message is hard-coded and a request class cannot customize it. Otherwise `authorize?` would become an oracle that tells an attacker *why* they were refused, and the presence of a request class would itself be detectable.

```ruby
# ❌ Bad — the reason (and the record's state) reaches the client
def authorize?
  raise Pundit::NotAuthorizedError, "post #{record.id} is locked by user 42"
end

# ✅ Good — refuse, and say nothing
def authorize?
  record&.locked_by.nil?
end
```
:::

## `prepare` — normalizing the input

`prepare` receives a string-keyed copy of the input and returns a hash, and whatever it returns replaces the input for `authorize?`, the validations and the write payload.

```ruby title="app/requests/post_store_request.rb"
def prepare(input)
  title = input["title"]
  status = input["status"]

  input.merge(
    "title" => title.is_a?(String) ? title.strip : title,
    # `blank?` is total — it answers for any object — so it needs no guard.
    "status" => status.blank? ? "draft" : status
  )
end
```

:::warning Guarding `prepare` is only half the job
`prepare` runs before the validations, so the input is exactly what the client sent — a field can be an
Array, an Integer or `nil`. Guard every string operation with `is_a?(String)` and leave anything else
untouched, so `prepare` neither blows up nor mangles a bad value into a good-looking one.

But leaving it for the validations is **not enough on its own**. `attribute :title, :string` casts
whatever survives `prepare`, and `ActiveModel`'s string cast is total: `["x"]` becomes the String
`'["x"]'`, which then sails past `presence` and `length` exactly as if the client had sent real text.

When the shape matters, check the **raw** input alongside the cast value:

```ruby title="app/requests/post_store_request.rb"
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string

  validates :title, presence: true, length: { maximum: 255 }
  validate :title_must_be_text

  def prepare(input)
    title = input["title"]
    input.merge("title" => title.is_a?(String) ? title.strip : title)
  end

  private

  # `validates` sees the CAST value; this sees what the client actually sent.
  def title_must_be_text
    return if input["title"].nil? || input["title"].is_a?(String)

    errors.add(:title, "must be a string")
  end
end
```

```json title="422 Unprocessable Entity"
{
    "errors": { "title": ["must be a string"] }
}
```

This is a Rails-specific consequence of `ActiveModel::Attributes` casting, so **don't port it** — Laravel's
`string` rule rejects an array outright, and Zod's `z.string()` does not coerce.
:::

Two rules govern it:

- It runs **after** the policy's forbidden-field check, which inspects exactly what the client sent. Nothing `prepare` does can launder a field past the policy.
- Therefore everything it writes is **server-authored and trusted**, at the same level as the framework-managed `organization_id`. Never copy a client value into a different key — that writes a field the policy denied.

```ruby
# ❌ Bad — the policy denies owner_id, so the client sends user_id and prepare
#          copies it across. The forbidden-field check never saw owner_id.
input.merge("owner_id" => input["user_id"] || user&.id)

# ✅ Good — server state only
input.merge("owner_id" => user&.id)
```

A key `prepare` adds is still only persisted if an `attribute` declares it. A return value that is not a Hash is treated as "no change"; the original input is used.

## What gets persisted

**The write payload is the declared attributes that are present in the prepared input**, with their cast values. Nothing else.

:::warning A field with no `attribute` declaration is silently dropped, not saved
There is no error. The request succeeds, the response is `200`/`201`, and the column is simply unchanged. Declare an `attribute` for **every** field this action should write, whether or not it also carries a `validates`.

This fails closed on purpose: when a policy permits `["*"]`, the request class is the only field filter left, and the alternative is mass assignment.
:::

```bash title="terminal"
# PostUpdateRequest declares no `attribute :featured`
curl -X PUT http://localhost:3000/api/acme/posts/12 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Renamed","featured":true}'
```

```json title="200 OK"
{
    "id": 12,
    "title": "Renamed",
    "featured": false
}
```

Two consequences follow from the same rule:

- **No narrowing to permitted attributes.** Rhino does not intersect a request class's attributes with `permitted_attributes_for_create/update`. Write the class so the *narrowest* role the policy permits can satisfy it, and branch on `user` where the rules genuinely differ.
- **No partial-update relaxation.** An update class declares its own partial semantics — `allow_nil: true`, or a validation guarded by `if:`. The model-level path inferred that from the keys the client happened to send; a request class states it, which is exactly what having a separate update class is for.

Only declared attributes are assigned, and only when the input actually contains them, so an absent attribute keeps its declared default rather than being overwritten with `nil`.

:::warning Model-level `validates` still run at save time
A request class replaces the model's validations for the **422**, not for the save. Rhino persists with
`create!` / `update!`, so every ActiveRecord validation still declared on the model runs inside that
call, against the request class's write payload.

A model rule the request class does not reproduce is therefore never consulted while the rules run — but
it can still refuse the write. When it does, Rhino renders it in the same envelope the request class's
own failures use, built from the record's errors:

```json title="422 Unprocessable Entity"
{
    "errors": {
        "title": ["is too long (maximum is 255 characters)"]
    }
}
```

Inside `POST /nested` the failing operation rolls the whole transaction back — no operation in the batch
is written — and the response keeps the nested envelope:

```json title="422 Unprocessable Entity"
{
    "message": "Validation failed.",
    "errors": { "operations.0.data.title": ["is too long (maximum is 255 characters)"] }
}
```

The status and the shape are right either way, but the rule is still in the wrong place: it is invisible
to anyone reading the request class, it cannot see the user or the record, and its message is the model's
rather than one you wrote.

```ruby title="app/models/post.rb"
# ❌ Bad — the model rule is STRICTER than the request class. A 256-character
#          title passes the request class and is only caught at create!, by a
#          rule nobody reading PostStoreRequest can see.
class Post < Rhino::RhinoModel
  validates :title, length: { maximum: 255 }, allow_nil: true
end

# app/requests/post_store_request.rb
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string
  validates :title, presence: true          # looser than the model
end
```

```ruby title="app/requests/post_store_request.rb"
# ✅ Good — the request class is a SUPERSET of the model's rules, so the 422 is
#           decided in one place, with your message.
class PostStoreRequest < Rhino::ResourceRequest
  attribute :title, :string
  validates :title, presence: true,
            length: { maximum: 255, message: "must be 255 characters or fewer" }
end
```

Two ways to keep it in one place, in order of preference: **move the model's rules into the request
class** and delete them from the model, or **keep the request class's rules a superset** of whatever the
model still declares. Invariants you genuinely want enforced for every writer — seeds, console,
background jobs — are a legitimate reason to keep a model rule; just make sure the request class rejects
the same values first.

This rescue is confined to the request-class path. A model and action still on model-level validation is
unchanged: it runs those rules up front, so a save-time `RecordInvalid` was never reachable there.
:::

## Multi-tenancy

In a tenant context, Rhino runs its **cross-tenant foreign-key check on top of** the request class's own validations, using the same database introspection the model-level path uses — direct `organization_id` ownership, and indirect ownership through a `belongs_to` chain such as `comment → post → organization`. Failures merge into the same `422` body:

```json title="422 Unprocessable Entity"
{
    "errors": {
        "category_id": ["does not belong to your organization"]
    }
}
```

:::warning The FK check reads the write payload
It inspects the *validated* hash, so a foreign key with no `attribute` declaration is never checked — because it is never written either. Declare every FK the action writes.
:::

`organization_id` is framework-managed: it is stripped from the input on store, rejected with a `403` on update, and applied last and unconditionally. A request class can never be used to cross tenants.

## The pipeline

For `POST /{resource}` and `PUT /{resource}/:id`, in order:

1. **Authentication** — `401` if absent.
2. **Policy gate** — `create?` / `update?`. `403` on denial.
3. **Record load** (update only), organization-scoped. `404` if not found.
4. **`organization_id` handling** — stripped from the input on store; a `403` on update, in a tenant context.
5. **Policy forbidden-field check**, on the **raw** client input. `403` listing the fields.
6. **The request class**, if one is resolved for this action:
   1. `prepare` — replaces the input for everything after it.
   2. `authorize?` — `false` ⇒ `403`.
   3. the validations — failures ⇒ `422`.
7. **Cross-tenant FK check**, merged into the same `422`.
8. **Framework-managed fields** (`organization_id`) applied last and unconditionally.
9. **Persist** the validated hash.

`prepare` running before `authorize?` means `authorize?` always sees normalized input, and matches the other Rhino stacks.

## Nested operations

Request classes apply per operation inside `POST /nested`, resolved from each operation's own model: a `{"action":"create"}` operation runs the store class, an `{"action":"update"}` operation runs the update class with `record` populated from the organization-scoped row.

:::warning `route_group` is `nil` inside nested operations
The nested endpoint is registered under the tenant prefix but outside the per-group scope that sets the `route_group` default, so `route_group` is `nil` for every operation in the batch. `organization` is still populated. A validation guarded by `if: -> { route_group == "admin" }` therefore does not run in a nested write — branch on `organization`, the user's role or `action` instead, or make the group-restricted branch the stricter one.
:::

See [Nested Operations](./nested-operations#validation).

## Generating one

`rails rhino:generate` offers **Request (validation for store/update)** in its menu, asks for the model name, then for store, update or both. The template is commented with an example of every hook, including a record-dependent validation and a role-dependent one. See [Generator](./generator#generating-a-request).

## Related

- [Policies](./policies#attribute-permissions) — which fields each role may write, and the `403` that enforces it
- [Models](./models) — the rest of the model declaration surface
- [Multi-Tenancy](./multi-tenancy) — how the organization on the route is resolved
- [Nested Operations](./nested-operations) — batched writes, validated per operation
- [Generator](./generator) — scaffolding a request class

## Model-level validation (deprecated)

:::caution Deprecated
ActiveModel validations declared on the model itself — the `validates ..., allow_nil: true` convention read by `Rhino::HasValidation` — still work, unchanged, for any model and action with no request class. They are **deprecated** and will be removed in **5.0**.

Move a model at your own pace: discovery is per action, so a model can use `PostStoreRequest` for `store` while `update` still runs the model's validations. The [upgrade guide](./upgrading#moving-a-model-to-request-classes) has the before/after, including what happens to the `allow_nil: true` convention.
:::
