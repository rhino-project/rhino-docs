---
sidebar_position: 8
title: TypeScript
---

# TypeScript

All Rhino hooks support TypeScript generics for type-safe data access. You can use them with or without auto-generated types.

## Generic Hooks

Every CRUD hook accepts an optional type parameter `<T>` that defaults to `Record<string, any>` for backward compatibility:

```tsx title="Without generics (still works)"
const { data } = useModelIndex('posts');
// data?.data is Record<string, any>[]
```

```tsx title="With generics"
interface Post {
  id: number;
  title: string;
  content: string;
  is_published: boolean;
  created_at: string;
}

const { data } = useModelIndex<Post>('posts');
// data?.data is Post[] — autocomplete works
```

## Hook Signatures

| Hook | Return Type |
|------|------------|
| `useModelIndex<T>(model, options)` | `UseQueryResult<QueryResponse<T>>` |
| `useModelShow<T>(model, id, options)` | `UseQueryResult<T>` |
| `useModelStore<T>(model)` | `UseMutationResult<T, Error, Partial<T>>` |
| `useModelUpdate<T>(model)` | `UseMutationResult<T, Error, { id: string \| number; data: Partial<T> }>` |
| `useModelDelete<T>(model)` | `UseMutationResult<T, Error, string \| number>` |
| `useModelTrashed<T>(model, options)` | `UseQueryResult<QueryResponse<T>>` |
| `useModelRestore<T>(model)` | `UseMutationResult<T, Error, string \| number>` |
| `useModelForceDelete<T>(model)` | `UseMutationResult<T, Error, string \| number>` |
| `useModelAudit(model, id, options)` | `UseQueryResult<QueryResponse<AuditLog>>` |
| `useNestedOperations()` | Untyped (heterogeneous models) |

## Auto-Generated Types

Instead of writing interfaces by hand, use the `export-types` command on your server to generate them from the database schema:

```bash title="terminal"
# Laravel
php artisan rhino:export-types

# Rails
rails rhino:export_types

# NestJS
npx rhino export-types
```

This generates a `rhino.d.ts` file with one interface per model:

```typescript title="src/types/rhino.d.ts"
export interface Post {
  id?: number;
  title?: string;
  content?: string;
  is_published?: boolean;
  blog_id?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
```

### Setup

Set `RHINO_CLIENT_PATH` in your server's `.env` to point to the client project:

```env title=".env (in your server project)"
RHINO_CLIENT_PATH=../client
RHINO_MOBILE_PATH=../mobile
```

The command writes to `{path}/src/types/rhino.d.ts` automatically.

### Usage

```tsx title="src/components/PostsList.tsx"
import type { Post } from '../types/rhino';
import { useModelIndex, useModelStore, useModelUpdate } from '@rhino-dev/rhino-react';

function PostsList() {
  const { data, isLoading } = useModelIndex<Post>('posts', {
    sort: '-created_at',
    includes: ['user'],
  });

  const store = useModelStore<Post>('posts');

  const handleCreate = () => {
    store.mutate({ title: 'New Post', content: 'Hello world' });
  };

  // ...
}
```

:::tip Why are all fields optional?
Rhino's policy system dynamically controls which fields appear in API responses based on the authenticated user's role. The generated types represent the **union of all possible fields**. Use optional chaining (`post.title?.toUpperCase()`) when accessing fields.
:::

## Works with React Native

The same hooks and types work on both React (web) and React Native. The `export-types` command supports a separate `RHINO_MOBILE_PATH` for mobile projects.
