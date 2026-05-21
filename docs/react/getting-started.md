---
sidebar_position: 1
title: Getting Started
---

# React Client — Getting Started

The Rhino React client provides TanStack Query hooks for every server endpoint. One hook per operation — no manual fetch calls, no boilerplate.

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

## All Available Hooks

### Authentication

| Hook | Description |
|------|-------------|
| `useAuth()` | Login, logout, token, auth state |
| `useOrganization()` | Get current organization slug |
| `useOwner()` | Fetch organization data with relationships |
| `useOrganizationExists()` | Check if organization slug exists |

### CRUD Operations

| Hook | Description |
|------|-------------|
| `useModelIndex(model, options)` | List records with filters, sorts, pagination |
| `useModelShow(model, id, options)` | Fetch single record by ID |
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
| `configureApi(options)` | Configure API base URL and handlers |
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

## Next Steps

- [Authentication](./authentication) — login, logout, organization context
- [CRUD Hooks](./crud-hooks) — index, show, store, update, delete
- [Querying](./querying) — filters, sorts, search, pagination, includes
- [Soft Deletes](./soft-deletes) — trashed, restore, force delete
- [Nested Operations](./nested-operations) — atomic multi-model transactions
- [Invitations](./invitations) — invite users to organizations
- [Utilities](./utilities) — API client, storage, events, toast
- [TypeScript](./typescript) — generic hooks and auto-generated types
