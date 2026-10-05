---
sidebar_position: 2
title: Platform Adapters
---

# Platform Adapters

`@rhino-dev/rhino-react` reaches the platform through two small adapters, `storage` and `events`.
When Metro bundles a React Native app it resolves their `.native.js` versions; everything built on top
— the API client, `AuthProvider`, every hook — is shared with the web.

| Web API | React Native equivalent | Adapter |
|---------|------------------------|---------|
| `localStorage` | AsyncStorage + in-memory cache | `storage` |
| `window` `StorageEvent` | In-memory emitter | `events` |
| `window.location` redirect on 401 | Your navigator, following `useAuth().isAuthenticated` | — |
| Cookies (`withCredentials: true`) | Bearer header; `configureApi({ withCredentials: false })` | API client |

## Storage

The hooks and the API client read storage **synchronously** — the request interceptor reads the token
on every request. AsyncStorage is asynchronous, so the native adapter keeps an in-memory cache:

- `getItem` reads the cache.
- `setItem` / `removeItem` update the cache immediately and write to AsyncStorage in the background (a
  failed write logs a warning).
- `initStorage()` loads the library's keys from AsyncStorage into the cache. Await it once before
  rendering — see [Getting Started](./getting-started#2-load-storage-then-render).

```tsx
import { storage, initStorage, STORAGE_KEYS } from '@rhino-dev/rhino-react';

await initStorage();          // AsyncStorage.multiGet(STORAGE_KEYS) into memory
storage.getItem('token');     // synchronous from here on
```

`initStorage()` hydrates exactly `STORAGE_KEYS`:

| Key | Holds |
|-----|-------|
| `token` | The bearer token |
| `user` | The signed-in user, JSON-encoded |
| `organization_slug` | The current organization |
| `last_organization` | The last organization the user worked in |
| `route_group` | The route group of a group-aware session |

Your app may store its own values through `storage`; they are persisted, but `initStorage()` does not
reload them after a restart. Read those from AsyncStorage directly.

### A custom secure store

AsyncStorage is not encrypted. To keep the token in the Keychain / Keystore, plug in your own adapter
with `configureApi({ storage })` (or `setStorageAdapter(adapter)`; pass `null` to go back to
AsyncStorage). An adapter is any object implementing the synchronous `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
```

Secure-storage libraries are asynchronous, so use the same pattern as the built-in adapter: hydrate a
cache before the first render, serve reads from it, persist writes in the background.

```tsx title="src/secureStorage.ts"
import { STORAGE_KEYS, type StorageAdapter } from '@rhino-dev/rhino-react';
// Any async key-value store backed by the Keychain / Keystore.
import * as Vault from './vault';

const cache: Record<string, string> = {};

export async function hydrateSecureStorage() {
  for (const key of STORAGE_KEYS) {
    const value = await Vault.get(key);
    if (value != null) cache[key] = value;
  }
}

export const secureStorage: StorageAdapter = {
  getItem: (key) => cache[key] ?? null,
  setItem: (key, value) => {
    cache[key] = value;
    Vault.set(key, value).catch(console.warn);
  },
  removeItem: (key) => {
    delete cache[key];
    Vault.remove(key).catch(console.warn);
  },
};
```

```tsx title="App.tsx"
import { useEffect, useState } from 'react';
import { configureApi } from '@rhino-dev/rhino-react';
import { secureStorage, hydrateSecureStorage } from './src/secureStorage';

configureApi({ storage: secureStorage });

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // In place of initStorage(), which only fills the AsyncStorage adapter's cache
    hydrateSecureStorage().then(() => setReady(true));
  }, []);

  if (!ready) return <SplashScreen />;
  // ...providers as in Getting Started
}
```

## Events

`events` notifies the library's hooks when a stored value changes. On native it is an in-memory
emitter, scoped to the app process — there are no tabs to sync.

| Event | Emitted when | Read by |
|---|---|---|
| `token` | A 401 ends the session (`null`), `useRegister` starts one (the token) | `AuthProvider` |
| `organization_slug` | `setOrganization()`, `useRegister` | `useOrganization` |
| `route_group` | A group-aware login, register or invitation accept, `setRouteGroup()`, `logout()` | `useRouteGroup` |

See [Utilities — events](../react/utilities#events) for the `emit` / `subscribe` API.

## API client

The `api` Axios instance is the web one. Configure it for native with `configureApi`:

```tsx title="src/rhino.ts"
configureApi({
  baseURL: 'https://api.yourapp.com/api',
  withCredentials: false, // default true is for Sanctum cookies on web
  timeout: 20_000,        // default: no timeout
});
```

- It attaches `Authorization: Bearer {token}` from `storage` to every request.
- On a 401 from any request except login it removes `token` and `user`, resets `AuthProvider` through
  the `token` event, then calls `onUnauthorized` if you passed one.
- On a 403 it keeps the token and calls `onForbidden`.
- A `FormData` body is sent as `multipart/form-data`; React Native's networking layer adds the
  boundary.

See [Utilities — api](../react/utilities#api).
