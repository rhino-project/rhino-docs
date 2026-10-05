---
sidebar_position: 1
title: Getting Started
---

# React Client — Getting Started

The Rhino React client provides TanStack Query hooks for every server endpoint. One hook per operation — no manual fetch calls, no boilerplate.

:::info Start here — this page summarizes the whole client
This is the entry point for the React client docs. The [Feature Map](#feature-map) below is a complete
summary of every hook, option and export the client ships, each linked to its deep-dive page. If you
are an AI agent picking up this codebase, read this page first — it tells you what exists so you never
hand-write a fetch call the client already covers.
:::

## Requirements

- React 18+ or 19+
- TanStack React Query 5+
- Axios 1+

## Installation

```bash title="terminal"
npm install @rhino-dev/rhino-react@^4.0 @tanstack/react-query axios
```

## Setup

### 1. Configure the API client

Point the client to your Laravel backend:

```tsx title="src/config.ts"
import { configureApi } from '@rhino-dev/rhino-react';

configureApi({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
});
```

:::tip React Native
A React Native app authenticates with a bearer token, so turn cookies off and set a timeout:
```tsx title="src/config.ts"
configureApi({
  baseURL: 'https://api.yourapp.com/api',
  withCredentials: false,
  timeout: 20_000,
});
```
It also calls `await initStorage()` once before rendering. See [React Native](../react-native/getting-started).
:::

### 2. Wrap your app with providers

```tsx title="src/App.tsx"
import { AuthProvider } from '@rhino-dev/rhino-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Your routes and components */}
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

### 3. Start using hooks

```tsx title="src/components/PostsList.tsx"
import { useModelIndex, useModelStore } from '@rhino-dev/rhino-react';

function PostsList() {
  const { data: response, isLoading } = useModelIndex('posts', {
    page: 1,
    perPage: 20,
    sort: '-created_at',
    includes: ['user'],
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title} — by {post.user?.name}</li>
        ))}
      </ul>
      {pagination && (
        <p>Page {pagination.currentPage} of {pagination.lastPage} ({pagination.total} total)</p>
      )}
    </div>
  );
}
```

## Feature Map

Everything the Rhino React client does, in one place. Each row names the hook or export you reach for
and links to the page that explains it in full.

### 1. Configuration

`configureApi(options)` sets the base URL and the client's global behavior; `<AuthProvider>` supplies
auth state to the tree.

| Option | Purpose |
|---|---|
| `baseURL` | Where the API lives |
| `tenancy` | `'path'` (default) builds `/api/{organization}/{model}`; `'subdomain'` builds `/api/{model}` and lets the host carry the org; `'none'` builds `/api/{model}` with no organization at all |
| `routeGroup` | Default group for auth URLs (`/{group}/auth/*`) |
| `routeGroupInDataPath` | Also prefix data URLs with the route group: `/api/{group}/{model}` or `/api/{group}/{organization}/{model}` |
| `timeout` / `withCredentials` | Request timeout (default none) and cookies (default `true`; React Native uses `false`) |
| `onUnauthorized` | Called on a 401 from any request except login, after the session is cleared and `AuthProvider` has reset |
| `onForbidden` | Called on a 403; the token is kept |
| `storage` | A custom synchronous storage adapter (secure store, Electron) |

See [Utilities](./utilities), [Authentication — Tenancy and Data URLs](./authentication#tenancy-and-data-urls)
and [Authentication — Group-Aware Auth](./authentication#group-aware-auth).

### 2. Query options

Every query hook takes the same `ModelQueryOptions`, mapping one-to-one onto the server's query
parameters. Full reference: [Querying](./querying).

| Option | Server parameter |
|---|---|
| `filters` | `?filter[field]=value` |
| `sort` | `?sort=` (prefix `-` for descending) |
| `search` | `?search=` |
| `includes` | `?include=` |
| `fields` | `?fields[model]=` |
| `scope` | `?scope=` — a server-whitelisted named scope; an unknown name is a **403** |
| `computedAttributes` | `?computed_attributes=` — opt-in per-record derived values; an object selects attributes that declare parameters |
| `page` / `perPage` | `?page=` / `?per_page=` |

Every model hook also takes TanStack Query options as its last argument: `queryOptions` on the query hooks
(`refetchInterval`, `enabled`, `select`, `staleTime`, …) and `mutationOptions` on the mutation hooks
(`onSuccess`, `onError`, `onMutate`, …). They never change the URL or the cache key; `enabled` can only
narrow the hook's own guard. See [CRUD Hooks — TanStack Query Options](./crud-hooks#tanstack-query-options).

### 3. Response shape

Pagination comes from response **headers**, and every list hook parses it for you:

```tsx
const { data: response } = useModelIndex('posts', { page: 1, perPage: 20 });
response?.data;       // the records
response?.pagination; // { currentPage, lastPage, perPage, total }
```

For accumulating pages ("load more", infinite scroll), `useModelInfinite` returns
`data.pages` plus `fetchNextPage` / `hasNextPage`, driven by the same headers. See
[Querying — Infinite Scroll](./querying#infinite-scroll).

### 4. Cache behavior

Mutations invalidate the queries they affect automatically — a `useModelStore('posts')` success
refreshes every `useModelIndex('posts')` and `useModelInfinite('posts')` in the tree. To invalidate or
prefetch from outside a component, `modelKeys` returns the hooks' exact keys and `fetchModelIndex` /
`fetchModelShow` make their requests (see [Utilities — Outside React](./utilities#outside-react)). Cache keys embed the `id` you pass, so for models
with a server-side [route key](../laravel/models#route-key) use the route-key value consistently across
index, show and mutations. See [CRUD Hooks — Automatic Cache Invalidation](./crud-hooks#automatic-cache-invalidation).

### 5. Errors

| Status | Means | Where it comes from |
|---|---|---|
| `401` | Not authenticated | Auth middleware; clears `token` and `user`, resets `AuthProvider`, triggers `onUnauthorized` — except on login, where `login()` returns `{ success: false, status: 401 }` |
| `403` | Not permitted — an action, an `?include=`, a scope, or a field you may not write | Server policies |
| `404` | Missing record, or an organization you don't belong to | Tenant resolution |
| `422` | Validation failed, with field-level `errors` | Server validation |

See [CRUD Hooks — Error Handling](./crud-hooks#error-handling).

### 6. Platforms

The same package and the same hooks run on web, React Native (bare or Expo) and Electron. `storage`
adapts to `localStorage` / `AsyncStorage` — on React Native, `await initStorage()` once before
rendering — and a custom adapter covers a secure store or Electron's main-process store. See
[React Native](../react-native/getting-started) and [Desktop / Electron](./desktop-electron).

### 7. Sessions

`login()` writes the token to storage before it resolves, so the next request is authenticated;
`LoginResult.token` exposes it. `useRegister` starts a session the same way. A 401 ends it everywhere:
storage is cleared and `useAuth().isAuthenticated` turns `false`, so navigation that follows
`isAuthenticated` needs no extra wiring. See [Authentication — Auth Flow](./authentication#auth-flow).

### 8. File uploads

Pass a `FormData` to `useModelStore` or `useModelUpdate` to upload files: a store is a multipart
`POST`, an update is a multipart `POST {url}/{id}` with an `X-HTTP-Method-Override: PUT` header. See
[CRUD Hooks — File Uploads](./crud-hooks#file-uploads).

---

## All Available Hooks

### Authentication

| Hook | Description |
|------|-------------|
| `useAuth()` | Login, logout, token, auth state, `setOrganization`, `setRouteGroup` |
| `useRouteGroup()` | The active route group (populated after a group-aware login or register) |
| `useRegister()` | Register via an invitation token; starts a session when the backend returns a token |
| `usePasswordRecover()` | Request a password reset email |
| `useResetPassword()` | Complete a password reset |
| `useOrganization()` | Get current organization slug |
| `useOwner()` | Fetch organization data with relationships |
| `useOrganizationExists()` | Check if organization slug exists |

### CRUD Operations

| Hook | Description |
|------|-------------|
| `useModelIndex(model, options?, queryOptions?)` | List records with filters, sorts, search, scopes, pagination |
| `useModelInfinite(model, options?, queryOptions?)` | Accumulate pages for "load more" / infinite scroll |
| `useModelShow(model, id, options?, queryOptions?)` | Fetch single record by ID (or route key) |
| `useModelStore(model, mutationOptions?)` | Create a new record (JSON or `FormData`) |
| `useModelUpdate(model, mutationOptions?)` | Update an existing record (JSON or `FormData`) |
| `useModelDelete(model, mutationOptions?)` | Soft delete a record |

### Soft Deletes

| Hook | Description |
|------|-------------|
| `useModelTrashed(model, options?, queryOptions?)` | List soft-deleted records |
| `useModelRestore(model, mutationOptions?)` | Restore a soft-deleted record |
| `useModelForceDelete(model, mutationOptions?)` | Permanently delete a record |

### Advanced

| Hook | Description |
|------|-------------|
| `useModelComputedAttributes(model, options?, queryOptions?)` | Collection-level aggregates from `GET /{model}/computed` |
| `useModelAudit(model, id, options?, queryOptions?)` | Fetch audit trail for a record |
| `useNestedOperations(mutationOptions?)` | Atomic multi-model transactions |

### Invitations

| Hook | Description |
|------|-------------|
| `useInvitations(status?)` | List invitations (all, pending, accepted, expired, cancelled) |
| `useInviteUser()` | Send invitation with role |
| `useResendInvitation()` | Resend invitation email |
| `useCancelInvitation()` | Cancel pending invitation |
| `useAcceptInvitation()` | Accept invitation by token (does not start a session) |

### Utilities

| Export | Description |
|--------|-------------|
| `configureApi(options)` | Configure API base URL, tenancy, route-group data paths, timeout, credentials, storage and handlers |
| `api` | Pre-configured Axios instance |
| `buildModelUrl(model, options?, target?)` | The URL a model hook requests, usable outside React |
| `modelKeys` | The query keys the model hooks register (`.index`, `.infinite`, `.show`, `.computed`, `.trashed`, `.audit`, `.all`) |
| `fetchModelIndex` / `fetchModelShow` | The hooks' requests as plain async functions, for `fetchQuery` / `prefetchQuery` |
| `storage` | Platform-agnostic synchronous storage (localStorage / AsyncStorage) |
| `STORAGE_KEYS` | Every storage key the library reads or writes |
| `initStorage()` | Load the stored session into memory on React Native (await before rendering) |
| `setStorageAdapter(adapter)` | Swap the storage adapter at runtime |
| `events` | Event emitter for cross-component communication |
| `extractPaginationFromHeaders(response)` | Parse pagination from response headers |
| `cn(...classes)` | CSS class merging utility (clsx + tailwind-merge) |
| `useToast()` | Toast notification state management |

## Pagination

Pagination metadata comes from response **headers** (not body). All hooks return it automatically:

```tsx title="src/components/PostsList.tsx"
const { data: response } = useModelIndex('posts', { page: 1, perPage: 20 });

const posts = response?.data;           // Array of records
const pagination = response?.pagination; // { currentPage, lastPage, perPage, total }
```

```tsx title="src/types.ts"
// PaginationMeta type
interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
}
```

## TypeScript Types

The library exports all types:

```tsx title="src/types.ts"
import type {
  PaginationMeta,
  ModelQueryOptions,
  QueryResponse,
  LoginResult,
  NestedOperation,
  Invitation,
  InvitationStatus,
  ModelQueryHookOptions,
  ModelInfiniteQueryHookOptions,
  ModelMutationHookOptions,
  TenancyMode,
  StorageAdapter,
} from '@rhino-dev/rhino-react';
```

Model interfaces themselves are generated from the server — run `php artisan rhino:export-types`
(Laravel), `rails rhino:export_types` (Rails) or `npx rhino export-types` (NestJS) and pass them as
generics. See [TypeScript](./typescript).

## Documentation map

| Page | Read it for |
|---|---|
| [Authentication](./authentication) | Login, logout, sessions, organization context, group-aware auth, tenancy and data URLs |
| [CRUD Hooks](./crud-hooks) | Index, show, store, update, delete; TanStack Query options, file uploads, errors and cache invalidation |
| [Querying](./querying) | Filters, sorts, search, scopes, computed attributes, includes, pagination, infinite scroll |
| [Soft Deletes](./soft-deletes) | Trashed, restore, force delete |
| [Nested Operations](./nested-operations) | Atomic multi-model transactions |
| [Invitations](./invitations) | Inviting users into organizations |
| [Utilities](./utilities) | API client, storage, events, URL builder, query keys and fetchers for code outside React, toast, audit |
| [TypeScript](./typescript) | Generic hooks and auto-generated types |
| [Release Notes](./release-notes) | What changed in each version, and how to upgrade |
| [Desktop / Electron](./desktop-electron) | Main/preload/renderer wiring and custom storage |
| [React Native](../react-native/getting-started) | Platform adapters and mobile setup |

The server docs describe what these hooks talk to:
[Laravel](../laravel/getting-started) · [Rails](../rails/getting-started) · [NestJS](../nestjs/getting-started).
