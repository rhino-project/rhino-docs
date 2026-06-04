---
sidebar_position: 2
title: Authentication
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Authentication

Rhino provides a complete authentication and organization management flow for React applications via a set of dedicated hooks. This page covers every auth-related hook in the `@rhino-dev/rhino-react` library, including `useAuth`, `useOrganization`, `useOwner`, and `useOrganizationExists`.

## useAuth()

The primary hook for authentication state and actions. It reads the API token from `localStorage`, exposes login/logout functions, and manages the active organization.

```tsx title="src/hooks/useAuth.ts"
const { token, isAuthenticated, login, logout, setOrganization, setRouteGroup } = useAuth();
```

### Return Values

| Property | Type | Description |
|---|---|---|
| `token` | `string \| null` | Current API token stored in `localStorage`. `null` when not authenticated. |
| `isAuthenticated` | `boolean` | `true` if a token exists, `false` otherwise. |
| `login(email, password, options?)` | `(email: string, password: string, options?: { routeGroup?: string \| null }) => Promise<LoginResult>` | Authenticates the user and stores the returned token. Accepts an optional per-call `routeGroup` (see [Group-Aware Auth](#group-aware-auth)). |
| `logout(options?)` | `(options?: { routeGroup?: string \| null }) => void` | Clears the token (and persisted organization/route group) from storage and redirects to the home page. |
| `setOrganization(slug)` | `(slug: string) => void` | Persists the given organization slug in `localStorage` for subsequent API requests. |
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
  error?: string;
}
```

- **`success`** -- `true` if login succeeded, `false` otherwise.
- **`user`** -- The authenticated user object (when successful).
- **`organization`** -- The user's default organization object, including its `slug`.
- **`organization_slug`** -- Shorthand for the organization slug (convenience field).
- **`route_group`** -- The route group this login resolved to (the value the backend echoes back, or the group you logged in with). `null` for the default/global auth path. See [Group-Aware Auth](#group-aware-auth).
- **`error`** -- An error message string when `success` is `false`.

### Auth Flow

1. User calls `login(email, password)`
2. Rhino sends `POST /api/auth/login` to your backend
3. Server returns a token, user data, and organization slug
4. The client stores the token in `localStorage`
5. All subsequent API requests include the `Authorization: Bearer {token}` header automatically
6. On a `401` response, the token is cleared and the user is redirected to login

:::info
The token is persisted in `localStorage`, so authentication survives page refreshes. Call `logout()` to explicitly clear it.
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
`logout()` clears the token **and** redirects to the home page (`/`). If you need custom redirect behavior, clear the token manually and handle navigation yourself.
:::

---

## Group-Aware Auth

A Rhino backend can register the auth route set per **route group** (see the
server's [Route Groups](../server/route-groups.md) docs). The client mirrors
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
| **401 Unauthorized** | Missing/expired token | Token is **cleared**; `onUnauthorized` runs (default: redirect to `/`). |
| **403 Forbidden** | Authenticated, but **not a member** of the requested route group (membership denial, when the backend has `enforce_group_membership` on) | Token is **kept**; `onForbidden(error)` runs so you can surface the denial without logging the user out. |

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

`useRegister` persists the `route_group` the backend echoes back (like a
group-aware `login`), so `useRouteGroup()` is populated after an
invitation-accept registration.

:::warning Data hooks assume a path-prefix organization
The CRUD/query hooks (`useModelIndex`, `useModelShow`, …) build their URLs as
`/api/{organization}/{model}` from [`useOrganization()`](#useorganization). That
is correct for **path-prefix** multi-tenancy. For **subdomain/domain-based**
organizations the org comes from the host, so you should **not** call
`setOrganization` — leave it unset and let the host scope the data (requests stay
`/api/{model}`). Setting an org slug there would produce an incorrect
`/api/{slug}/{model}` URL. `routeGroup` affects only auth URLs, never data URLs.
:::

---

## useOrganization()

Returns the current organization slug. The hook resolves the slug using the following priority:

1. **URL params** -- Looks for an `:organization` param in a `/orgs/:organization/*` route pattern.
2. **localStorage fallback** -- Falls back to the `organization_slug` key in `localStorage`.

```tsx title="src/hooks/useOrganization.ts"
import { useOrganization } from '@rhino-dev/rhino-react';

const organization = useOrganization();
// Returns: 'acme-corp' or null
```

### How It Works

The organization slug is automatically included in all API requests made by Rhino hooks. You do not need to pass it manually to CRUD or query hooks.

### Example with Route

```tsx title="src/hooks/useOrganization.ts"
// URL: /orgs/acme-corp/dashboard
const org = useOrganization(); // 'acme-corp'
```

```tsx title="src/hooks/useOrganization.ts"
// URL: /orgs/my-startup/settings
const org = useOrganization(); // 'my-startup'
```

:::info
When using React Router, make sure your routes follow the `/orgs/:organization/*` pattern so that `useOrganization` can extract the slug from the URL automatically.
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
