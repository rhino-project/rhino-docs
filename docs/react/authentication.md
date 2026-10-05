---
sidebar_position: 2
title: Authentication
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Authentication

Rhino provides a complete authentication and organization management flow for React applications via a set of dedicated hooks. This page covers every auth-related hook in the `@rhino-dev/rhino-react` library, including `useAuth`, `useOrganization`, `useOwner`, and `useOrganizationExists`.

## useAuth()

The primary hook for authentication state and actions. It reads the API token from [`storage`](./utilities#storage) (`localStorage` on web, AsyncStorage on React Native), exposes login/logout functions, and manages the active organization.

```tsx title="src/hooks/useAuth.ts"
const { token, isAuthenticated, login, logout, setOrganization, setRouteGroup } = useAuth();
```

### Return Values

| Property | Type | Description |
|---|---|---|
| `token` | `string \| null` | Current API token held in storage. `null` when not authenticated. |
| `isAuthenticated` | `boolean` | `true` if a token exists, `false` otherwise. Follows sessions started by [`useRegister`](#group-aware-action-hooks) and ended by a [401 response](#handling-403-vs-401). |
| `login(email, password, options?)` | `(email: string, password: string, options?: { routeGroup?: string \| null }) => Promise<LoginResult>` | Authenticates the user and writes the returned token to storage before resolving. Accepts an optional per-call `routeGroup` (see [Group-Aware Auth](#group-aware-auth)). |
| `logout(options?)` | `(options?: { routeGroup?: string \| null }) => Promise<void>` | Calls the logout endpoint, then clears the token, user, persisted organization and route group from storage -- even if the request fails. It does not navigate; react to `isAuthenticated` turning `false`. |
| `setOrganization(slug)` | `(slug: string) => void` | Persists the given organization slug in storage for subsequent API requests. |
| `setRouteGroup(group)` | `(group: string \| null) => void` | Persists (or clears, when falsy) the active route group and notifies listeners. See [Group-Aware Auth](#group-aware-auth). |

### LoginResult Type

The `login` function returns a `LoginResult` object describing the outcome of the authentication attempt:

```tsx title="src/types.ts"
interface LoginResult {
  success: boolean;
  user?: any;
  organization?: { slug: string };
  organization_slug?: string;
  route_group?: string | null;
  token?: string | null;
  error?: string;
  status?: number;
}
```

- **`success`** -- `true` if login succeeded, `false` otherwise.
- **`user`** -- The authenticated user object (when successful).
- **`organization`** -- The user's default organization object, including its `slug`.
- **`organization_slug`** -- Shorthand for the organization slug (convenience field).
- **`route_group`** -- The route group this login resolved to (the value the backend echoes back, or the group you logged in with). `null` for the default/global auth path. See [Group-Aware Auth](#group-aware-auth).
- **`token`** -- The bearer token of the session that was started. It is already in storage when `login()` resolves.
- **`error`** -- An error message string when `success` is `false`.
- **`status`** -- The HTTP status of the login response. On failure it tells wrong credentials (`401`) from a denied group membership (`403`).

### Auth Flow

1. User calls `login(email, password)`
2. Rhino sends `POST /api/auth/login` to your backend
3. Server returns a token, user data, and organization slug
4. The client writes the token, user and organization to storage **before `login()` resolves**
5. All subsequent API requests include the `Authorization: Bearer {token}` header automatically
6. On a `401` response from any other request, the session ends: the token and user are removed from storage, `AuthProvider` resets, and `onUnauthorized` runs (see [Handling 403 vs 401](#handling-403-vs-401))

Because the token is stored before the promise resolves, a request issued right after `await login()` is already authenticated -- you do not need to wait for a re-render:

```tsx title="src/screens/LoginScreen.tsx"
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, modelKeys, fetchModelIndex } from '@rhino-dev/rhino-react';

const { login } = useAuth();
const queryClient = useQueryClient();

const result = await login(email, password);
if (result.success) {
  // Authorization: Bearer {result.token} is already attached
  await queryClient.prefetchQuery({
    queryKey: modelKeys.index('trips', {}),
    queryFn: () => fetchModelIndex('trips'),
  });
}
```

A rejected login does not end a session. A `401` from `/auth/login` (or `/{routeGroup}/auth/login`) leaves storage alone and does not call `onUnauthorized`; `login()` returns `{ success: false, status: 401, error }` for you to show.

:::info
The token is persisted in storage, so authentication survives page refreshes (and app restarts on React Native). Call `logout()` to explicitly clear it.
:::

### Login Component Example

A full login page with loading state and error handling:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/pages/LoginPage.tsx"
import { useAuth } from '@rhino-dev/rhino-react';
import { useState } from 'react';

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(email, password);

    if (result.success) {
      // Redirect to dashboard or org
      window.location.href = `/orgs/${result.organization_slug}/dashboard`;
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/pages/LoginPage.tsx"
import { useAuth } from '@rhino-dev/rhino-react';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    const result = await login(email, password);

    if (result.success) {
      navigation.navigate('Dashboard', { organization: result.organization_slug });
    } else {
      setError(result.error || 'Login failed');
    }

    setLoading(false);
  };

  if (isAuthenticated) {
    navigation.navigate('Dashboard');
    return null;
  }

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />
      {error ? <Text style={{ color: 'red' }}>{error}</Text> : null}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text>
          {loading ? 'Logging in...' : 'Log In'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

</TabItem>
</Tabs>

### Logout Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/LogoutButton.tsx"
function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={logout}>Log Out</button>;
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/LogoutButton.tsx"
import { TouchableOpacity, Text } from 'react-native';

function LogoutButton() {
  const { logout } = useAuth();

  return (
    <TouchableOpacity onPress={logout}>
      <Text>Log Out</Text>
    </TouchableOpacity>
  );
}
```

</TabItem>
</Tabs>

:::tip
`logout()` clears the session but does not navigate. Route on `isAuthenticated` -- a protected-route wrapper on web, a conditional navigator on React Native -- and the user lands on your login screen when it turns `false`.
:::

---

## Group-Aware Auth

A Rhino backend can register the auth route set per **route group** (see the
server's [Route Groups](../laravel/route-groups.md) docs). The client mirrors
this: tell it which group is signing in and it builds **group-scoped** auth URLs.

- A **prefix-based** group exposes its auth under `/{group}/auth/*` — e.g.
  `routeGroup: 'driver'` makes `login` hit `POST /api/driver/auth/login`.
- With no `routeGroup`, every auth URL is byte-for-byte the legacy `/auth/*`
  path. The feature is fully opt-in and backward compatible.

:::info Domain-based groups need no `routeGroup`
A **domain-based** group serves the plain `/api/auth/*` set on its own host, so
the host already scopes it — you do **not** set `routeGroup` for domain/subdomain
groups. `routeGroup` is only for **prefix-based** groups.
:::

### Configuring the group

There are two equivalent ways to register a route group with the client.

```tsx title="src/main.tsx"
import { configureApi, AuthProvider } from '@rhino-dev/rhino-react';

// Option A — configure the API client once at startup
configureApi({
  baseURL: '/api',
  routeGroup: 'driver',     // auth URLs become /api/driver/auth/*
  onForbidden: (error) => { // see "Handling 403" below
    console.warn(error.response?.data?.message);
  },
});

// Option B — pass it to the provider (it registers the group with the client)
<AuthProvider routeGroup="driver">{children}</AuthProvider>;
```

`configureApi` accepts (in addition to `baseURL` / `onUnauthorized`):

| Option | Type | Description |
|---|---|---|
| `routeGroup` | `string \| null` | Route group used to build group-aware auth URLs. When set, auth paths become `/{routeGroup}/auth/*`; pass `null` to clear a previously configured group. |
| `onForbidden` | `(error) => void` | Callback fired on a **403** response (authenticated but not a member of the group). The token is **not** cleared. |

### login / logout with a per-call group

`login` and `logout` accept a per-call `routeGroup` that overrides the configured
one. The resolved group is persisted under the `route_group` storage key (cleared
on logout) and exposed via [`useRouteGroup()`](#useroutegroup).

```tsx
const { login, logout } = useAuth();

// POST /api/admin/auth/login — overrides the provider/configured group
const result = await login(email, password, { routeGroup: 'admin' });
result.route_group; // 'admin'

await logout(); // also clears the persisted route group
```

### useRouteGroup()

Returns the active route group from storage. It mirrors
[`useOrganization()`](#useorganization) and stays in sync across tabs on web
(and in-memory on React Native).

```tsx
import { useRouteGroup } from '@rhino-dev/rhino-react';

const routeGroup = useRouteGroup(); // 'admin' after a group-aware login, else null
```

The group is persisted on a group-aware `login` (and by `useRegister` /
`useAcceptInvitation` when the backend echoes a `route_group`), and cleared on
`logout`.

### Handling 403 vs 401

The two responses mean different things and are handled differently:

| Status | Meaning | Client behavior |
|---|---|---|
| **401 Unauthorized** (any request except login) | Missing/expired token | `token` and `user` are **removed** from storage; `AuthProvider` resets (`isAuthenticated: false`, `token: null`); then `onUnauthorized` runs (default on web: redirect to `/`). |
| **401 Unauthorized** (from `/auth/login` or `/{routeGroup}/auth/login`) | Wrong credentials | Nothing is cleared and `onUnauthorized` does **not** run; `login()` returns `{ success: false, status: 401 }`. |
| **403 Forbidden** | Authenticated, but **not a member** of the requested route group (membership denial, when the backend has `enforce_group_membership` on) | Token is **kept**; `onForbidden(error)` runs so you can surface the denial without logging the user out. |

`AuthProvider` learns about the 401 through the `'token'` event on the [`events`](./utilities#events) adapter, so every component reading `useAuth()` re-renders logged out. Navigation that follows `isAuthenticated` needs no extra wiring, and there is no need to mirror auth state in your own store.

```tsx
configureApi({
  onForbidden: (error) => {
    // The user is logged in but cannot enter this group — show a message,
    // not a logout.
    toast(error.response?.data?.message ?? 'You do not have access to this area.');
  },
});
```

### Group-aware action hooks

Three mutation hooks complete the group-aware auth flow. Each respects the
configured `routeGroup` and accepts a per-call `routeGroup` override; the URLs
are built the same way as `login` (`/{group}/auth/*`, or `/auth/*` by default).

| Hook | Request | Payload |
|---|---|---|
| `useRegister()` | `POST {authBase}/auth/register` | `{ token, name, email, password, password_confirmation, routeGroup? }` |
| `usePasswordRecover()` | `POST {authBase}/auth/password/recover` | `{ email, routeGroup? }` |
| `useResetPassword()` | `POST {authBase}/auth/password/reset` | `{ token, email, password, password_confirmation, routeGroup? }` |

```tsx
import { useRegister, usePasswordRecover, useResetPassword } from '@rhino-dev/rhino-react';

const register = useRegister();
await register.mutateAsync({ token, name, email, password, password_confirmation });

const recover = usePasswordRecover();
await recover.mutateAsync({ email });

const reset = useResetPassword();
await reset.mutateAsync({ token, email, password, password_confirmation });
```

A successful `useRegister` starts a session exactly like `login()`: the token,
user and organization the backend returns are written to storage before the
mutation resolves, and `AuthProvider` becomes authenticated. A request issued
right after `await register.mutateAsync(...)` carries the bearer token. If the
response has no `token`, the session is left untouched. `useRegister` also
persists the `route_group` the backend echoes back (like a group-aware `login`),
so `useRouteGroup()` is populated after an invitation-accept registration.

`useAcceptInvitation` does **not** start a session -- the accept endpoint issues
no token. See [Invitations](./invitations).

---

## Tenancy and Data URLs

Auth URLs follow `routeGroup`. Data URLs -- every CRUD and query hook -- follow
two more options: `tenancy`, which says whether the organization is a path
segment, and `routeGroupInDataPath`, which puts the route group in front of it.

```tsx title="src/config.ts"
import { configureApi } from '@rhino-dev/rhino-react';

// A driver app talking to a prefix route group with no tenant
configureApi({
  baseURL: 'https://api.example.com/api',
  tenancy: 'none',
  routeGroup: 'driver',
  routeGroupInDataPath: true,
});
// useModelIndex('trips') -> GET /api/driver/trips
// login()                -> POST /api/driver/auth/login
```

| Option | Values | Effect on data URLs |
|---|---|---|
| `tenancy` | `'path'` (default) | The organization is a path segment: `/{organization}/{model}`. An organization is required. |
| | `'subdomain'` | The organization is carried by the **host** (`{organization}.example.com`): `/{model}`. No organization is required; you may still `setOrganization` for display. |
| | `'none'` | There is no organization: `/{model}`. No organization is required, and a stored one is ignored. |
| `routeGroupInDataPath` | `false` (default) | The route group shapes auth URLs only. |
| | `true` | The configured `routeGroup` is prepended to data URLs. |

Set `tenancy` with `configureApi({ tenancy })` or `<AuthProvider tenancy="…">`
(which accepts the same three values). The resulting URLs, with a base URL of
`/api`:

| Setup | Configuration | `useModelIndex('trips')` |
|---|---|---|
| Path tenancy (default) | -- | `/api/{organization}/trips` |
| Subdomain tenancy | `tenancy: 'subdomain'` | `/api/trips` on `{organization}.example.com` |
| No tenancy | `tenancy: 'none'` | `/api/trips` |
| Prefix group, no organization | `tenancy: 'none', routeGroup: 'driver', routeGroupInDataPath: true` | `/api/driver/trips` |
| Prefix group with organization | `tenancy: 'path', routeGroup: 'client', routeGroupInDataPath: true` | `/api/client/{organization}/trips` |
| Prefix group on a subdomain tenant | `tenancy: 'subdomain', routeGroup: 'driver', routeGroupInDataPath: true` | `/api/driver/trips` on the tenant host |

The same base applies to every data hook: index, show (`/{id}`), computed
(`/computed`), trashed (`/trashed`), restore (`/{id}/restore`), force delete
(`/{id}/force-delete`), audit (`/{id}/audit`), nested operations
(`/nested`) and `useModelInfinite`. `routeGroupInDataPath` has no
effect without a `routeGroup`, and it never changes auth URLs.

**Tenant-only hooks.** Organizations, roles and invitations belong to an
organization, so `useOwner`, `useOrganizationExists`, `useUserRole`,
`useInvitations`, `useInviteUser`, `useResendInvitation` and `useCancelInvitation`
always carry the organization segment, whatever the `tenancy` -- prefixed with the
route group when `routeGroupInDataPath` is on
(`/api/client/{organization}/invitations`). Without an organization they request
nothing. `useAcceptInvitation` always posts to the fixed `/api/invitations/accept`.

:::tip The matching server setup
`tenancy: 'none'` with `routeGroupInDataPath: true` talks to a **prefix route group
with no tenant boundary** -- on Laravel, a group declared `'tenant' => false` in
`config/rhino.php`. See the server's
[Multi-Tenancy -- Route Groups Without a Tenant Boundary](../laravel/multi-tenancy#route-groups-without-a-tenant-boundary)
and [Route Groups](../laravel/route-groups).
:::

---

## useOrganization()

Returns the current organization slug -- the `organization_slug` key in [`storage`](./utilities#storage) -- and re-renders when it changes through `setOrganization()` (across tabs on web, in-memory on React Native).

```tsx title="src/hooks/useOrganization.ts"
import { useOrganization } from '@rhino-dev/rhino-react';

const organization = useOrganization();
// Returns: 'acme-corp' or null
```

### How It Works

The organization slug is automatically included in all API requests made by Rhino hooks in the default `'path'` [tenancy](#tenancy-and-data-urls). You do not need to pass it manually to CRUD or query hooks. `login()` stores the first organization the backend returns; switch it with `setOrganization(slug)`.

:::info
The hook does not read the URL. If your routes carry the organization (e.g. `/orgs/:organization/*`), call `setOrganization(params.organization)` when the route changes so the hooks follow it.
:::

---

## useOwner(options?)

Fetches the current organization's full data from the API, with support for eager-loading related resources via the `includes` option. This is built on top of React Query, so it returns the standard `{ data, isLoading, error }` pattern.

```tsx title="src/hooks/useOwner.ts"
const { data: organization, isLoading, error } = useOwner({
  includes: ['users', 'roles'],
});
```

### Parameters

| Option | Type | Description |
|---|---|---|
| `includes` | `string[]` | Optional. An array of relationship names to eager-load with the organization. |
| `slug` | `string` | Optional. Override the organization slug instead of using the one from `useOrganization()`. |

### Response Shape

```tsx title="Response"
// Example response:
{
  id: 1,
  name: "Acme Corp",
  slug: "acme-corp",
  users: [
    { id: 1, name: "John", pivot: { role_id: 1 } },
    { id: 2, name: "Jane", pivot: { role_id: 2 } }
  ],
  roles: [
    { id: 1, name: "Admin" },
    { id: 2, name: "Member" }
  ]
}
```

### Organization Dashboard Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/OrgDashboard.tsx"
function OrgDashboard() {
  const { data: org, isLoading } = useOwner({ includes: ['users'] });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{org.name}</h1>
      <p>Slug: {org.slug}</p>
      <h2>Members ({org.users?.length})</h2>
      <ul>
        {org.users?.map(user => (
          <li key={user.id}>
            {user.name} — Role ID: {user.pivot?.role_id}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/OrgDashboard.tsx"
import { View, Text, FlatList, ActivityIndicator } from 'react-native';

function OrgDashboard() {
  const { data: org, isLoading } = useOwner({ includes: ['users'] });

  if (isLoading) return <ActivityIndicator size="large" />;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold' }}>{org.name}</Text>
      <Text>Slug: {org.slug}</Text>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Members ({org.users?.length})</Text>
      <FlatList
        data={org.users}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: user }) => (
          <View>
            <Text>{user.name} — Role ID: {user.pivot?.role_id}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

</TabItem>
</Tabs>

:::tip
Use the `includes` parameter to avoid N+1 queries. Load all the relationships you need in a single request rather than making separate API calls.
:::

---

## useOrganizationExists(slug?)

Checks whether a given organization slug already exists. This is particularly useful for registration and organization creation flows where you need to validate slug availability in real time.

```tsx title="src/hooks/useOrganizationExists.ts"
const { exists, isLoading, organization } = useOrganizationExists('acme-corp');
```

### Return Values

| Property | Type | Description |
|---|---|---|
| `exists` | `boolean` | `true` if the slug is already taken, `false` if available. |
| `isLoading` | `boolean` | `true` while the check is in progress. |
| `organization` | `object \| null` | The organization data if it exists, `null` otherwise. |

### Slug Availability Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/CreateOrgForm.tsx"
function CreateOrgForm() {
  const [slug, setSlug] = useState('');
  const { exists, isLoading } = useOrganizationExists(slug);

  return (
    <div>
      <input
        value={slug}
        onChange={e => setSlug(e.target.value)}
        placeholder="org-slug"
      />
      {isLoading && <span>Checking...</span>}
      {!isLoading && slug && (
        exists
          ? <span style={{ color: 'red' }}>Already taken</span>
          : <span style={{ color: 'green' }}>Available!</span>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/CreateOrgForm.tsx"
import { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { useOrganizationExists } from '@rhino-dev/rhino-react';

function CreateOrgForm() {
  const [slug, setSlug] = useState('');
  const { exists, isLoading } = useOrganizationExists(slug);

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        value={slug}
        onChangeText={setSlug}
        placeholder="org-slug"
        autoCapitalize="none"
      />
      {isLoading && <ActivityIndicator size="small" />}
      {!isLoading && slug && (
        exists
          ? <Text style={{ color: 'red' }}>Already taken</Text>
          : <Text style={{ color: 'green' }}>Available!</Text>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

:::info
The hook debounces the API call internally, so it is safe to call on every keystroke without flooding your server with requests.
:::

---

## Common Patterns

### Protected Route

Combine `useAuth` and `useOrganization` to guard routes that require both authentication and an active organization:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/ProtectedRoute.tsx"
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const organization = useOrganization();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (!organization) {
    return <Navigate to="/select-organization" />;
  }

  return children;
}

// Usage:
<Route
  path="/orgs/:organization/dashboard"
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  }
/>
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/ProtectedRoute.tsx"
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useOrganization } from '@rhino-dev/rhino-react';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const organization = useOrganization();
  const navigation = useNavigation();

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
    } else if (!organization) {
      navigation.navigate('SelectOrganization');
    }
  }, [isAuthenticated, organization]);

  if (!isAuthenticated || !organization) {
    return null;
  }

  return children;
}

// Usage in your navigator:
// <Stack.Screen name="Dashboard">
//   {() => (
//     <ProtectedRoute>
//       <Dashboard />
//     </ProtectedRoute>
//   )}
// </Stack.Screen>
```

</TabItem>
</Tabs>

### Organization Switching

Allow users to switch between organizations they belong to:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/OrgSwitcher.tsx"
function OrgSwitcher({ organizations }) {
  const { setOrganization } = useAuth();

  const handleSwitch = (slug) => {
    setOrganization(slug);
    window.location.href = `/orgs/${slug}/dashboard`;
  };

  return (
    <select onChange={e => handleSwitch(e.target.value)}>
      {organizations.map(org => (
        <option key={org.slug} value={org.slug}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/OrgSwitcher.tsx"
import { Text, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@rhino-dev/rhino-react';

function OrgSwitcher({ organizations }) {
  const { setOrganization } = useAuth();
  const navigation = useNavigation();

  const handleSwitch = (slug) => {
    setOrganization(slug);
    navigation.navigate('Dashboard', { organization: slug });
  };

  return (
    <FlatList
      data={organizations}
      keyExtractor={(item) => item.slug}
      renderItem={({ item: org }) => (
        <TouchableOpacity
          style={{ padding: 16 }}
          onPress={() => handleSwitch(org.slug)}
        >
          <Text>{org.name}</Text>
        </TouchableOpacity>
      )}
    />
  );
}
```

</TabItem>
</Tabs>

:::tip
After calling `setOrganization`, use a full page navigation (`window.location.href`) rather than a client-side route push. This ensures all cached queries are refreshed with the new organization context.
:::

### Full Auth + Org Setup

A complete example wiring login, organization selection, and protected content together:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/App.tsx"
import { RhinoProvider, useAuth, useOrganization, useOwner } from '@rhino-dev/rhino-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <RhinoProvider baseUrl="https://api.example.com">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/orgs/:organization/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </RhinoProvider>
    </BrowserRouter>
  );
}

function Dashboard() {
  const { logout } = useAuth();
  const { data: org, isLoading } = useOwner({ includes: ['users'] });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <header>
        <h1>{org.name}</h1>
        <button onClick={logout}>Log Out</button>
      </header>
      <p>Welcome! You have {org.users?.length} team members.</p>
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/App.tsx"
import { RhinoProvider, useAuth, useOrganization, useOwner } from '@rhino-dev/rhino-react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <RhinoProvider baseUrl="https://api.example.com">
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen name="Login" component={LoginPage} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
        </Stack.Navigator>
      </RhinoProvider>
    </NavigationContainer>
  );
}

function DashboardScreen() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { logout } = useAuth();
  const { data: org, isLoading } = useOwner({ includes: ['users'] });

  if (isLoading) return <ActivityIndicator size="large" />;

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold' }}>{org.name}</Text>
        <TouchableOpacity onPress={logout}>
          <Text>Log Out</Text>
        </TouchableOpacity>
      </View>
      <Text>
        Welcome! You have {org.users?.length} team members.
      </Text>
    </View>
  );
}
```

</TabItem>
</Tabs>
