---
sidebar_position: 99
title: Release Notes
---

# Release Notes

Notable changes in each release of `@rhino-dev/rhino-react`, newest first. The same package serves
React and React Native.

## 4.7.0

**The hooks can be called straight from a React Native component, with no wrapper layer.** Polling,
dependent queries, file uploads, "load more" lists and prefix route groups previously needed
app-side code around the hooks; they are now part of the hooks themselves.

```tsx title="src/screens/TripScreen.tsx"
const { data: trip } = useModelShow<Trip>('trips', tripId, {}, { refetchInterval: 5000 });

const stops = useModelInfinite<Stop>(
  'stops',
  { filters: { trip_id: trip?.id }, perPage: 20 },
  { enabled: !!trip },
);
const items = stops.data?.pages.flatMap((page) => page.data) ?? [];
```

### Added

| Addition | Where |
|---|---|
| Trailing `queryOptions` on `useModelIndex`, `useModelShow`, `useModelTrashed`, `useModelComputedAttributes`, `useModelAudit`. `enabled` is AND-ed with the hook's own guard, and `select` flows into the return type. | [TanStack Query Options](./crud-hooks#tanstack-query-options) |
| Trailing `mutationOptions` on `useModelStore`, `useModelUpdate`, `useModelDelete`, `useModelRestore`, `useModelForceDelete`, `useNestedOperations`. The built-in invalidation runs before your `onSuccess`. | [Mutation options](./crud-hooks#mutation-options) |
| `FormData` bodies on `useModelStore` / `useModelUpdate`. An update is a multipart `POST` with `X-HTTP-Method-Override: PUT`. | [File Uploads](./crud-hooks#file-uploads) |
| `useModelInfinite`, which accumulates pages from the pagination headers. Every mutation that invalidates a model's lists invalidates its infinite lists too. | [Infinite Scroll](./querying#infinite-scroll) |
| `tenancy: 'none'` and `routeGroupInDataPath`, for prefix route groups with or without an organization. | [Tenancy and Data URLs](./authentication#tenancy-and-data-urls) |
| `configureApi({ timeout, withCredentials, nestedPath })` | [configureApi](./utilities#configureapioptions) |
| `buildModelUrl`, `modelKeys`, `fetchModelIndex`, `fetchModelShow`, for code that runs outside React. The hooks are built on them. | [Outside React](./utilities#outside-react) |
| `LoginResult.token`, `STORAGE_KEYS` | [LoginResult](./authentication#loginresult-type), [Keys Used Internally](./utilities#keys-used-internally) |

### Fixed

- **The token is in storage when `login()` resolves.** It used to be written after the next render, so
  a request made right after `await login()` went out without an `Authorization` header.
- **React Native: `initStorage()` restores `route_group`**, so a group-aware session comes back in the
  group it signed into after an app restart.
- **`useNestedOperations` posts to `/nested`**, the endpoint the Laravel, Rails and NestJS servers
  register by default. It used to post to `/nested-operations`, which a default server answers with 404.
- **`useOwner`, `useUserRole` and `useOrganizationExists` read the `{ data: [...] }` response
  envelope.** Against a current server `useOwner()` returned the envelope itself and `hasRole()` was
  always `false`.
- **`login()` notifies hooks that are already mounted and stores the configured route group.** Data
  hooks mounted before the login start fetching when it resolves, and a group set through
  `configureApi({ routeGroup })` reaches `useRouteGroup()`.
- The default 401 handler no longer throws on React Native when no `onUnauthorized` is configured.

### Upgrading from 4.6

No code changes are required: with no new option passed, URLs, request bodies and query keys are the
same as in 4.6, with the one exception of the nested-operations URL above. Every addition is an
optional argument or a new export.

:::warning Behaviors that differ without opting in
- **A 401 also resets `AuthProvider` and clears `user`.** In 4.6 only `token` was removed from storage
  and `isAuthenticated` stayed `true` until the provider remounted. If your app mirrored auth state in
  its own store to work around that, the mirror can go. On the web, signing in or out in one browser
  tab now updates `useAuth()` in the other tabs of the same origin.
- **A rejected login no longer calls `onUnauthorized`.** A 401 from the login endpoint is reported by
  `login()` (`{ success: false, status: 401 }`) and leaves storage alone.
- **`useRegister` starts a session.** When the backend returns a token it is stored with the user and
  organization, and `AuthProvider` becomes authenticated. A `login()` call after registering is no
  longer needed.
- **`useNestedOperations` posts to `/nested`.** If you set the server's nested `path` to
  `nested-operations` to match the old client, pass `configureApi({ nestedPath: 'nested-operations' })`.
:::

On React Native, bearer-token apps can drop any `api.defaults` mutation in favor of
`configureApi({ withCredentials: false, timeout: 20_000 })`. See
[React Native — Getting Started](../react-native/getting-started).
