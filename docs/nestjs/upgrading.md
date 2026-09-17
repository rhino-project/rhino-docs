---
sidebar_position: 98
title: Upgrading
---

# Upgrading

Version-to-version upgrade notes for Rhino for NestJS. Each section lists what is required, what is optional, and what changes on its own. For the full list of what shipped in a release, see the [Release Notes](./release-notes).

## 4.9 → 4.10 {#4-9-4-10}

**Nothing is required.** Upgrade the package and your app behaves exactly as it did on 4.9.0.

```bash title="terminal"
npm install @rhino-dev/rhino-nestjs@^4.10
```

- **No config migration.** `ModelRegistration` gains an optional `requests` field; every existing field is untouched.
- **Nothing is picked up accidentally.** Unlike the Laravel and Rails stacks, NestJS has no filesystem discovery — a request class runs only for a model that names it in `requests`.
- **No database changes, no new routes, no response-shape changes.**

### Model-level validation is deprecated

`validation`, `validationStore` and `validationUpdate`, including the role-keyed `Record<string, ZodSchema>` form, still work, byte for byte, and are used for every model and action with no request class. They are **deprecated** and will be **removed in 5.0**.

There is no runtime deprecation warning — nothing is logged and nothing is emitted on the wire.

### Moving a model to request classes

Migration is per action, so you can move `store` and leave `update` alone. The three things that change when you move a model:

**1. The schema moves into a class, unchanged.**

```ts title="src/rhino.config.ts"
// Before — on the registration
posts: {
  model: 'post',
  validationStore: z.object({
    title: z.string().max(255),
    content: z.string(),
    status: z.enum(['draft', 'published', 'archived']),
    categoryId: z.number().int(),
  }),
},
```

```ts title="src/requests/post-store.request.ts"
// After — one class per action
import { z } from 'zod';
import { ResourceRequest, type ResourceRequestContext } from '@rhino-dev/rhino-nestjs';

export class PostStoreRequest extends ResourceRequest {
  rules(_ctx: ResourceRequestContext) {
    return z.object({
      title: z.string().max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
      categoryId: z.number().int(),
    });
  }
}
```

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  requests: { store: PostStoreRequest, update: PostUpdateRequest },
},
```

**2. Role-keyed schemas become a branch on `ctx.user`.**

```ts title="src/rhino.config.ts"
// Before — a map keyed by role slug, resolved behind your back
const validationStore: Record<string, z.ZodTypeAny> = {
  admin:  z.object({ title: z.string(), status: z.string().optional() }),
  editor: z.object({ title: z.string(), status: z.literal('draft').optional() }),
  '*':    z.object({ title: z.string() }),
};
```

```ts title="src/requests/post-store.request.ts"
// After — an ordinary branch, with the whole context in scope
rules(ctx: ResourceRequestContext) {
  const role = resolveUserRoleSlug(ctx.user, ctx.organization?.id);
  const base = { title: z.string().max(255) };

  if (role === 'admin') return z.object({ ...base, status: z.string().optional() });
  if (role === 'editor') return z.object({ ...base, status: z.literal('draft').optional() });

  // Any other role gets no `status` key at all, so the field is not written —
  // the same outcome the '*' entry produced.
  return z.object(base);
}
```

**3. Partial updates become explicit.** Mark every field in an update class `.optional()` (and `.nullable()` where a null is legal). The model-level path had `validationUpdate` for this; a request class states it in the schema itself.

:::warning Declare a rule for every field the action writes
The write payload is the schema's parse output, and Zod object schemas strip unknown keys. A field with no rule is **silently dropped**: the request succeeds, and the field is unchanged. There is no error and no log line.

That also applies to the cross-tenant FK check, which reads the parsed output — a foreign key with no rule is neither written nor checked.

The most common way to get bitten is to port the schema for the fields you care about and forget the ones `validation` covered incidentally. Compare the two key lists field by field. The generator's stub exists for this reason — `npx rhino generate` → **request**.
:::

### If the class has constructor dependencies

Rhino resolves a request class through `ModuleRef` and falls back to `new Cls()` when the lookup fails — which constructs it with no arguments, leaving injected services `undefined`. A request class that injects anything must be a provider in a module that imports `RhinoModule`:

```ts title="src/app.module.ts"
@Module({
  imports: [RhinoModule.forRoot(rhinoConfig)],
  providers: [PostStoreRequest, PostUpdateRequest],
})
export class AppModule {}
```

Rhino logs a warning when a class that declares constructor parameters is not resolvable as a provider. A zero-argument request class needs no entry.

### Related

- [Validation](./validation) — request classes in full
- [Release Notes — 4.10.0](./release-notes)
