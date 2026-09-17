---
sidebar_position: 98
title: Upgrading
---

# Upgrading

Version-to-version upgrade notes for Rhino for Laravel. Each section lists what is required, what is optional, and what changes on its own. For the full list of what shipped in a release, see the [Release Notes](./release-notes).

## 4.9 → 4.10 {#4-9-4-10}

**Nothing is required.** Upgrade the package and your app behaves exactly as it did on 4.9.0.

```bash title="terminal"
composer require rhino-project/rhino-laravel:^4.10
```

- **`routes/api.php` is not affected.** Do **not** republish routes.
- **`config/rhino.php` republish is optional.** 4.10.0 adds a `requests` block, but every key is read with a default, so request classes work by convention on an un-republished config. Republish only if you want the explicit `requests.map`:

  ```bash title="terminal"
  php artisan vendor:publish --tag=config --force
  ```

  Diff the result before committing — `--force` overwrites your existing config.
- **No database changes, no new routes, no response-shape changes.**

### One thing to check before you deploy

:::warning An existing `App\Http\Requests\{Model}StoreRequest` is now applied
Rhino discovers request classes by convention: for every `store` and `update` it looks for `{Model}StoreRequest` / `{Model}UpdateRequest` in the namespace from `rhino.requests.namespace` (default `App\Http\Requests`), where `{Model}` is the model class basename.

If your app already owns a class at one of those names — a `FormRequest` you wrote for your own non-Rhino controller, say — Rhino will start running it on that model's Rhino endpoints, and **its `validated()` output becomes the write payload**. That is a real behavior change for an app that happens to use those names.

```bash title="terminal"
# Find the collisions before upgrading
ls app/Http/Requests | grep -E '(Store|Update)Request\.php$'
```

Your options, in order of preference: rename the class, point `rhino.requests.namespace` at a directory Rhino owns exclusively, or adopt the class deliberately by making it extend `Rhino\Http\Requests\ResourceRequest`.

A name that resolves to something that is **not** a `FormRequest` is logged and ignored, so a helper class or an enum of the same name is harmless.
:::

### Model-level validation is deprecated

`$validationRules`, `$validationRulesStore`, `$validationRulesUpdate` (including the role-keyed form) and `$validationRulesMessages` still work, byte for byte, and are consulted for every model and action with no request class. They are **deprecated** and will be **removed in 5.0**.

There is no runtime deprecation warning — nothing is logged and nothing is emitted on the wire.

### Moving a model to request classes

Migration is per action, so you can move `store` and leave `update` alone. The three things that change when you move a model:

**1. Rules move into a class, keyed the same way.**

```php title="app/Models/Post.php"
// Before — on the model
protected $validationRules = [
    'title'       => 'required|string|max:255',
    'content'     => 'required|string',
    'status'      => 'string|in:draft,published,archived',
    'category_id' => 'required|integer|exists:categories,id',
];

protected $validationRulesMessages = [
    'title.required' => 'Every post needs a title.',
];
```

```php title="app/Http/Requests/PostStoreRequest.php"
// After — one class per action
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

`exists:` rules keep working the same way — Rhino scopes them to the current organization on a request class exactly as it does on the model.

**2. Role-keyed rules become a branch on the user.**

```php title="app/Models/Post.php"
// Before — a map keyed by role slug, invisible to whoever reads the policy
protected $validationRulesStore = [
    'admin'  => ['title' => 'required', 'status' => 'required|string'],
    'editor' => ['title' => 'required', 'status' => 'required|in:draft'],
    '*'      => ['title' => 'required'],
];
```

```php title="app/Http/Requests/PostStoreRequest.php"
// After — an ordinary branch, with the user in scope
public function rules(): array
{
    $role = $this->user()?->getRoleSlugForValidation($this->organization());

    $rules = ['title' => 'required|string|max:255'];

    if ($role === 'admin') {
        $rules['status'] = 'required|string';
    } elseif ($role === 'editor') {
        $rules['status'] = 'required|string|in:draft';
    }

    // Any other role gets no `status` rule at all, so the field is not
    // written — the same outcome the '*' entry produced.

    return $rules;
}
```

**3. Partial updates become explicit.** The model-level path narrowed update rules to the keys the client happened to send. A request class does not: mark every rule in an `UpdateRequest` `sometimes` (and `nullable` where a null is legal).

```php title="app/Http/Requests/PostUpdateRequest.php"
public function rules(): array
{
    return [
        'title'   => 'sometimes|string|max:255',
        'content' => 'sometimes|string',
        'status'  => 'sometimes|string|in:draft,published,archived',
    ];
}
```

:::warning Declare a rule for every field the action writes
The write payload is `validated()` — the keys covered by a rule that passed. A field with no rule is **silently dropped**: the request succeeds, and the column is unchanged. There is no error and no log line.

The most common way to get bitten is to port the rules for the fields you care about and forget the ones the old `$validationRules` covered incidentally. Compare the two lists field by field. The generator's stub exists for this reason — `php artisan rhino:generate` → **Request**.
:::

You can delete the model's `$validationRules` once both actions have a request class, or leave them; they are simply not consulted for an action that has one.

### Known limitation: the Postman export

`php artisan rhino:export-postman` builds its example `store` / `update` bodies from `$validationRules` / `$validationRulesStore` / `$validationRulesUpdate`. A request class's `rules()` cannot be introspected without a live request, so the exporter does not read them.

A model that has moved to request classes **and deleted its `$validationRules`** exports `store` and `update` requests with an empty example body. The requests themselves are still emitted, with the right URL, method and auth. Keep `$validationRules` on the model if you rely on the export for those bodies — it costs nothing, because the request class takes precedence anyway.

### Related

- [Validation](./validation) — request classes in full
- [Release Notes — 4.10.0](./release-notes)
