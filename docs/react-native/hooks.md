---
sidebar_position: 3
title: Hooks
---

# React Native Hooks

Full CRUD parity with the web client. Same API, native execution.

## Available Hooks

All hooks have identical signatures to the [React Client hooks](../react/crud-hooks):

### Query Hooks

```typescript title="Query Hooks"
useModelIndex<T>(model, options?, queryOptions?)
useModelShow<T>(model, id, options?, queryOptions?)
useModelTrashed<T>(model, options?, queryOptions?)
useModelAudit<T>(model, id, options?)
```

### Mutation Hooks

```typescript title="Mutation Hooks"
useModelStore<T>(model, options?)
useModelUpdate<T>(model, options?)
useModelDelete<T>(model, options?)
useModelRestore<T>(model, options?)
useModelForceDelete<T>(model, options?)
```

## Example: Full CRUD Screen

```tsx title="src/screens/PostsScreen.tsx"
import { View, FlatList, Text, Button, Alert } from 'react-native';
import {
  useModelIndex,
  useModelStore,
  useModelDelete,
} from '../lib/rhino-rn';

function PostsScreen() {
  const { data: response, isLoading } = useModelIndex('posts', {
    page: 1,
    perPage: 20,
    sort: '-created_at',
  });

  const createPost = useModelStore('posts');
  const deletePost = useModelDelete('posts');

  const posts = response?.data || [];

  const handleCreate = () => {
    createPost.mutate(
      { title: 'New Post', body: 'Content' },
      { onSuccess: () => Alert.alert('Created!') }
    );
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete?', 'Move to trash?', [
      { text: 'Cancel' },
      { text: 'Delete', onPress: () => deletePost.mutate(id) },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <Button title="New Post" onPress={handleCreate} />
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#30363d' }}>
            <Text style={{ color: '#e6edf3', fontSize: 16 }}>{item.title}</Text>
            <Button title="Delete" onPress={() => handleDelete(item.id)} />
          </View>
        )}
      />
    </View>
  );
}
```

## Auth Hook

```tsx title="src/screens/ProfileScreen.tsx"
import { useAuth } from '../lib/rhino-rn';

function ProfileScreen() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <View>
      <Text>{user?.name}</Text>
      <Text>{user?.email}</Text>
      <Button title="Logout" onPress={logout} />
    </View>
  );
}
```

### Group-Aware Auth

The auth hooks are identical to the web client, including the group-aware flow:
`configureApi({ routeGroup, onForbidden })`, the per-call
`login(email, password, { routeGroup })` override, `useRouteGroup()`, and the
`useRegister` / `usePasswordRecover` / `useResetPassword` hooks. On native the
route group is kept in sync in-memory rather than across tabs. See the web
[Authentication → Group-Aware Auth](../react/authentication.md#group-aware-auth)
page for the full reference.

On native, pass `onUnauthorized` (401, clears token) and `onForbidden` (403,
membership denied, keeps token) to drive navigation instead of the web's default
`window.location` redirect:

```tsx title="src/lib/rhino-rn.ts"
configureApi({
  baseURL: 'https://api.example.com/api',
  routeGroup: 'driver',
  onUnauthorized: () => navigation.navigate('Login'),
  onForbidden: (error) => showMembershipDenied(error),
});
```

## Differences from Web

| Aspect | Web | React Native |
|--------|-----|-------------|
| Import path | `@rhino-dev/rhino-react` | `../lib/rhino-rn` |
| Token storage | localStorage | SecureStore (encrypted) |
| Navigation on auth | `window.location` | Expo Router |
| Network errors | Standard | Handles offline gracefully |

The hook signatures and return types are **identical** — only the import path differs.
