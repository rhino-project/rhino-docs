---
sidebar_position: 9
title: Desktop (Electron)
---

# Desktop (Electron)

`@rhino-dev/rhino-react` runs in an **Electron** desktop app the same way it runs
on the web — the renderer is Chromium, so the hooks, `AuthProvider`, and
`configureApi` all work unchanged. There is **no separate `rhino-electron`
package**; Electron support ships as three subpath modules of `rhino-react`.

The only thing worth adding for desktop is **secure token storage**: instead of
leaving the auth token in the renderer's `localStorage`, store it encrypted at
rest via Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
(the OS keychain) in the **main** process, and reach it from the renderer over IPC.

## The three modules

| Layer | Import | Provides |
|-------|--------|----------|
| Main | `@rhino-dev/rhino-react/electron` | `registerRhinoSecureStorage()`, `createSecureStore()` |
| Preload | `@rhino-dev/rhino-react/electron/preload` | `exposeRhinoStorage()` |
| Renderer | `@rhino-dev/rhino-react/electron/renderer` | `createElectronStorage()`, `initElectronStorage()` |

Electron primitives are **injected** (you pass `ipcMain`, `safeStorage`,
`contextBridge`, etc.), so the library carries no `electron` dependency and works
across Electron versions.

## 1. Main process

```ts title="src/main/index.ts"
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerRhinoSecureStorage } from '@rhino-dev/rhino-react/electron';

app.whenReady().then(() => {
  // Encrypted store under app.getPath('userData') + IPC handlers.
  registerRhinoSecureStorage({ ipcMain, safeStorage, app, fs, path });
  // ...createWindow()
});
```

If the OS has no keyring available, the store falls back to obfuscated-but-
unencrypted persistence with a warning. Pass `allowPlaintextFallback: false` to
hard-require encryption instead.

## 2. Preload

```ts title="src/preload/index.ts"
import { contextBridge, ipcRenderer } from 'electron';
import { exposeRhinoStorage } from '@rhino-dev/rhino-react/electron/preload';

// Exposes window.rhino.storage (async, IPC-backed).
exposeRhinoStorage({ contextBridge, ipcRenderer });
```

## 3. Renderer

The Rhino storage API is synchronous, but the secure store is reached
asynchronously over IPC — so, exactly like the React Native adapter, the
renderer keeps an in-memory cache that you hydrate once at boot.

```tsx title="src/renderer/main.tsx"
import { configureApi } from '@rhino-dev/rhino-react';
import {
  createElectronStorage,
  initElectronStorage,
} from '@rhino-dev/rhino-react/electron/renderer';

async function bootstrap() {
  await initElectronStorage();           // hydrate token/user/org from the main store
  configureApi({
    baseURL: '/api',
    storage: createElectronStorage(),     // route auth state through safeStorage
  });
  // ...render <AuthProvider>…</AuthProvider>
}
bootstrap();
```

That's it — `useAuth`, `useModelIndex`, and everything else behave as on web,
but the token now lives in the OS keychain instead of `localStorage`, and a
signed-in user stays signed in across app restarts.

## Custom storage in general

`configureApi({ storage })` accepts **any** adapter
(`{ getItem, setItem, removeItem }`), and `createElectronStorage()` is just one
implementation. You can pass your own token vault, or call `setStorageAdapter()`
directly:

```ts
import { setStorageAdapter } from '@rhino-dev/rhino-react';
setStorageAdapter(myCustomAdapter); // or setStorageAdapter(null) to reset to the default
```

## Dev vs. packaged: the API origin

The Electron renderer is a browser, so requests are subject to **CORS**. In
development, proxy `/api` to your Rhino backend (electron-vite/Vite
`server.proxy`) so the renderer uses relative URLs. For a packaged app, either
enable CORS for your app origin on the backend, or proxy requests through the
main process to avoid CORS entirely.

See the runnable **`client-desktop`** example in the `rhino-examples` repo.
