---
sidebar_position: 2
title: Platform Adapters
---

# Platform Adapters

The `rhino-rn` adapter bridges web APIs to native equivalents.

## Storage Adapter

Replaces `localStorage` with platform-appropriate storage:

| Data | Web | React Native |
|------|-----|-------------|
| Auth token | `localStorage` | **SecureStore** (encrypted) |
| User data | `localStorage` | AsyncStorage |
| Org slug | `localStorage` | AsyncStorage |

```typescript title="src/lib/rhino-rn/storage.ts"
import { storage, storageHelpers } from '../lib/rhino-rn/storage';

// Basic operations
await storage.getItem('key');
await storage.setItem('key', 'value');
await storage.removeItem('key');

// JSON helpers
await storageHelpers.getJSON('user');
await storageHelpers.setJSON('user', { name: 'John' });
```

Tokens are stored in **Expo SecureStore**, which uses the device's keychain (iOS) or keystore (Android) for encryption.

## API Client

Platform-aware Axios instance with automatic:

- **Bearer token injection** from SecureStore
- **Organization header** from AsyncStorage
- **Platform-specific base URLs** (localhost vs 10.0.2.2 for Android emulator)
- **401 handling** — clears token and redirects to login
- **30-second timeout**

```typescript title="src/lib/rhino-rn/api-client.ts"
import { apiClient } from '../lib/rhino-rn/api-client';

// Direct API calls (if needed)
const response = await apiClient.get('/posts');
```

## Auth Provider

Adapted from the web `AuthProvider` for React Native:

- Uses **Expo Router** instead of `window.location`
- Uses **SecureStore** instead of `localStorage` for tokens
- Handles **AppState** changes (background/foreground)

```tsx title="App.tsx"
import { AuthProvider, useAuth } from '../lib/rhino-rn';

function App() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
```

## Organization Provider

- Watches **AppState** changes instead of `visibilitychange`
- Syncs org context across AsyncStorage layers

## Platform API Mapping

| Web API | React Native Equivalent | Adapter |
|---------|------------------------|---------|
| `localStorage` | AsyncStorage | `storage` |
| `localStorage` (secrets) | SecureStore | `storage` |
| `window.location` | Expo Router | AuthProvider |
| `document.visibilityState` | AppState | OrganizationProvider |
| `withCredentials: true` | Bearer header | API client interceptor |
| Storage events | Context + async | Provider pattern |
