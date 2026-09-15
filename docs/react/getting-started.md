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
For React Native, you can add a custom unauthorized handler:
```tsx title="src/config.ts"
configureApi({
  baseURL: 'https://api.yourapp.com/api',
  onUnauthorized: () => {
    // Navigate to login screen
    navigation.navigate('Login');
  },
});
```
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
| `tenancy` | `'path'` (default) builds `/api/{organization}/{model}`; `'subdomain'` builds `/api/{model}` and lets the host carry the org |
| `onUnauthorized` | Called on a 401 — navigate to login (essential on React Native) |
| `routeGroup` | Default group for auth URLs (`/{group}/auth/*`); never affects data URLs |

See [Utilities](./utilities) and [Authentication — Group-Aware Auth](./authentication#group-aware-auth).

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

### 3. Response shape

Pagination comes from response **headers**, and every list hook parses it for you:

```tsx
const { data: response } = useModelIndex('posts', { page: 1, perPage: 20 });
response?.data;       // the records
response?.pagination; // { currentPage, lastPage, perPage, total }
```

### 4. Cache behavior

Mutations invalidate the queries they affect automatically — a `useModelStore('posts')` success
refreshes every `useModelIndex('posts')` in the tree. Cache keys embed the `id` you pass, so for models
with a server-side [route key](../laravel/models#route-key) use the route-key value consistently across
index, show and mutations. See [CRUD Hooks — Automatic Cache Invalidation](./crud-hooks#automatic-cache-invalidation).

### 5. Errors

| Status | Means | Where it comes from |
|---|---|---|
| `401` | Not authenticated | Auth middleware; triggers `onUnauthorized` |
| `403` | Not permitted — an action, an `?include=`, a scope, or a field you may not write | Server policies |
| `404` | Missing record, or an organization you don't belong to | Tenant resolution |
| `422` | Validation failed, with field-level `errors` | Server validation |

See [CRUD Hooks — Error Handling](./crud-hooks#error-handling).

### 6. Platforms

The same hooks run on web, React Native and Electron. `storage` adapts to `localStorage` /
`AsyncStorage`, and a custom adapter covers Electron's main-process store. See
[React Native](../react-native/getting-started) and [Desktop / Electron](./desktop-electron).

---

## All Available Hooks

### Authentication

| Hook | Description |
|------|-------------|
| `useAuth()` | Login, logout, token, auth state, `setOrganization`, `setRouteGroup` |
| `useRouteGroup()` | The active route group (populated after a group-aware login or register) |
| `useRegister()` | Register via an invitation token |
| `usePasswordRecover()` | Request a password reset email |
| `useResetPassword()` | Complete a password reset |
| `useOrganization()` | Get current organization slug |
| `useOwner()` | Fetch organization data with relationships |
| `useOrganizationExists()` | Check if organization slug exists |

### CRUD Operations

| Hook | Description |
|------|-------------|
| `useModelIndex(model, options)` | List records with filters, sorts, search, scopes, pagination |
| `useModelShow(model, id, options)` | Fetch single record by ID (or route key) |
| `useModelStore(model)` | Create a new record |
| `useModelUpdate(model)` | Update an existing record |
| `useModelDelete(model)` | Soft delete a record |

### Soft Deletes

| Hook | Description |
|------|-------------|
| `useModelTrashed(model, options)` | List soft-deleted records |
| `useModelRestore(model)` | Restore a soft-deleted record |
| `useModelForceDelete(model)` | Permanently delete a record |

### Advanced

| Hook | Description |
|------|-------------|
| `useModelComputedAttributes(model, options)` | Collection-level aggregates from `GET /{model}/computed` |
| `useModelAudit(model, id, options)` | Fetch audit trail for a record |
| `useNestedOperations()` | Atomic multi-model transactions |

### Invitations

| Hook | Description |
|------|-------------|
| `useInvitations(status?)` | List invitations (all, pending, accepted, expired, cancelled) |
| `useInviteUser()` | Send invitation with role |
| `useResendInvitation()` | Resend invitation email |
| `useCancelInvitation()` | Cancel pending invitation |
| `useAcceptInvitation()` | Accept invitation by token |

### Utilities

| Export | Description |
|--------|-------------|
| `configureApi(options)` | Configure API base URL, tenancy, and handlers |
| `api` | Pre-configured Axios instance |
| `storage` | Platform-agnostic storage (localStorage / AsyncStorage) |
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
} from '@rhino-dev/rhino-react';
```

Model interfaces themselves are generated from the server — run `php artisan rhino:export-types`
(Laravel), `rails rhino:export_types` (Rails) or `npx rhino export-types` (NestJS) and pass them as
generics. See [TypeScript](./typescript).

## Documentation map

| Page | Read it for |
|---|---|
| [Authentication](./authentication) | Login, logout, organization context, group-aware auth, tenancy modes |
| [CRUD Hooks](./crud-hooks) | Index, show, store, update, delete; errors and cache invalidation |
| [Querying](./querying) | Filters, sorts, search, scopes, computed attributes, includes, pagination |
| [Soft Deletes](./soft-deletes) | Trashed, restore, force delete |
| [Nested Operations](./nested-operations) | Atomic multi-model transactions |
| [Invitations](./invitations) | Inviting users into organizations |
| [Utilities](./utilities) | API client, storage, events, toast, audit |
| [TypeScript](./typescript) | Generic hooks and auto-generated types |
| [Desktop / Electron](./desktop-electron) | Main/preload/renderer wiring and custom storage |
| [React Native](../react-native/getting-started) | Platform adapters and mobile setup |

The server docs describe what these hooks talk to:
[Laravel](../laravel/getting-started) · [Rails](../rails/getting-started) · [NestJS](../nestjs/getting-started).
