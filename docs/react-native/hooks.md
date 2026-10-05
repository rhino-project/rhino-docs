---
sidebar_position: 3
title: Hooks
---

# React Native Hooks

React Native uses the web client's hooks, imported from the same package. The signatures below are
exact; the [React client docs](../react/crud-hooks) describe each one in full.

```tsx
import { useModelIndex, useModelStore, useAuth } from '@rhino-dev/rhino-react';
```

## Signatures

### Query hooks

```typescript title="Query hooks"
useModelIndex<T, TData = QueryResponse<T>>(model, options?, queryOptions?)
useModelInfinite<T>(model, options?, queryOptions?)
useModelShow<T, TData = T>(model, id, options?, queryOptions?)
useModelTrashed<T, TData = QueryResponse<T>>(model, options?, queryOptions?)
useModelComputedAttributes<T, TData = T>(model, options?, queryOptions?)
useModelAudit<TData = QueryResponse<AuditLog>>(model, id, options?, queryOptions?)
```

`options` is `ModelQueryOptions` (`ComputedAttributesOptions` for the computed hook) and becomes the
URL and the cache key. `queryOptions` is `ModelQueryHookOptions` — any `useQuery` option except
`queryKey` and `queryFn` — and never enters the key. `enabled` is AND-ed with the hook's own guard
(organization present in `'path'` tenancy, `id` present), so it can narrow but never widen it.
`useModelInfinite` takes `ModelInfiniteQueryHookOptions`, which also leaves out the page-param
functions. See [TanStack Query Options](../react/crud-hooks#tanstack-query-options).

### Mutation hooks

```typescript title="Mutation hooks"
useModelStore<T, TContext>(model, mutationOptions?)
useModelUpdate<T, TContext>(model, mutationOptions?)
useModelDelete<T, TContext>(model, mutationOptions?)
useModelRestore<T, TContext>(model, mutationOptions?)
useModelForceDelete<T, TContext>(model, mutationOptions?)
useNestedOperations<TContext>(mutationOptions?)
```

`mutationOptions` is `ModelMutationHookOptions` — any `useMutation` option except `mutationFn`. On
success the hook's cache invalidation runs first, then your `onSuccess`, then any per-call `onSuccess`
passed to `mutate()`.

### Auth and organization hooks

`useAuth`, `useRouteGroup`, `useRegister`, `usePasswordRecover`, `useResetPassword`,
`useOrganization`, `useOwner`, `useOrganizationExists`, `useUserRole` and the invitation hooks are the
web hooks too. See [Authentication](../react/authentication) and [Invitations](../react/invitations).

## Example: CRUD screen

```tsx title="src/screens/PostsScreen.tsx"
import { View, FlatList, Text, Button, Alert } from 'react-native';
import { useModelIndex, useModelStore, useModelDelete } from '@rhino-dev/rhino-react';

export function PostsScreen() {
  const { data: response } = useModelIndex<Post>('posts', {
    page: 1,
    perPage: 20,
    sort: '-created_at',
  });

  const createPost = useModelStore<Post>('posts', {
    onSuccess: () => Alert.alert('Created!'),
  });
  const deletePost = useModelDelete('posts');

  const confirmDelete = (id: number) => {
    Alert.alert('Delete?', 'Move to trash?', [
      { text: 'Cancel' },
      { text: 'Delete', onPress: () => deletePost.mutate(id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Button title="New Post" onPress={() => createPost.mutate({ title: 'New Post', body: 'Content' })} />
      <FlatList
        data={response?.data ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 16 }}>
            <Text>{item.title}</Text>
            <Button title="Delete" onPress={() => confirmDelete(item.id)} />
          </View>
        )}
      />
    </View>
  );
}
```

## Example: infinite list

`useModelInfinite` accumulates pages; wire `fetchNextPage` to `onEndReached`:

```tsx title="src/screens/FeedScreen.tsx"
import { FlatList, ActivityIndicator, Text } from 'react-native';
import { useModelInfinite } from '@rhino-dev/rhino-react';

export function FeedScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useModelInfinite<Post>('posts', { sort: '-created_at', perPage: 20 });

  return (
    <FlatList
      data={data?.pages.flatMap((page) => page.data) ?? []}
      keyExtractor={(post) => String(post.id)}
      renderItem={({ item }) => <Text>{item.title}</Text>}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator /> : null}
    />
  );
}
```

See [Querying — Infinite Scroll](../react/querying#infinite-scroll).

## Example: polling and dependent queries

```tsx title="src/screens/TripScreen.tsx"
import { useModelShow, useModelIndex } from '@rhino-dev/rhino-react';

export function TripScreen({ route }) {
  // Refresh the trip every 15 s while the screen is mounted
  const { data: trip } = useModelShow<Trip>('trips', route.params.id, {}, {
    refetchInterval: 15_000,
  });

  // Only fetch stops once the trip has loaded
  const { data: stops } = useModelIndex<Stop>(
    'stops',
    { filters: { trip_id: trip?.id } },
    { enabled: !!trip },
  );

  // ...
}
```

## Example: photo upload

Pass a `FormData` to `useModelStore` or `useModelUpdate`. On React Native a file is an object with
`uri`, `name` and `type`:

```tsx title="src/screens/ProfilePhoto.tsx"
import { useModelUpdate } from '@rhino-dev/rhino-react';

export function useUploadPhoto(userId: number) {
  const updateUser = useModelUpdate('users');

  return (photo: { uri: string; fileName?: string; mimeType?: string }) => {
    const form = new FormData();
    form.append('photo', {
      uri: photo.uri,
      name: photo.fileName ?? 'photo.jpg',
      type: photo.mimeType ?? 'image/jpeg',
    } as any);

    // POST /api/{organization}/users/{id} + X-HTTP-Method-Override: PUT, multipart/form-data
    return updateUser.mutateAsync({ id: userId, data: form });
  };
}
```

See [CRUD Hooks — File Uploads](../react/crud-hooks#file-uploads).

## Auth

```tsx title="src/screens/LoginScreen.tsx"
import { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { useAuth } from '@rhino-dev/rhino-react';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const result = await login(email, password);
    // On success the token is already stored and isAuthenticated is true:
    // the root navigator switches to the app screens by itself.
    if (!result.success) {
      setError(result.status === 401 ? 'Wrong email or password' : result.error ?? 'Login failed');
    }
  };

  return (
    <View>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry />
      {error && <Text>{error}</Text>}
      <Button title="Log in" onPress={submit} />
    </View>
  );
}
```

`useAuth()` returns `token`, `isAuthenticated`, `login`, `logout`, `setOrganization` and
`setRouteGroup`. The signed-in user is stored under the `user` key:

```tsx title="src/hooks/useCurrentUser.ts"
import { storage } from '@rhino-dev/rhino-react';

export function useCurrentUser(): User | null {
  const raw = storage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}
```

A rejected login (401 from `/auth/login`) is returned by `login()` and does not call
`onUnauthorized`. A 401 from any other request clears the session and resets `AuthProvider`, so a
navigator that follows `isAuthenticated` returns to the login screen without extra code.

### Group-aware auth

The group-aware flow is the web one: `configureApi({ routeGroup, onForbidden })`, the per-call
`login(email, password, { routeGroup })` override, `useRouteGroup()`, and the `useRegister` /
`usePasswordRecover` / `useResetPassword` hooks. On native the route group is kept in sync in-memory
rather than across tabs. See [Authentication — Group-Aware Auth](../react/authentication#group-aware-auth).

```tsx title="src/rhino.ts"
configureApi({
  baseURL: 'https://api.example.com/api',
  withCredentials: false,
  timeout: 20_000,
  routeGroup: 'driver',
  onForbidden: (error) => showMembershipDenied(error), // 403: token kept
});
```

For a driver app whose data lives under the group prefix with no organization
(`/api/driver/trips`), add `tenancy: 'none'` and `routeGroupInDataPath: true`. See
[Tenancy and Data URLs](../react/authentication#tenancy-and-data-urls).

## Differences from web

| Aspect | Web | React Native |
|--------|-----|-------------|
| Import path | `@rhino-dev/rhino-react` | `@rhino-dev/rhino-react` |
| Storage | `localStorage` | AsyncStorage behind an in-memory cache; `await initStorage()` before rendering |
| Events | `StorageEvent`, synced across tabs | In-memory, within the app process |
| Auth transport | Cookies (`withCredentials: true`) and bearer token | Bearer token; set `withCredentials: false` |
| Navigation on 401 | Default redirect to `/` | Your navigator, following `isAuthenticated` |
| File uploads | `File` / `Blob` in `FormData` | `{ uri, name, type }` in `FormData` |

The hook signatures and return types are **identical**.
