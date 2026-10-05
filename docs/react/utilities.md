---
sidebar_position: 8
title: Utilities
---

# Utilities

Rhino exports utility functions, adapters, and hooks beyond the main CRUD operations.

## configureApi(options)

Configure the Axios client used by all hooks. Call it once, before the first request.

```tsx title="src/config.ts"
import { configureApi } from '@rhino-dev/rhino-react';

configureApi({
  baseURL: 'https://api.yourapp.com/api',
  onUnauthorized: () => {
    // Called on a 401 from any request except login,
    // after the token and user are cleared and AuthProvider has reset.
    window.location.href = '/login';
  },
});
```

| Option | Type | Description |
|--------|------|-------------|
| `baseURL` | `string` | API base URL (default: `/api`) |
| `tenancy` | `'path' \| 'subdomain' \| 'none'` | How data URLs carry the organization. `'path'` (default): `/{organization}/{model}`. `'subdomain'`: `/{model}`, the host carries it. `'none'`: `/{model}`, no organization at all. See [Tenancy and Data URLs](./authentication#tenancy-and-data-urls). |
| `routeGroup` | `string \| null` | Route group used to build group-aware auth URLs (`/{routeGroup}/auth/*`). Pass `null` to clear it. Prefix-based groups only -- domain-based groups need no `routeGroup`. |
| `routeGroupInDataPath` | `boolean` | Also prepend `routeGroup` to data URLs: `/{routeGroup}/{model}` or `/{routeGroup}/{organization}/{model}`. Default `false`. |
| `nestedPath` | `string` | Path segment `useNestedOperations` posts to. Default `'nested'`, the servers' default nested-operations `path`. |
| `timeout` | `number` | Request timeout in milliseconds. Default: none. `0` clears a timeout set earlier. |
| `withCredentials` | `boolean` | Whether requests send cookies. Default `true` (Sanctum cookie auth). Bearer-token apps such as React Native pass `false`. |
| `onUnauthorized` | `() => void` | Callback on a 401 from any request except login. The token and user are cleared and `AuthProvider` resets first. Default on web: redirect to `/`. |
| `onForbidden` | `(error) => void` | Callback on 403 responses (group membership denied). The token is **not** cleared. See [Group-Aware Auth](./authentication.md#group-aware-auth). |
| `storage` | `StorageAdapter` | A custom storage adapter for the token, user and organization -- e.g. a secure store on React Native or `createElectronStorage()` on desktop. See [storage](#storage). |

`configureApi` only changes the options you pass; calling it again with `{ timeout }` leaves `baseURL`, `withCredentials` and the rest as they were.

```tsx title="src/config.ts"
// Group-aware auth: scope auth URLs to a prefix-based route group
configureApi({
  baseURL: '/api',
  routeGroup: 'driver',
  onForbidden: (error) => toast(error.response?.data?.message),
});
```

:::tip React Native
A native app authenticates with a bearer token, not cookies, and runs on networks that can stall. Turn cookies off, set a timeout, and navigate on `onUnauthorized` instead of the web's `window.location` redirect:
```tsx title="src/config.ts"
configureApi({
  baseURL: 'https://api.yourapp.com/api',
  withCredentials: false,
  timeout: 20_000, // 20-30 s suits mobile networks
  onUnauthorized: () => navigation.navigate('Login'),
});
```
:::

## api

The pre-configured Axios instance used by all hooks. Use it for custom API calls that aren't covered by the built-in hooks.

```tsx title="src/api.ts"
import { api } from '@rhino-dev/rhino-react';

// Custom API call
const response = await api.get('/custom-endpoint');
const data = response.data;

// POST with data
const result = await api.post('/reports/generate', {
  startDate: '2025-01-01',
  endDate: '2025-01-31',
});
```

### Automatic Features

The `api` instance automatically:

- **Attaches auth token** — reads `token` from [`storage`](#storage) and adds the `Authorization: Bearer {token}` header
- **Handles 401 responses** — on any request except login, removes `token` and `user` from storage, resets `AuthProvider` (through the `'token'` [event](#events)), then calls `onUnauthorized`. A 401 from `/auth/login` or `/{routeGroup}/auth/login` is left to `login()`, which reports it as `{ success: false, status: 401 }`
- **Handles 403 responses** — keeps the token and calls `onForbidden`
- **Sends credentials** — includes cookies for CORS requests (`withCredentials: true`, configurable)
- **Sets content type** — `application/json` and `Accept: application/json`; a `FormData` body goes out as `multipart/form-data` (see [File Uploads](./crud-hooks#file-uploads))

## storage

Platform-agnostic, **synchronous** storage adapter. It uses `localStorage` on web and AsyncStorage (behind an in-memory cache) on React Native, and you can swap in your own.

```tsx title="src/storage.ts"
import { storage } from '@rhino-dev/rhino-react';

// Store a value
storage.setItem('theme', 'dark');

// Read a value
const theme = storage.getItem('theme'); // 'dark'

// Remove a value
storage.removeItem('theme');
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getItem(key)` | `string` | `string \| null` | Read value |
| `setItem(key, value)` | `string, string` | `void` | Write value |
| `removeItem(key)` | `string` | `void` | Delete value |

Any object with these three synchronous methods is a `StorageAdapter`. Install one with `configureApi({ storage })` or `setStorageAdapter(adapter)` (pass `null` to return to the platform default); `getStorageAdapter()` returns the active one. The `storage` export always delegates to the active adapter.

### Keys Used Internally

| Key | Description |
|-----|-------------|
| `token` | API authentication token (written by `login()` and `useRegister`, removed on logout and on a 401) |
| `user` | The authenticated user, JSON-encoded (removed on logout and on a 401) |
| `organization_slug` | Current organization slug, read by the data hooks in `'path'` tenancy |
| `last_organization` | The last organization the user worked in (set alongside `organization_slug`) |
| `route_group` | Active [route group](./authentication.md#group-aware-auth) (set on a group-aware login, cleared on logout) |

The same list is exported as `STORAGE_KEYS`:

```tsx
import { STORAGE_KEYS } from '@rhino-dev/rhino-react';
// ['token', 'user', 'organization_slug', 'last_organization', 'route_group']
```

On React Native, `initStorage()` loads exactly these keys from AsyncStorage into memory. Keys your app writes through `storage` are kept in memory and persisted, but are not reloaded by `initStorage()` after a restart -- read those from AsyncStorage yourself. See [React Native -- Platform Adapters](../react-native/platform-adapters).

## events

Platform-agnostic event emitter for cross-component communication. Uses `window.dispatchEvent` on web.

```tsx title="src/events.ts"
import { events } from '@rhino-dev/rhino-react';

// Emit an event
events.emit('organization_slug', 'acme-corp');

// Subscribe to events
const unsubscribe = events.subscribe('organization_slug', (newSlug) => {
  console.log('Organization changed:', newSlug);
});

// Cleanup (e.g., in useEffect cleanup)
unsubscribe();
```

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `emit(key, value)` | `string, any` | `void` | Broadcast event |
| `subscribe(key, callback)` | `string, (value) => void` | `() => void` | Subscribe, returns unsubscribe function |

The library emits three keys: `'organization_slug'` (read by `useOrganization`), `'route_group'` (read by `useRouteGroup`) and `'token'` (read by `AuthProvider` -- `null` when a 401 ends the session, the new token when `useRegister` starts one).

:::info Cross-Tab Sync
On web, events are broadcast via `StorageEvent`, enabling cross-tab synchronization. When a user switches organizations in one tab, other tabs can detect and respond. On React Native the emitter is in-memory, within the app process.
:::

## extractPaginationFromHeaders(response)

Parse pagination metadata from Axios response headers. Used internally by all list hooks, but available for custom API calls.

```tsx title="src/utils/pagination.ts"
import { api, extractPaginationFromHeaders } from '@rhino-dev/rhino-react';

const response = await api.get('/posts?page=2&per_page=15');
const pagination = extractPaginationFromHeaders(response);

// {
//   currentPage: 2,
//   lastPage: 10,
//   perPage: 15,
//   total: 143
// }
```

### Headers Parsed

| Header | Mapped To |
|--------|-----------|
| `X-Current-Page` | `currentPage` |
| `X-Last-Page` | `lastPage` |
| `X-Per-Page` | `perPage` |
| `X-Total` | `total` |

Returns `null` if the headers are not present.

```typescript title="src/types.ts"
interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
}
```

## Outside React

The model hooks are thin wrappers over plain functions that build their URLs, their cache keys and their requests. The same functions are exported, so code that runs outside a component -- a push-notification handler, a background task, a router loader, a prefetch -- produces exactly the URLs and keys the hooks use.

| Export | Returns |
|---|---|
| `buildModelUrl(model, options?, target?)` | The URL a model hook requests, relative to `baseURL` |
| `modelKeys` | The query keys the model hooks register |
| `fetchModelIndex(model, options?, context?)` | One page of a list -- what `useModelIndex` caches |
| `fetchModelShow(model, id, options?, context?)` | One record -- what `useModelShow` caches |

All of them honor `tenancy` and `routeGroupInDataPath`, and read the organization from storage when you do not pass one.

### buildModelUrl

`buildModelUrl(model, options?, { id?, organization?, suffix? })`

```tsx
import { buildModelUrl } from '@rhino-dev/rhino-react';

buildModelUrl('posts', { filters: { status: 'published' }, page: 2 });
// '/acme/posts?filter%5Bstatus%5D=published&page=2'
// (the query string is URL-encoded: filter[status]=published&page=2)
```

| Target | Call | URL (default tenancy) |
|---|---|---|
| index | `buildModelUrl('posts', options)` | `/{organization}/posts?…` |
| show | `buildModelUrl('posts', options, { id })` | `/{organization}/posts/{id}?…` |
| computed | `buildModelUrl('posts', options, { suffix: 'computed' })` | `/{organization}/posts/computed?…` |
| trashed | `buildModelUrl('posts', options, { suffix: 'trashed' })` | `/{organization}/posts/trashed?…` |
| audit | `buildModelUrl('posts', options, { id, suffix: 'audit' })` | `/{organization}/posts/{id}/audit?…` |

Each target serializes the options its hook serializes: a show URL carries no `scope`, `search` or pagination, and an audit URL carries pagination only. Any other `suffix` (e.g. `'restore'`) yields the bare path. `organization` defaults to the stored slug; in `'path'` tenancy it throws when there is none.

### modelKeys

Called with every argument, a `modelKeys` method returns the exact key its hook registers. Called with fewer, it returns a **prefix** that matches a group of queries -- which is what `invalidateQueries` wants.

| Method | Hook |
|---|---|
| `modelKeys.index(model, options?, organization?)` | `useModelIndex` |
| `modelKeys.infinite(model, options?, organization?)` | `useModelInfinite` |
| `modelKeys.show(model, id?, options?, organization?)` | `useModelShow` |
| `modelKeys.computed(model, options?, organization?)` | `useModelComputedAttributes` |
| `modelKeys.trashed(model, options?, organization?)` | `useModelTrashed` |
| `modelKeys.audit(model, id?, options?, organization?)` | `useModelAudit` |
| `modelKeys.all(model)` | Every query above, for one model |

```tsx
import { modelKeys } from '@rhino-dev/rhino-react';

modelKeys.index('posts');               // every posts list
modelKeys.index('posts', { page: 2 });  // the key of useModelIndex('posts', { page: 2 })
modelKeys.show('posts');                // every posts record
modelKeys.show('posts', 5);             // every query of post 5
modelKeys.show('posts', 5, {});         // the key of useModelShow('posts', 5)

queryClient.invalidateQueries({ queryKey: modelKeys.show('posts', 5) });
queryClient.invalidateQueries(modelKeys.all('posts'));
```

- **A hook called without options uses `{}`**, so pass `{}` for its exact key: `useModelShow('posts', 5)` registers `modelKeys.show('posts', 5, {})`.
- **`organization` defaults to the stored slug**, which is what the hook reads.
- **`modelKeys.all(model)` is a filter, not a key.** The hooks' keys share no common prefix, so `all` returns `{ predicate }` and is passed to `invalidateQueries` (or `refetchQueries`, `removeQueries`) directly, not as `{ queryKey }`.

### fetchModelIndex / fetchModelShow

`fetchModelIndex<T>(model, options?, { organization? })` resolves to `{ data, pagination }`; `fetchModelShow<T>(model, id, options?, { organization? })` resolves to the record. Pair them with `modelKeys` in `queryClient.fetchQuery` or `prefetchQuery` and the result lands in the cache entry the hook will read:

```tsx title="src/notifications.ts"
import { queryClient } from './queryClient';
import { modelKeys, fetchModelShow } from '@rhino-dev/rhino-react';

// A push notification says a trip changed: refresh what is on screen,
// and have the trip ready before the user taps through.
export async function onTripUpdated(tripId: number) {
  queryClient.invalidateQueries({ queryKey: modelKeys.index('trips') });

  await queryClient.prefetchQuery({
    queryKey: modelKeys.show('trips', tripId, {}),
    queryFn: () => fetchModelShow<Trip>('trips', tripId),
  });
}
```

```tsx title="src/screens/TripScreen.tsx"
// Renders from the prefetched cache entry -- same key, no second request.
const { data: trip } = useModelShow<Trip>('trips', tripId);
```

Both reject in `'path'` tenancy when no organization is passed or stored.

## cn(...inputs)

Utility function for merging CSS classes. Combines [clsx](https://github.com/lukeed/clsx) and [tailwind-merge](https://github.com/dcastil/tailwind-merge) for conflict-free class merging.

```tsx title="src/utils/cn.ts"
import { cn } from '@rhino-dev/rhino-react';

// Basic usage
cn('px-4 py-2', 'bg-blue-500'); // 'px-4 py-2 bg-blue-500'

// Conditional classes
cn('px-4 py-2', isActive && 'bg-blue-500', isDisabled && 'opacity-50');

// Tailwind conflict resolution
cn('px-4', 'px-6'); // 'px-6' (later wins)
cn('text-red-500', 'text-blue-500'); // 'text-blue-500'
```

## useToast()

Toast notification state management hook.

```tsx title="src/components/MyComponent.tsx"
import { useToast } from '@rhino-dev/rhino-react';

function MyComponent() {
  const { toast, dismiss, toasts } = useToast();

  const showSuccess = () => {
    const { id } = toast({
      title: 'Success!',
      description: 'Your changes have been saved.',
    });

    // Auto-dismiss after 3 seconds
    setTimeout(() => dismiss(id), 3000);
  };

  const showError = () => {
    toast({
      title: 'Error',
      description: 'Something went wrong. Please try again.',
      variant: 'destructive',
    });
  };

  return (
    <div>
      <button onClick={showSuccess}>Save</button>
      <button onClick={showError}>Trigger Error</button>

      {/* Render toasts */}
      <div style={{ position: 'fixed', bottom: 20, right: 20 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ padding: '1rem', background: '#333', color: '#fff', marginBottom: '0.5rem', borderRadius: '8px' }}>
            <strong>{t.title}</strong>
            <p>{t.description}</p>
            <button onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## useModelAudit(model, id, options?, queryOptions?)

Fetch the audit trail (change history) for a specific record. `options` takes `page` and `perPage`; the trailing `queryOptions` takes any `useQuery` option except `queryKey` and `queryFn` (see [TanStack Query Options](./crud-hooks#tanstack-query-options)). The query never runs without an `id`.

```tsx title="src/components/PostHistory.tsx"
import { useModelAudit } from '@rhino-dev/rhino-react';

function PostHistory({ postId }) {
  const { data: response, isLoading } = useModelAudit('posts', postId, {
    page: 1,
    perPage: 50,
  });

  const logs = response?.data || [];
  const pagination = response?.pagination;

  if (isLoading) return <div>Loading history...</div>;

  return (
    <div>
      <h3>Change History</h3>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Changes</th>
            <th>By</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{log.action}</td>
              <td>
                {log.action === 'updated' && log.old_values && (
                  <ul>
                    {Object.keys(log.new_values || {}).map((field) => (
                      <li key={field}>
                        <strong>{field}:</strong>{' '}
                        <span style={{ textDecoration: 'line-through', color: 'red' }}>
                          {log.old_values[field]}
                        </span>{' → '}
                        <span style={{ color: 'green' }}>
                          {log.new_values[field]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {log.action === 'created' && (
                  <span>Record created</span>
                )}
                {log.action === 'deleted' && (
                  <span>Record deleted</span>
                )}
              </td>
              <td>User #{log.user_id}</td>
              <td>{new Date(log.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**API Request:** `GET /api/{organization}/posts/{id}/audit?page=1&per_page=50`

### Audit Log Entry Type

```typescript title="src/types.ts"
interface AuditLog {
  id: number;
  action: 'created' | 'updated' | 'deleted' | 'force_deleted' | 'restored';
  user_id: number;
  model_type: string;
  model_id: number;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

## Upgrading from 4.6

`@rhino-dev/rhino-react` 4.7 requires no code changes. Every addition is an optional argument or a new export:

| Addition | Where |
|---|---|
| Trailing `queryOptions` on `useModelIndex`, `useModelShow`, `useModelTrashed`, `useModelComputedAttributes`, `useModelAudit` | [TanStack Query Options](./crud-hooks#tanstack-query-options) |
| Trailing `mutationOptions` on `useModelStore`, `useModelUpdate`, `useModelDelete`, `useModelRestore`, `useModelForceDelete`, `useNestedOperations` | [Mutation options](./crud-hooks#mutation-options) |
| `FormData` bodies on `useModelStore` / `useModelUpdate` | [File Uploads](./crud-hooks#file-uploads) |
| `useModelInfinite` | [Infinite Scroll](./querying#infinite-scroll) |
| `tenancy: 'none'` and `routeGroupInDataPath` | [Tenancy and Data URLs](./authentication#tenancy-and-data-urls) |
| `configureApi({ timeout, withCredentials, nestedPath })` | [configureApi](#configureapioptions) |
| `buildModelUrl`, `modelKeys`, `fetchModelIndex`, `fetchModelShow` | [Outside React](#outside-react) |
| `LoginResult.token`, `STORAGE_KEYS` | [LoginResult](./authentication#loginresult-type), [Keys Used Internally](#keys-used-internally) |

Some behaviors differ without opting in:

- **A 401 also resets `AuthProvider` and clears `user`.** In 4.6 only `token` was removed from storage, and `isAuthenticated` stayed `true` until the provider remounted. If your app mirrored auth state in its own store to work around that, the mirror can go.
- **A rejected login no longer calls `onUnauthorized`.** A 401 from the login endpoint is reported by `login()` (`{ success: false, status: 401 }`) and leaves storage alone.
- **`useRegister` starts a session.** When the backend returns a token, it is stored with the user and organization and `AuthProvider` becomes authenticated. If you called `login()` after registering to get there, that call is no longer needed.
- **`useNestedOperations` posts to `/nested`.** That is the endpoint the servers register by default; 4.6 posted to `/nested-operations`, which a default server does not serve. If you set the server's nested `path` to `nested-operations` to match the old client, pass `configureApi({ nestedPath: 'nested-operations' })`.
- **`AuthProvider` follows `token` changes.** On the web, signing in or out in one browser tab updates `useAuth()` in the other tabs of the same origin.
- **`useOwner`, `useUserRole` and `useOrganizationExists` read the `{ data: [...] }` response envelope.** Against a current server, 4.6 returned the envelope itself from `useOwner()` and `hasRole()` was always `false`.
- **`login()` notifies mounted hooks and stores the configured route group.** Data hooks mounted before the login start fetching when it resolves, and a group set through `configureApi({ routeGroup })` reaches `useRouteGroup()`.

On React Native, `initStorage()` also restores `route_group` after a restart, so a group-aware session comes back in the group it signed into.
