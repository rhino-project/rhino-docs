---
sidebar_position: 1
title: Getting Started
---

# React Native — Getting Started

React Native apps use the same package as the web: `@rhino-dev/rhino-react`. The hooks, their
signatures and their return values are identical; only storage and events swap to native
implementations, and that happens automatically when Metro bundles the app. It works on bare React
Native and on Expo.

## Installation

```bash title="terminal"
npm install @rhino-dev/rhino-react @tanstack/react-query axios @react-native-async-storage/async-storage
```

On bare React Native, install the iOS pods for AsyncStorage afterwards (`npx pod-install`). Expo
projects can use `npx expo install @react-native-async-storage/async-storage` to get the version that
matches their SDK.

### How the native build is picked

The package's `react-native` entry points Metro at its source (`src/index.ts`), so Metro resolves
platform files the usual way:

| Module | Web | React Native |
|---|---|---|
| `storage` | `storage.js` — `localStorage` | `storage.native.js` — AsyncStorage behind a synchronous in-memory cache |
| `events` | `events.js` — `window` `StorageEvent` (cross-tab) | `events.native.js` — an in-memory emitter |

Nothing to configure: you import from `@rhino-dev/rhino-react` and get the native adapters. See
[Platform Adapters](./platform-adapters) for how they behave.

## Setup

### 1. Configure the API client

```tsx title="src/rhino.ts"
import { Platform } from 'react-native';
import { configureApi } from '@rhino-dev/rhino-react';

configureApi({
  baseURL: __DEV__
    ? Platform.select({
        android: 'http://10.0.2.2:8000/api', // the host machine, from the Android emulator
        default: 'http://localhost:8000/api',
      })
    : 'https://api.yourapp.com/api',
  withCredentials: false, // bearer token, no cookies
  timeout: 20_000,        // 20-30 s suits mobile networks
  onUnauthorized: () => {
    // Optional: the session is already cleared and AuthProvider has reset.
    // Use it for side effects such as a "Session expired" toast.
  },
});
```

`withCredentials` defaults to `true` (Sanctum cookie auth on web) and there is no timeout by default,
so set both on native. `onUnauthorized` is optional on native: the web default redirects through
`window.location`, which React Native does not have, so without a handler a 401 simply clears the
session and [navigation follows `isAuthenticated`](#3-navigate-on-isauthenticated). See [Utilities — configureApi](../react/utilities#configureapioptions)
for every option, including `tenancy` and `routeGroupInDataPath`.

### 2. Load storage, then render

The hooks read storage synchronously, so the session saved in AsyncStorage has to be in memory before
the first render. Call `await initStorage()` once at startup:

```tsx title="App.tsx"
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, initStorage } from '@rhino-dev/rhino-react';
import './src/rhino'; // runs configureApi
import { RootNavigator } from './src/navigation/RootNavigator';
import { SplashScreen } from './src/screens/SplashScreen';

const queryClient = new QueryClient();

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initStorage().then(() => setReady(true));
  }, []);

  if (!ready) return <SplashScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

`initStorage()` restores the token, the user, the organization and the route group. Render
`AuthProvider` before it resolves and the app starts logged out.

### 3. Navigate on `isAuthenticated`

Navigation belongs to your app — React Navigation, Expo Router, or anything else. Drive it from
`useAuth().isAuthenticated`, which follows every way a session starts or ends: `login()`,
`useRegister`, `logout()` and a 401 from the API.

```tsx title="src/navigation/RootNavigator.tsx"
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@rhino-dev/rhino-react';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Trips" component={TripsScreen} />
            <Stack.Screen name="Trip" component={TripScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

When a token expires, the next request gets a 401, the client clears the session, and this navigator
switches to the login screen by itself — there is no auth state to mirror in a store of your own.

### 4. Use the hooks

```tsx title="src/screens/TripsScreen.tsx"
import { FlatList, Text } from 'react-native';
import { useModelIndex } from '@rhino-dev/rhino-react';

export function TripsScreen() {
  const { data: response, refetch, isRefetching } = useModelIndex<Trip>('trips', {
    sort: '-created_at',
  });

  return (
    <FlatList
      data={response?.data ?? []}
      keyExtractor={(trip) => String(trip.id)}
      renderItem={({ item }) => <Text>{item.destination}</Text>}
      onRefresh={refetch}
      refreshing={isRefetching}
    />
  );
}
```

Everything on the web docs applies unchanged — [CRUD Hooks](../react/crud-hooks),
[Querying](../react/querying), [Authentication](../react/authentication). [Hooks](./hooks) lists the
signatures with native examples: infinite lists, polling, photo uploads.

## Related

- [Hooks](./hooks) — every hook signature, with React Native examples
- [Platform Adapters](./platform-adapters) — storage, events, custom secure storage
- [React Client — Getting Started](../react/getting-started) — the full feature map
