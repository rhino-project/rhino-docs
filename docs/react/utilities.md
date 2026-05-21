---
sidebar_position: 8
title: Utilities
---

# Utilities

Rhino exports utility functions, adapters, and hooks beyond the main CRUD operations.

## configureApi(options)

Configure the Axios client used by all hooks.

```tsx title="src/config.ts"
import { configureApi } from '@rhino-dev/rhino-react';

configureApi({
  baseURL: 'https://api.yourapp.com/api',
  onUnauthorized: () => {
    // Called on 401 responses
    // Default: clears token and redirects to '/'
    window.location.href = '/login';
  },
});
```

| Option | Type | Description |
|--------|------|-------------|
| `baseURL` | `string` | API base URL (default: `/api`) |
| `onUnauthorized` | `() => void` | Callback on 401 responses |

:::tip React Native
Use `onUnauthorized` to navigate to your login screen instead of the default `window.location` redirect:
```tsx title="src/config.ts"
configureApi({
  baseURL: 'https://api.yourapp.com/api',
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

- **Attaches auth token** — reads from `localStorage.getItem('token')` and adds `Authorization: Bearer {token}` header
- **Handles 401 responses** — clears the token and calls `onUnauthorized`
- **Sends credentials** — includes cookies for CORS requests (`withCredentials: true`)
- **Sets content type** — `application/json` and `Accept: application/json`

## storage

Platform-agnostic storage adapter. Uses `localStorage` on web and can be swapped for `AsyncStorage` on React Native.

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

### Keys Used Internally

| Key | Description |
|-----|-------------|
| `token` | API authentication token |
| `organization_slug` | Current organization slug |

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

:::info Cross-Tab Sync
On web, organization changes are broadcast via `StorageEvent`, enabling cross-tab synchronization. When a user switches organizations in one tab, other tabs can detect and respond.
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

## useModelAudit(model, id, options?)

Fetch the audit trail (change history) for a specific record.

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
