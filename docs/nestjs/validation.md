---
sidebar_position: 4
title: Validation
---

# Validation

Validation for `store` and `update` lives in a **request class** — one class per model, per action. A request class owns the whole shape and format contract for that one action: it decides whether the request may proceed at all, what a valid payload looks like, and — because the schema's parse output *is* the write payload — which fields are persisted.

Request classes see the full request context. A schema can branch on the authenticated user, the resolved organization, the matched route group, and, on update, the record as it exists before the write.

```ts title="src/requests/post-store.request.ts"
import { z } from 'zod';
import { ResourceRequest, type ResourceRequestContext } from '@rhino-dev/rhino-nestjs';

export class PostStoreRequest extends ResourceRequest {
  rules(_ctx: ResourceRequestContext) {
    return z.object({
      title: z.string().min(1).max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
      categoryId: z.number().int(),
    });
  }
}
```

Register it on the model:

```ts title="src/rhino.config.ts"
import { PostStoreRequest } from './requests/post-store.request';
import { PostUpdateRequest } from './requests/post-update.request';

models: {
  posts: {
    model: 'post',
    requests: { store: PostStoreRequest, update: PostUpdateRequest },
  },
},
```

```bash title="terminal"
curl -X POST http://localhost:3000/api/acme/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"","content":"...","status":"pending","categoryId":4}'
```

```json title="422 Unprocessable Entity"
{
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": {
    "errors": {
      "title": ["String must contain at least 1 character(s)"],
      "status": ["Invalid enum value. Expected 'draft' | 'published' | 'archived'"]
    }
  }
}
```

Inside `details.errors`, each key is a field path and each value is an array of messages, so one field can report several failures at once. A root-level issue with no path is keyed `_`.

:::tip Field permissions are a policy concern
A request class never *grants* a field. **Which fields a role may write** is decided by the policy's `permittedAttributesForCreate()` / `permittedAttributesForUpdate()`, which run before the request class and answer `403 FORBIDDEN_FIELDS`. See [Policies — Attribute Permissions](./policies#attribute-permissions).
:::

## Registration

NestJS has no filesystem discovery, so a request class is always registered explicitly, per action, on the `ModelRegistration`:

```ts title="src/rhino.config.ts"
requests?: {
  store?: Type<ResourceRequest>;
  update?: Type<ResourceRequest>;
}
```

Registration is per action — a model may register only `store` and leave `update` on the model-level schemas described at the [bottom of this page](#model-level-validation-deprecated). Anything that is not a class is rejected at boot, in the same pass that validates the rest of the registration.

:::warning A request class with constructor dependencies must be a provider
Rhino resolves the class through `ModuleRef` and falls back to `new Cls()` when the lookup fails. That fallback constructs it with **no arguments**, so an injected service would silently be `undefined`. Rhino logs a warning when it happens, but the fix is to add the class to the `providers` of a module that imports `RhinoModule`:

```ts title="src/app.module.ts"
@Module({
  imports: [RhinoModule.forRoot(rhinoConfig)],
  providers: [PostStoreRequest],
})
export class AppModule {}
```

A zero-argument request class needs no registration as a provider.
:::

## The context

Every hook receives a `ResourceRequestContext`:

| Field | Value |
|---|---|
| `ctx.user` | The authenticated user (`req.user`), or `undefined`. |
| `ctx.organization` | The resolved tenant. `undefined` outside a tenant route group and in single-tenant apps. |
| `ctx.routeGroup` | The matched route's group (`'tenant'`, `'public'`, …), or `null`. |
| `ctx.action` | `'store'` or `'update'` — never `'create'`, even inside `POST /nested`. |
| `ctx.record` | On update, the record **as it was before the write**. `null` on store. |
| `ctx.input` | The client input, after the policy's forbidden-field gate and after `prepare()`. |

`ctx.record` comes from the organization-scoped query the update already performed, never from a fresh lookup by bare id, so a record-dependent rule can never see another tenant's state.

```ts title="src/requests/post-update.request.ts"
import { z } from 'zod';
import {
  ResourceRequest,
  resolveUserRoleSlug,
  type ResourceRequestContext,
} from '@rhino-dev/rhino-nestjs';

export class PostUpdateRequest extends ResourceRequest {
  rules(ctx: ResourceRequestContext) {
    // A published post cannot be dragged back to draft by anyone but an admin.
    const isAdmin = resolveUserRoleSlug(ctx.user, ctx.organization?.id) === 'admin';
    const status =
      (ctx.record as any)?.status === 'published' && !isAdmin
        ? z.enum(['published', 'archived'])
        : z.enum(['draft', 'published', 'archived']);

    return z.object({
      title: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      status: status.optional(),
    });
  }
}
```

`rules()` may be **async** — return a `Promise<ZodSchema>` when the schema needs a lookup. Rhino awaits it.

:::note There is no `messages()` and no `after()` hook
Zod carries its messages in the schema (`z.string().min(1, 'Every post needs a title')`), and cross-field checks belong in `.superRefine()`:

```ts
return z
  .object({ status: z.string(), publishedAt: z.string().optional() })
  .superRefine((data, ctx) => {
    if (data.status === 'published' && !data.publishedAt) {
      ctx.addIssue({ code: 'custom', path: ['publishedAt'], message: 'A published post needs a publish date.' });
    }
  });
```
:::

## `authorize()` — refusing the request

`authorize(ctx)` returns `false` to refuse the whole request with a **403**. It is a second, narrower gate than the policy's `create` / `update` check, which has already passed by the time it runs. It may be async.

```ts title="src/requests/post-store.request.ts"
override authorize(ctx: ResourceRequestContext): boolean {
  return ctx.routeGroup !== 'public';
}
```

```json title="403 Forbidden"
{
  "code": "FORBIDDEN",
  "message": "This action is unauthorized."
}
```

:::danger The 403 body is deliberately indistinguishable from a policy denial
The message is hard-coded and a request class cannot customize it. Otherwise `authorize()` would become an oracle that tells an attacker *why* they were refused, and the presence of a request class would itself be detectable.

```ts
// ❌ Bad — the reason (and the record's state) reaches the client
override authorize(ctx) {
  throw new ForbiddenException(`post ${ctx.record.id} is locked by user 42`);
}

// ✅ Good — refuse, and say nothing
override authorize(ctx) {
  return (ctx.record as any)?.lockedBy == null;
}
```
:::

## `prepare()` — normalizing the input

`prepare(input, ctx)` is optional. Whatever it returns replaces the input for `authorize()`, the rules and the write payload. It may be async.

```ts title="src/requests/post-store.request.ts"
override prepare(input: Record<string, any>): Record<string, any> {
  return {
    ...input,
    title: typeof input.title === 'string' ? input.title.trim() : input.title,
    status: input.status ?? 'draft',
  };
}
```

:::note `prepare()` runs before the rules
The input is still exactly what the client sent — a field can be an array, a number or `null`. Narrow the
type before touching it, as the `typeof` check above does, and leave anything malformed for the schema to
reject. `input.title.trim()` on a non-string is a `TypeError`, which surfaces as a 500 instead of a clean 422.
:::

Two rules govern it:

- It runs **after** the policy's forbidden-field gate, which inspects exactly what the client sent. Nothing `prepare()` does can launder a field past the policy.
- Therefore everything it writes is **server-authored and trusted**, at the same level as the framework-managed `organizationId`. Never copy a client value into a different key — that writes a field the policy denied.

```ts
// ❌ Bad — the policy denies ownerId, so the client sends userId and prepare()
//          copies it across. The forbidden-field gate never saw ownerId.
return { ...input, ownerId: input.userId ?? ctx.user?.id };

// ✅ Good — server state only
return { ...input, ownerId: ctx.user?.id };
```

A key `prepare()` adds is still only persisted if the schema declares it. A return value that is not a plain object — `null`, `undefined`, a scalar, an array — is treated as "no change" and the original input is used.

## What gets persisted

**The write payload is the schema's parse output.** Zod object schemas strip unknown keys, so a field with no rule never reaches the database.

:::warning A field with no rule is silently dropped, not saved
There is no error. The request succeeds, the response is `200`/`201`, and the field is simply unchanged. Declare a rule for **every** field this action should write, even if it is as loose as `.optional()`.

This fails closed on purpose: when a policy permits `['*']`, the request class is the only field filter left, and the alternative is mass assignment.
:::

```bash title="terminal"
# PostUpdateRequest's schema declares no `featured`
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

- **No narrowing to permitted attributes.** Rhino never calls `schema.pick()` with the policy's `permittedAttributesForCreate/Update`. Write the schema so the *narrowest* role the policy permits can satisfy it, and branch on `ctx.user` where the rules genuinely differ.
- **No partial-update relaxation.** An update class declares its own partial semantics — mark every field `.optional()` (and `.nullable()` where a null is legal). That is exactly what having a separate update class is for.

## Multi-tenancy

In a tenant context, Rhino runs its **cross-tenant foreign-key check on top of** the request class's parsed output, using the model's `fkConstraints`. It covers direct `organizationId` ownership and indirect ownership through an `owner` chain such as `comment → post → organization`:

```json title="422 Unprocessable Entity"
{
  "code": "CROSS_TENANT",
  "message": "Referenced record not in current organization",
  "details": {
    "errors": {
      "categoryId": ["referenced record not found in this organization"]
    }
  }
}
```

:::warning The FK check reads the write payload
It inspects the *parsed* object, so a foreign key with no rule in the schema is never checked — because it is never written either. Declare every FK the action writes.
:::

`organizationId` (and `organization_id`) is framework-managed: it is stripped from the input before the request class sees it, and applied last and unconditionally. A request class can never be used to cross tenants.

## The pipeline

For `POST /{resource}` and `PUT /{resource}/:id`, in order:

1. **Authentication** — `401` if absent.
2. **Policy gate** — `create` / `update`. `403` on denial.
3. **Record load** (update only), organization-scoped. `404` if not found.
4. **`organizationId` handling** — stripped from the input in a tenant context.
5. **Policy forbidden-field gate**, on the **raw** client input. `403 FORBIDDEN_FIELDS`.
6. **The request class**, if one is registered for this action:
   1. `prepare()` — replaces the input for everything after it.
   2. `authorize()` — `false` ⇒ `403 FORBIDDEN`.
   3. `rules()` → `safeParse` — failures ⇒ `422 VALIDATION_FAILED`.
7. **Cross-tenant FK check** — `422 CROSS_TENANT`.
8. **Framework-managed fields** (`organizationId`) applied last and unconditionally.
9. **Persist** the parsed output.

`prepare()` running before `authorize()` means `authorize()` always sees normalized input, and matches the other Rhino stacks.

## Nested operations

Request classes apply per operation inside `POST /nested`, resolved from each operation's own model: a `{"action":"create"}` operation runs the `store` class, an `{"action":"update"}` operation runs the `update` class with `ctx.record` populated from the organization-scoped row. See [Nested Operations](./nested-operations#validation).

## Generating one

`npx rhino generate` offers **request** in its menu, asks for the model name, then for store, update or both, and writes `src/requests/{name}-{action}.request.ts` plus the registration line to paste into `src/rhino.config.ts`. See [Generator](./generator#request).

## Related

- [Policies](./policies#attribute-permissions) — which fields each role may write, and the `403` that enforces it
- [Models](./models) — the rest of the `ModelRegistration` surface
- [Multi-Tenancy](./multi-tenancy) — how the organization on the route is resolved
- [Nested Operations](./nested-operations) — batched writes, validated per operation
- [Generator](./generator) — scaffolding a request class

## Model-level validation (deprecated)

:::caution Deprecated
The 4.x registration fields — `validation`, `validationStore` and `validationUpdate`, including the role-keyed `Record<string, ZodSchema>` form — still work, unchanged, for any model and action with no request class. They are **deprecated** and will be removed in **5.0**.

Move a model at your own pace: registration is per action, so a model can use `PostStoreRequest` for `store` while `update` still runs `validationUpdate`. The [upgrade guide](./upgrading#moving-a-model-to-request-classes) has the before/after, including how role-keyed schemas become a branch on `ctx.user`.
:::
