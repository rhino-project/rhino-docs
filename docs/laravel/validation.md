---
sidebar_position: 3
title: Validation
---

# Validation

Validation for `store` and `update` lives in a **request class** — one class per model, per action. A request class owns the whole shape and format contract for that one action: it decides whether the request may proceed at all, what a valid payload looks like, and — because its validated output *is* the write payload — which fields are persisted.

Request classes see the full request context. A rule can branch on the authenticated user, the resolved organization, the matched route group, and, on update, the record as it exists before the write.

```php title="app/Http/Requests/PostStoreRequest.php"
<?php

namespace App\Http\Requests;

use Rhino\Http\Requests\ResourceRequest;

class PostStoreRequest extends ResourceRequest
{
    public function rules(): array
    {
        return [
            'title'       => 'required|string|max:255',
            'content'     => 'required|string',
            'status'      => 'required|string|in:draft,published,archived',
            'category_id' => 'required|integer|exists:categories,id',
        ];
    }

    public function messages(): array
    {
        return ['title.required' => 'Every post needs a title.'];
    }
}
```

That file is all the wiring there is. Rhino finds it by name and runs it on `POST /api/posts`.

```bash title="terminal"
curl -X POST http://localhost:8000/api/acme/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"","content":"...","status":"pending","category_id":4}'
```

```json title="422 Unprocessable Entity"
{
    "errors": {
        "title": ["Every post needs a title."],
        "status": ["The selected status is invalid."]
    }
}
```

Each key is a field name and each value is an array of messages, so one field can report several failures at once.

:::tip Field permissions are a policy concern
A request class never *grants* a field. **Which fields a role may write** is decided by the policy's `permittedAttributesForCreate()` / `permittedAttributesForUpdate()`, which run before the request class and answer `403`. See [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

## Discovery

Rhino resolves a request class **per action, independently**, on every request:

1. **Explicit registration** — `rhino.requests.map.{slug}.{store|update}` in `config/rhino.php`, keyed by the same slug as `rhino.models`.
2. **Convention** — `{Model}StoreRequest` / `{Model}UpdateRequest` in the namespace from `rhino.requests.namespace`, where `{Model}` is the model class *basename* (`App\Models\BlogPost` → `BlogPostStoreRequest`).
3. **None** — the action falls back to the model-level rules described at the [bottom of this page](#model-level-validation-deprecated).

```php title="config/rhino.php"
'requests' => [
    // Namespace scanned for {Model}StoreRequest / {Model}UpdateRequest.
    'namespace' => 'App\\Http\\Requests',

    // Explicit per-model override, keyed by the SAME slug used in 'models'.
    'map' => [
        'posts' => [
            'store'  => \App\Api\CreatePost::class,
            'update' => \App\Api\EditPost::class,
        ],
    ],
],
```

Resolution is per action, so a model may declare only `PostStoreRequest` and leave `update` alone.

:::warning A configured class that cannot be loaded is a hard error
An entry in `requests.map` naming a class that does not exist, or that is not a `FormRequest` subclass, throws `RuntimeException: Rhino: request class [X] configured for [posts.store] does not exist.` A validation class that is silently ignored is a security hole, so Rhino refuses to start the request instead.

A **convention** name that resolves to something that is not a `FormRequest` is logged and ignored — the convention is Rhino's guess, not something you asked for, so an unrelated class of the same name never breaks the app.
:::

## The context

Everything a request class may know about the write is reachable through a helper. `rules()`, `authorize()`, `messages()`, `attributes()`, `after()` and `withValidator()` keep their native zero-argument signatures — Laravel invokes them through the container, so a declared `$ctx` parameter would be resolved as a dependency and fail.

| Helper | Value |
|---|---|
| `$this->user()` | The authenticated user, or `null`. Pinned to the user Rhino authenticated, whichever guard served the route. |
| `$this->organization()` | The resolved tenant. `null` outside a tenant route group and in single-tenant apps. |
| `$this->routeGroup()` | The matched route's group (`'tenant'`, `'public'`, …), or `null`. |
| `$this->action()` | `'store'` or `'update'` — useful when one class is mapped to both. |
| `$this->record()` | On update, the record **as it was before the write**. `null` on store. |
| `$this->input()` / `$this->all()` | The request input, after `prepare()`. |

`record()` comes from the organization-scoped query the update already performed, never from a fresh lookup by bare id, so a record-dependent rule can never see another tenant's state.

```php title="app/Http/Requests/PostUpdateRequest.php"
public function rules(): array
{
    return [
        'title'   => 'sometimes|string|max:255',
        'content' => 'sometimes|string',

        // A published post cannot be dragged back to draft by anyone but an admin.
        'status'  => $this->record()?->status === 'published' && ! $this->isAdmin()
            ? 'sometimes|string|in:published,archived'
            : 'sometimes|string|in:draft,published,archived',
    ];
}

protected function isAdmin(): bool
{
    return $this->user()?->getRoleSlugForValidation($this->organization()) === 'admin';
}
```

## `authorize()` — refusing the request

`authorize()` returns `false` to refuse the whole request with a **403**. It is a second, narrower gate than the policy's `create`/`update` check, which has already passed by the time it runs.

```php title="app/Http/Requests/PostStoreRequest.php"
public function authorize(): bool
{
    // This model is readable from the public group, but only writable from the app.
    return $this->routeGroup() !== 'public';
}
```

```json title="403 Forbidden"
{
    "message": "This action is unauthorized."
}
```

:::danger The 403 is deliberately indistinguishable from a policy denial
A refusal is raised as a **fresh** `Illuminate\Auth\Access\AuthorizationException` carrying the default message, and rendered by your application's exception handler — exactly the path a policy denial from `Gate::authorize()` takes. Under Laravel's default handler that is the body shown above; an app that customises how access denials render gets its own body, and gets it **identically for both cases**. Whatever message a developer throws inside `authorize()` is discarded and never surfaced.

That symmetry is the security property: otherwise `authorize()` would become an oracle telling an attacker *why* they were refused, and the presence of a request class would itself be detectable.

```php
// ❌ Bad — an explanatory message reads as if the client will see it. It is
//          discarded, so this is only an obscure way of returning false — and it
//          is exactly the line someone later "fixes" into a real leak.
public function authorize(): bool
{
    throw new AuthorizationException("post {$this->record()->id} is locked by user 42");
}

// ✅ Good — refuse, and say nothing. Log it if you need the reason.
public function authorize(): bool
{
    return $this->record()?->locked_by === null;
}
```
:::

:::note Customising the response
Laravel converts `AuthorizationException` into `AccessDeniedHttpException` in `prepareException`, **before** renderables run — so a custom renderable must hook `AccessDeniedHttpException`, not `AuthorizationException`. Whatever you register applies to policy denials and request-class denials alike, which is what keeps the two indistinguishable.
:::

## `prepare()` — normalizing the input

`prepare()` receives the input and returns it, and whatever it returns replaces the input for `authorize()`, the rules and the write payload.

```php title="app/Http/Requests/PostStoreRequest.php"
public function prepare(array $input): array
{
    if (is_string($input['title'] ?? null)) {
        $input['title'] = trim($input['title']);
        $input['slug'] = Str::slug($input['title']);
    }

    return $input;
}
```

:::note `prepare()` runs before the rules
The input is still exactly what the client sent — a field can be an array, an integer or `null`. Guard the
type before touching it and leave anything malformed for the rules to reject: an unguarded `trim()` on an
array is a `TypeError`, which surfaces as a 500 instead of a clean 422.
:::

Two rules govern it:

- It runs **after** the policy's forbidden-field check, which inspects exactly what the client sent. Nothing `prepare()` does can launder a field past the policy.
- Therefore everything it writes is **server-authored and trusted**, at the same level as the framework-managed `organization_id`. Never copy a client value into a different key — that writes a field the policy denied.

```php
// ❌ Bad — the policy denies owner_id, so the client sends user_id and prepare()
//          copies it across. The forbidden-field check never saw owner_id.
$input['owner_id'] = $input['user_id'] ?? $this->user()?->id;

// ✅ Good — server state only
$input['owner_id'] = $this->user()?->id;
```

A key `prepare()` adds is still only persisted if a rule covers it — `slug` above needs `'slug' => 'required|string'` in `rules()` or it is dropped.

Returning anything that is not an array is treated as "no change"; the original input is used.

## What gets persisted

**The write payload is `validated()`** — the keys covered by a rule that passed, and nothing else.

:::warning A field with no rule is silently dropped, not saved
There is no error. The request succeeds, the response is `200`/`201`, and the column is simply unchanged. Declare a rule for **every** field this action should write, even if the rule is as loose as `'nullable'`.

This fails closed on purpose: when a policy permits `['*']`, the request class is the only field filter left, and the alternative is mass assignment.
:::

```bash title="terminal"
# PostUpdateRequest declares no rule for `featured`
curl -X PUT http://localhost:8000/api/acme/posts/12 \
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

- **No narrowing to permitted attributes.** Rhino does not intersect a request class's rules with `permittedAttributesForCreate/Update`. Write the class so the *narrowest* role the policy permits can satisfy it, and branch on `$this->user()` where the rules genuinely differ.
- **No partial-update relaxation.** An `UpdateRequest` declares its own partial semantics. Mark every rule `sometimes` (and `nullable` where a null is legal) — that is exactly what having a separate Update class is for.

## Multi-tenancy

Two things are applied on top of the rules you declare, whenever the request is served in a tenant context:

- **`exists:` rules are scoped to the current organization.** Write the plain rule; Rhino rewrites it. For a table that carries `organization_id` the rule gains the column directly. For a table that reaches its organization through a relationship — `comments.post_id → posts.organization_id` — Rhino walks the foreign-key chain and builds the equivalent subquery.
- **`organization_id` is removed from the ruleset**, because it is framework-managed and applied after validation. It always wins over anything `prepare()` or the client set, so a request class can never be used to cross tenants.

```php title="app/Http/Requests/PostStoreRequest.php"
// ✅ Good — plain rule; Rhino scopes it to the organization on the route
'category_id' => 'required|integer|exists:categories,id',

// ❌ Bad — hand-rolled scoping. It is redundant for a directly-owned table and
//          WRONG for an indirectly-owned one, where there is no organization_id
//          column to match on at all.
'category_id' => 'required|integer|exists:categories,id,organization_id,' . $this->organization()->id,
```

A cross-tenant reference comes back as an ordinary validation failure:

```json title="422 Unprocessable Entity"
{
    "errors": {
        "category_id": ["The selected category id is invalid."]
    }
}
```

## The pipeline

For `POST /{resource}` and `PUT /{resource}/{id}`, in order:

1. **Authentication** — `401` if absent.
2. **Policy gate** — `create` / `update`. `403` on denial.
3. **Record load** (update only), organization-scoped. `404` if not found.
4. **`organization_id` handling** — stripped from the input on store; a `403` on update, in a tenant context.
5. **Policy forbidden-field check**, on the **raw** client input. `403` listing the fields.
6. **The request class**, if one is resolved for this action:
   1. `prepare()` — replaces the input for everything after it.
   2. `authorize()` — `false` ⇒ `403`.
   3. the rules — failures ⇒ `422`.
   4. `after()` / `withValidator()` hooks.
7. **Framework-managed fields** (`organization_id`) applied last and unconditionally.
8. **Persist** `validated()`.

`prepare()` running before `authorize()` matches Laravel's own `FormRequest` lifecycle, and means `authorize()` always sees normalized input.

## Cross-field checks and messages

`messages()` and `attributes()` work exactly as they do in any `FormRequest`. Checks that need the whole payload at once go in `withValidator()`:

```php title="app/Http/Requests/PostStoreRequest.php"
public function withValidator(\Illuminate\Validation\Validator $validator): void
{
    $validator->after(function ($validator) {
        if ($this->input('status') === 'published' && ! $this->input('published_at')) {
            $validator->errors()->add('published_at', 'A published post needs a publish date.');
        }
    });
}
```

## Nested operations

Request classes apply per operation inside `POST /nested`, resolved from each operation's own model: a `{"action":"create"}` operation runs the `store` class, an `{"action":"update"}` operation runs the `update` class with `record()` populated from the organization-scoped row.

:::warning `routeGroup()` is `null` inside nested operations
The nested endpoint is a single route registered outside the per-group loop, so it carries no `route_group` default. `$this->organization()` is still populated — the route sits under the tenant prefix — but a rule that branches on `$this->routeGroup()` takes its fallback branch for every nested operation. Branch on the organization, the user's role or `$this->action()` instead, or make the group-restricted branch the stricter one.
:::

See [Nested Operations](./nested-operations#validation).

## Generating one

`php artisan rhino:generate` offers **Request (validation for store/update)** in its menu, asks for the model name, then for store, update or both. The stub is commented with a rule for every hook, including a record-dependent rule and a role-dependent rule. See [Generator](./generator#generating-a-request).

## Stack notes

- **A plain `FormRequest` subclass is accepted.** Rhino runs any `Illuminate\Foundation\Http\FormRequest`, and the `422` / `403` envelopes are identical. What it does *not* get: the `organization()` / `routeGroup()` / `action()` / `record()` helpers, the `prepare()` hook, and — most importantly — **`exists:` rules are not rewritten to the organization**. Extend `ResourceRequest` unless you have a reason not to.
- **Never resolve a request class through the container.** `app(PostStoreRequest::class)` validates immediately, before any context is injected, so `rules()` would see a null user and a null record. Rhino builds the instance by hand for exactly this reason. Do not type-hint one in a controller signature either.

## Related

- [Policies](./policies#attribute-permissions) — which fields each role may write, and the `403` that enforces it
- [Models](./models) — the rest of the model declaration surface
- [Multi-Tenancy](./multi-tenancy) — how the organization on the route is resolved
- [Nested Operations](./nested-operations) — batched writes, validated per operation
- [Generator](./generator) — scaffolding a request class
- [Best Practices — Data Lifecycle](./best-practices/data-lifecycle) — the opinionated version, on one example app

## Model-level validation (deprecated)

:::caution Deprecated
The 4.x model-level properties — `$validationRules`, `$validationRulesStore`, `$validationRulesUpdate` (including the role-keyed form) and `$validationRulesMessages` — still work, unchanged, for any model and action with no request class. They are **deprecated** and will be removed in **5.0**.

Move a model at your own pace: discovery is per action, so a model can use `PostStoreRequest` for `store` while `update` still runs the model's rules. The [upgrade guide](./upgrading#moving-a-model-to-request-classes) has the before/after, including how role-keyed rules become a branch on the user.
:::
