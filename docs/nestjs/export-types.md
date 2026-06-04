---
sidebar_position: 14
title: Export Types
---

# Export Types

Rhino includes a CLI command that generates TypeScript interfaces from your registered models. It introspects each registration's Prisma model and writes a `.d.ts` file of interfaces.

## Usage

```bash title="terminal"
npx rhino export-types
```

This introspects all registered models from `src/rhino.config.ts` and writes TypeScript interfaces to the configured output paths.

### Command Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | (none) | Explicit output file path. Overrides config/env paths. |

### Examples

```bash title="terminal"
# Write to configured paths (clientPath / mobilePath)
npx rhino export-types

# Write to a specific file (default: src/types/rhino.d.ts)
npx rhino export-types --output=tmp/rhino.d.ts
```

## Configuration

Set the output paths in `src/rhino.config.ts` via `clientPath` and `mobilePath`:

```ts title="src/rhino.config.ts"
// Inside the RhinoConfig object passed to RhinoModule.forRoot()
clientPath: process.env.RHINO_CLIENT_PATH, // e.g. '../client'
mobilePath: process.env.RHINO_MOBILE_PATH, // e.g. '../mobile'
```

When both paths are set, the command writes to both:
- `{clientPath}/src/types/rhino.d.ts`
- `{mobilePath}/src/types/rhino.d.ts`

The `--output` flag overrides both and writes to a single explicit path.

## Generated Output

The command generates one interface per model. **All fields are optional** because Rhino's policy system controls which attributes are visible per user/role at runtime.

```typescript title="src/types/rhino.d.ts"
export interface Post {
  id?: number;
  title?: string;
  content?: string;
  isPublished?: boolean;
  blogId?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}
```

### Type Mapping

| Prisma Field Type | TypeScript Type |
|------------------|----------------|
| `Int`, `BigInt` | `number` |
| `Decimal`, `Float` | `number` |
| `Boolean` | `boolean` |
| `DateTime` | `string` |
| `Json` | `Record<string, unknown>` |
| `String` | `string` |
| Optional fields (`Type?`) | adds `\| null` |

## Using Generated Types

Import the generated types and pass them as generics to Rhino hooks:

```tsx title="src/components/PostsList.tsx"
import type { Post } from '../types/rhino';
import { useModelIndex, useModelStore, useModelUpdate } from '@rhino-dev/rhino-react';

// Typed list — data.data is Post[]
const { data } = useModelIndex<Post>('posts', { sort: '-created_at' });

// Typed create — mutate accepts Partial<Post>
const store = useModelStore<Post>('posts');
store.mutate({ title: 'Hello', content: 'World' });

// Typed update — mutate accepts { id, data: Partial<Post> }
const update = useModelUpdate<Post>('posts');
update.mutate({ id: 1, data: { title: 'Updated' } });
```

:::tip Why all fields optional?
Rhino's policy system (`permittedAttributesForShow`, `hiddenAttributesForShow`) dynamically controls which fields appear in API responses based on the authenticated user's role and custom logic. The generated types represent the **union of all possible fields**, not a guarantee of which fields will be present in any given response.
:::

## Workflow

1. Define your models and run migrations
2. Run `npx rhino export-types`
3. Import the generated types in your React/React Native code
4. Re-run the command whenever you change your database schema
