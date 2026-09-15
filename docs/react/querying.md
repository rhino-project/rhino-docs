---
sidebar_position: 4
title: Querying
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Querying

This is for the `@rhino-dev/rhino-react` React client library. All query options work with `useModelIndex`, `useModelShow`, and `useModelTrashed`.

## Query Options

Every query hook accepts a `ModelQueryOptions` object that controls filtering, sorting, pagination, search, eager loading, and field selection:

```tsx title="src/types.ts"
interface ModelQueryOptions {
  filters?: Record<string, any>;
  includes?: string[];
  sort?: string;
  fields?: string[];
  search?: string;
  scope?: string | ScopeSelection;
  computedAttributes?: string[] | ComputedAttributeSelection;
  page?: number;
  perPage?: number;
}
```

:::info
All query parameters are optional. You can combine any subset of them in a single request.
:::

## Filtering

Pass a `filters` object to narrow results. Each key-value pair maps to a query parameter the server uses to scope the response.

```tsx title="src/components/PostsList.tsx"
const { data } = useModelIndex('posts', {
  filters: { status: 'published' },
});

// Multiple filters (AND)
const { data } = useModelIndex('posts', {
  filters: { status: 'published', user_id: 1 },
});
```

Maps to: `GET /api/posts?filter[status]=published&filter[user_id]=1`

:::tip
Filters are reactive. When the filter values change, TanStack Query automatically refetches with the new parameters.
:::

### Dynamic Filters Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/FilterablePosts.tsx"
import { useState } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function FilterablePosts() {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');

  const filters: Record<string, any> = {};
  if (status !== 'all') filters.status = status;
  if (category) filters.category_id = category;

  const { data: response, isLoading } = useModelIndex('posts', {
    filters,
    sort: '-created_at',
    perPage: 20,
  });

  const posts = response?.data || [];

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          <option value="1">Technology</option>
          <option value="2">Design</option>
          <option value="3">Business</option>
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {posts.map(post => (
            <li key={post.id}>
              {post.title} — <em>{post.status}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/FilterablePosts.tsx"
import React, { useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useModelIndex } from '@rhino-dev/rhino-react';

function FilterablePosts() {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');

  const filters: Record<string, any> = {};
  if (status !== 'all') filters.status = status;
  if (category) filters.category_id = category;

  const { data: response, isLoading } = useModelIndex('posts', {
    filters,
    sort: '-created_at',
    perPage: 20,
  });

  const posts = response?.data || [];

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
        <Picker
          selectedValue={status}
          onValueChange={(value) => setStatus(value)}
          style={{ flex: 1 }}
        >
          <Picker.Item label="All Statuses" value="all" />
          <Picker.Item label="Published" value="published" />
          <Picker.Item label="Draft" value="draft" />
          <Picker.Item label="Archived" value="archived" />
        </Picker>

        <Picker
          selectedValue={category}
          onValueChange={(value) => setCategory(value)}
          style={{ flex: 1 }}
        >
          <Picker.Item label="All Categories" value="" />
          <Picker.Item label="Technology" value="1" />
          <Picker.Item label="Design" value="2" />
          <Picker.Item label="Business" value="3" />
        </Picker>
      </View>

      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: post }) => (
            <View style={{ paddingVertical: 8 }}>
              <Text>
                {post.title} — <Text style={{ fontStyle: 'italic' }}>{post.status}</Text>
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

## Sorting

Use the `sort` option to order results. Prefix a field name with `-` for descending order.

```tsx title="src/components/PostsList.tsx"
// Ascending by title
const { data } = useModelIndex('posts', { sort: 'title' });

// Descending by date (newest first)
const { data } = useModelIndex('posts', { sort: '-created_at' });

// Multiple sorts (comma-separated)
const { data } = useModelIndex('posts', { sort: '-created_at,title' });
```

:::info
Multiple sort fields are comma-separated in a single string. The server applies them in order -- the first field is the primary sort, the second breaks ties, and so on.
:::

### Sortable Table Header Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/SortablePostsTable.tsx"
import { useState } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function SortablePostsTable() {
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sort = sortDirection === 'desc' ? `-${sortField}` : sortField;

  const { data: response, isLoading } = useModelIndex('posts', {
    sort,
    perPage: 20,
  });

  const posts = response?.data || [];

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      onClick={() => toggleSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label}{' '}
      {sortField === field ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

  if (isLoading) return <p>Loading...</p>;

  return (
    <table>
      <thead>
        <tr>
          <SortHeader field="title" label="Title" />
          <SortHeader field="status" label="Status" />
          <SortHeader field="created_at" label="Created" />
        </tr>
      </thead>
      <tbody>
        {posts.map(post => (
          <tr key={post.id}>
            <td>{post.title}</td>
            <td>{post.status}</td>
            <td>{new Date(post.created_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/SortablePostsTable.tsx"
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useModelIndex } from '@rhino-dev/rhino-react';

function SortablePostsTable() {
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sort = sortDirection === 'desc' ? `-${sortField}` : sortField;

  const { data: response, isLoading } = useModelIndex('posts', {
    sort,
    perPage: 20,
  });

  const posts = response?.data || [];

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <TouchableOpacity onPress={() => toggleSort(field)} style={{ flex: 1 }}>
      <Text style={{ fontWeight: 'bold' }}>
        {label}{' '}
        {sortField === field ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) return <Text>Loading...</Text>;

  return (
    <View>
      {/* Header */}
      <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
        <SortHeader field="title" label="Title" />
        <SortHeader field="status" label="Status" />
        <SortHeader field="created_at" label="Created" />
      </View>

      {/* Rows */}
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: post }) => (
          <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
            <Text style={{ flex: 1 }}>{post.title}</Text>
            <Text style={{ flex: 1 }}>{post.status}</Text>
            <Text style={{ flex: 1 }}>{new Date(post.created_at).toLocaleDateString()}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

</TabItem>
</Tabs>

## Search

Use the `search` option for full-text search across server-defined searchable fields.

```tsx title="src/components/PostsList.tsx"
const { data } = useModelIndex('posts', { search: 'laravel' });
```

:::tip
The fields that are searched depend on your Laravel backend configuration. Typically, this covers fields like `title`, `body`, or any fields you have registered as searchable on the model.
:::

### Debounced Search Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/SearchablePosts.tsx"
import { useState, useEffect } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function SearchablePosts() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: response, isLoading } = useModelIndex('posts', {
    search: debouncedSearch,
    perPage: 20,
  });

  const posts = response?.data || [];

  return (
    <div>
      <input
        type="text"
        placeholder="Search posts..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {isLoading ? (
        <p>Searching...</p>
      ) : (
        <>
          <p>{response?.pagination?.total ?? 0} results found</p>
          <ul>
            {posts.map(post => (
              <li key={post.id}>{post.title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/SearchablePosts.tsx"
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList } from 'react-native';
import { useModelIndex } from '@rhino-dev/rhino-react';

function SearchablePosts() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: response, isLoading } = useModelIndex('posts', {
    search: debouncedSearch,
    perPage: 20,
  });

  const posts = response?.data || [];

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TextInput
        placeholder="Search posts..."
        value={search}
        onChangeText={setSearch}
      />

      {isLoading ? (
        <Text>Searching...</Text>
      ) : (
        <>
          <Text>
            {response?.pagination?.total ?? 0} results found
          </Text>
          <FlatList
            data={posts}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item: post }) => (
              <View style={{ paddingVertical: 8 }}>
                <Text>{post.title}</Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

## Named Scopes

Use the `scope` option to **select** a server-defined named scope by name. The backend declares which scopes a model exposes (and a default); the client just picks one. This is ideal for complex, user-specific listings whose joins are resolved server-side — you send a name, not the query.

```tsx title="src/components/DriverRoutes.tsx"
// Only the routes this authenticated driver may take
const { data } = useModelIndex('routes', { scope: 'availableForDrivers' });
```

Maps to: `GET /api/routes?scope=availableForDrivers`

When you omit `scope`, the server applies the model's declared **default scope** automatically. Named scopes compose with `filters`, `sort`, `page`, `perPage`, `search`, `includes`, and `fields`:

```tsx title="src/components/DriverRoutes.tsx"
const { data } = useModelIndex('routes', {
  scope: 'availableForDrivers',
  sort: '-created_at',
  includes: ['region'],
  page,
  perPage: 20,
});
```

It also works with `useModelTrashed`:

```tsx title="src/components/ActiveTrash.tsx"
const { data } = useModelTrashed('routes', { scope: 'active' });
```

### Scopes with arguments

A scope can take arguments the server declares. Pass an object instead of a name: the key is the scope, and the value is its argument.

```tsx
// One declared parameter: a bare value
useModelIndex('routes', { scope: { since: '2026-01-01' } });
// GET /api/routes?scope[since]=2026-01-01

// Several: an object of parameter name to value
useModelIndex('routes', { scope: { window: { from: '2026-01-01', to: '2026-02-01' } } });
// GET /api/routes?scope[window][from]=2026-01-01&scope[window][to]=2026-02-01

// A scope that takes no arguments, written in the object form
useModelIndex('routes', { scope: { archived: null } });
// GET /api/routes?scope[archived]=
```

Up to three scopes may be combined, and they apply in key order:

```tsx
useModelIndex('routes', {
  scope: { archived: null, since: '2026-01-01' },
});
```

Use the object form for every scope in a request that needs arguments: the string form and the object form cannot be mixed, because they share the one `scope` query key. A plain `scope: 'archived'` is still the way to select a single no-argument scope.

Arguments the server did not declare, a missing required one, or a bare value for a scope with several parameters all return **403** with a message naming the parameter.

:::info Not applied by `useModelShow`
`scope` narrows list results, so it applies to `useModelIndex` and `useModelTrashed`. It is **not** applied by `useModelShow` (single-record fetches are not scoped).
:::

:::warning Unknown scopes return 403
A scope name the model has not whitelisted, or that the user's policy does not permit, causes the request to **403**. Both cases return the same message. This surfaces through the client's `onForbidden` path — handle it like any other authorization failure.
:::

:::warning Filtering or sorting by a hidden attribute returns 403
An attribute the server's policy hides from this user cannot be used in `filters` or `sort`. A column the model never allowlisted is still ignored silently, as before; it is only the hidden ones that refuse.
:::

### Worked Example: driver routes

The backend declares an `availableForDrivers` named scope on the `Route` model — a scope whose body joins assignments and driver qualifications and filters to the *authenticated* driver, all resolved server-side. The drivers app then only has to ask for it by name:

```tsx title="src/components/AvailableRoutes.tsx"
import { useModelIndex } from '@rhino-dev/rhino-react';

function AvailableRoutes() {
  const { data: response, isLoading } = useModelIndex('routes', {
    scope: 'availableForDrivers',
    sort: '-created_at',
    includes: ['region'],
  });

  const routes = response?.data || [];

  if (isLoading) return <p>Loading routes...</p>;

  return (
    <ul>
      {routes.map(route => (
        <li key={route.id}>
          {route.name} — {route.region?.name}
        </li>
      ))}
    </ul>
  );
}
```

The client sends only `?scope=availableForDrivers`; the server resolves the current user and applies the complex joins, returning exactly the routes that driver may take. The client never sends user identity.

## Computed Attributes

Servers can expose values that aren't database columns. Two of the three kinds are **opt-in**, so you only pay for what you ask for.

### Per-record attributes — `computedAttributes`

Pass the attribute names you want merged into each returned record. Nothing is computed server-side unless you name it:

```tsx title="src/components/UserList.tsx"
import { useModelIndex } from '@rhino-dev/rhino-react';

function UserList() {
  const { data: response } = useModelIndex('users', {
    computedAttributes: ['full_name', 'avatar_url'],
  });

  return (
    <ul>
      {(response?.data ?? []).map(user => (
        <li key={user.id}>
          <img src={user.avatar_url} alt="" />
          {user.full_name}
        </li>
      ))}
    </ul>
  );
}
```

Works on `useModelIndex`, `useModelShow` and `useModelTrashed`. Serialized as `?computed_attributes=full_name,avatar_url`.

Requesting an attribute the model doesn't declare — or that your role isn't allowed to read — returns **403**, so a typo surfaces immediately rather than silently returning nothing.

#### Attributes with arguments

An attribute can declare parameters the server fills in from the client. Pass an object instead of an array: the key is the attribute, and the value is its argument.

```tsx
// One declared parameter: a bare value
useModelIndex('users', { computedAttributes: { ticketsSince: '2026-01-01' } });
// GET /api/users?computed_attributes[ticketsSince]=2026-01-01

// Several: an object of parameter name to value
useModelIndex('users', { computedAttributes: { revenue: { from: '2026-01-01', to: '2026-02-01' } } });
// GET /api/users?computed_attributes[revenue][from]=2026-01-01&computed_attributes[revenue][to]=2026-02-01

// An attribute that takes no arguments, written in the object form
useModelIndex('users', { computedAttributes: { avatar_url: null } });
// GET /api/users?computed_attributes[avatar_url]=
```

The forms may be combined freely within one object, and they apply in key order:

```tsx
useModelIndex('users', {
  computedAttributes: {
    avatar_url: null,
    ticketsSince: '2026-01-01',
    revenue: { from: '2026-01-01', to: '2026-02-01' },
  },
});
```

Use the object form for every attribute in a request that needs arguments: the array form and the object form cannot be mixed, because they share the one `computed_attributes` query key. A plain `computedAttributes: ['avatar_url']` is still the way to select attributes that take none.

Booleans serialize as `true` / `false` and reach the server as real booleans, so a flag parameter behaves the way you would expect. Arguments the server did not declare, a missing required one, or a bare value for an attribute with several parameters all return **403** with a message naming the parameter.

```tsx title="ComputedAttributeSelection"
type ComputedAttributeSelection = Record<
  string,
  string | number | boolean | null | Record<string, string | number | boolean>
>;
```

### Collection aggregates — `useModelComputedAttributes`

For counts, sums and averages over the **whole collection**, use the dedicated hook. Each attribute is evaluated **once per request** on the server rather than once per row, which is what makes it cheap:

```tsx title="src/components/UserStats.tsx"
import { useModelComputedAttributes } from '@rhino-dev/rhino-react';

function UserStats() {
  const { data: stats, isLoading } = useModelComputedAttributes('users', {
    attributes: ['active_users_count', 'blocked_users_count'],
  });

  if (isLoading) return <Spinner />;

  return (
    <dl>
      <dt>Active</dt><dd>{stats?.active_users_count}</dd>
      <dt>Blocked</dt><dd>{stats?.blocked_users_count}</dd>
    </dl>
  );
}
```

The hook returns the attribute object itself — `{ active_users_count: 128, blocked_users_count: 4 }`. Omit `attributes` to fetch every attribute your role is allowed to read, minus any that declares a required parameter — those are skipped rather than erroring, so adding one server-side never breaks a client that asks for everything.

`attributes` takes the same object form as `computedAttributes`, for aggregates that declare parameters:

```tsx
const { data: stats } = useModelComputedAttributes('users', {
  attributes: {
    revenue: { from: '2026-01-01', to: '2026-02-01' },
    activeUsersCount: null,
  },
});
// GET /api/users/computed?attributes[revenue][from]=2026-01-01
//     &attributes[revenue][to]=2026-02-01&attributes[activeUsersCount]=
```

`filters`, `search` and `scope` narrow the set the aggregates describe, exactly as they narrow `useModelIndex`. Pass the same values to both hooks and the numbers describe the list the user is actually looking at:

```tsx title="src/components/FilteredUsers.tsx"
function FilteredUsers({ teamId, term }) {
  const query = { filters: { team_id: teamId }, search: term };

  const { data: users } = useModelIndex('users', query);
  const { data: stats } = useModelComputedAttributes('users', {
    ...query,
    attributes: ['active_users_count'],
  });

  return (
    <>
      <h2>{stats?.active_users_count} active in this team</h2>
      <UserTable rows={users?.data ?? []} />
    </>
  );
}
```

```tsx title="ComputedAttributesOptions"
interface ComputedAttributesOptions {
  attributes?: string[] | ComputedAttributeSelection;
  filters?: Record<string, any>;
  search?: string;
  scope?: string;
}
```

`ComputedAttributeSelection` and `ScopeSelection` are both exported from the package entry point, so you can type a selection you build up in state.

:::tip Don't compute counts per row
If you find yourself declaring a count as a per-record computed attribute, move it to a collection attribute — the server would otherwise run the same query once for every row on the page.
:::

## Pagination

Control page-based pagination with `page` and `perPage`. The response includes a `pagination` object with metadata.

```tsx title="src/components/PaginatedPosts.tsx"
const [page, setPage] = useState(1);
const { data: response } = useModelIndex('posts', { page, perPage: 20 });

const pagination = response?.pagination;
// { currentPage: 1, lastPage: 10, perPage: 20, total: 195 }
```

:::info
Pagination metadata is extracted from response **headers**, not the response body. The hooks handle this automatically and expose it as `response.pagination`.
:::

### Pagination Component Example

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/PaginatedPosts.tsx"
import { useState } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function PaginatedPosts() {
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data: response, isLoading } = useModelIndex('posts', {
    page,
    perPage,
    sort: '-created_at',
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>

      {pagination && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            Previous
          </button>

          <span>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total records)
          </span>

          <button
            onClick={() => setPage(p => Math.min(pagination.lastPage, p + 1))}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/PaginatedPosts.tsx"
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useModelIndex } from '@rhino-dev/rhino-react';

function PaginatedPosts() {
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data: response, isLoading } = useModelIndex('posts', {
    page,
    perPage,
    sort: '-created_at',
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (isLoading) return <Text>Loading...</Text>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: post }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{post.title}</Text>
          </View>
        )}
      />

      {pagination && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => setPage(p => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            <Text>Previous</Text>
          </TouchableOpacity>

          <Text>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total records)
          </Text>

          <TouchableOpacity
            onPress={() => setPage(p => Math.min(pagination.lastPage, p + 1))}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            <Text>Next</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

## Eager Loading (Includes)

Use `includes` to load related models in a single request, avoiding N+1 query problems.

```tsx title="src/components/PostsList.tsx"
const { data } = useModelIndex('posts', {
  includes: ['user', 'comments', 'tags'],
});

// Access included data
response?.data.forEach(post => {
  console.log(post.user.name);
  console.log(post.comments.length);
});
```

:::tip
Only include relationships you actually need. Each included relationship adds to the response payload size and server query time.
:::

This works the same way with `useModelShow`:

```tsx title="src/components/PostDetail.tsx"
const { data: post } = useModelShow('posts', postId, {
  includes: ['user', 'comments.user', 'tags'],
});

// Nested includes use dot notation
// post.comments[0].user.name
```

## Field Selection

Use `fields` to request only specific fields, reducing payload size.

```tsx title="src/components/PostsList.tsx"
const { data } = useModelIndex('posts', {
  fields: ['id', 'title', 'status'],
});
```

:::tip
Field selection is useful for list views where you only need a few columns. Fetching fewer fields reduces bandwidth and can improve response times.
:::

## Combined Example

Here is a complete component that brings together filtering, sorting, search, pagination, eager loading, and field selection:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/AdvancedPostsList.tsx"
import { useState, useEffect } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function AdvancedPostsList() {
  // Search with debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filters
  const [status, setStatus] = useState('all');

  // Sorting
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch, sortField, sortDirection]);

  // Build filters
  const filters: Record<string, any> = {};
  if (status !== 'all') filters.status = status;

  // Build sort string
  const sort = sortDirection === 'desc' ? `-${sortField}` : sortField;

  // Query
  const { data: response, isLoading } = useModelIndex('posts', {
    filters,
    sort,
    search: debouncedSearch,
    page,
    perPage,
    includes: ['user', 'tags'],
    fields: ['id', 'title', 'status', 'created_at'],
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search posts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th
                onClick={() => toggleSort('title')}
                style={{ cursor: 'pointer' }}
              >
                Title {sortField === 'title' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Author</th>
              <th>Tags</th>
              <th
                onClick={() => toggleSort('status')}
                style={{ cursor: 'pointer' }}
              >
                Status {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                onClick={() => toggleSort('created_at')}
                style={{ cursor: 'pointer' }}
              >
                Created {sortField === 'created_at' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map(post => (
              <tr key={post.id}>
                <td>{post.title}</td>
                <td>{post.user?.name}</td>
                <td>{post.tags?.map(t => t.name).join(', ')}</td>
                <td>{post.status}</td>
                <td>{new Date(post.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {pagination && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            Previous
          </button>
          <span>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total)
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.lastPage, p + 1))}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/AdvancedPostsList.tsx"
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useModelIndex } from '@rhino-dev/rhino-react';

function AdvancedPostsList() {
  // Search with debounce
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filters
  const [status, setStatus] = useState('all');

  // Sorting
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch, sortField, sortDirection]);

  // Build filters
  const filters: Record<string, any> = {};
  if (status !== 'all') filters.status = status;

  // Build sort string
  const sort = sortDirection === 'desc' ? `-${sortField}` : sortField;

  // Query
  const { data: response, isLoading } = useModelIndex('posts', {
    filters,
    sort,
    search: debouncedSearch,
    page,
    perPage,
    includes: ['user', 'tags'],
    fields: ['id', 'title', 'status', 'created_at'],
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <TouchableOpacity onPress={() => toggleSort(field)} style={{ flex: 1 }}>
      <Text style={{ fontWeight: 'bold' }}>
        {label}{' '}
        {sortField === field ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Toolbar */}
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
        <TextInput
          placeholder="Search posts..."
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1 }}
        />

        <Picker
          selectedValue={status}
          onValueChange={(value) => setStatus(value)}
          style={{ flex: 1 }}
        >
          <Picker.Item label="All Statuses" value="all" />
          <Picker.Item label="Published" value="published" />
          <Picker.Item label="Draft" value="draft" />
        </Picker>
      </View>

      {/* Table */}
      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <View>
          {/* Header */}
          <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
            <SortHeader field="title" label="Title" />
            <View style={{ flex: 1 }}><Text style={{ fontWeight: 'bold' }}>Author</Text></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: 'bold' }}>Tags</Text></View>
            <SortHeader field="status" label="Status" />
            <SortHeader field="created_at" label="Created" />
          </View>

          {/* Rows */}
          <FlatList
            data={posts}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item: post }) => (
              <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
                <Text style={{ flex: 1 }}>{post.title}</Text>
                <Text style={{ flex: 1 }}>{post.user?.name}</Text>
                <Text style={{ flex: 1 }}>{post.tags?.map(t => t.name).join(', ')}</Text>
                <Text style={{ flex: 1 }}>{post.status}</Text>
                <Text style={{ flex: 1 }}>{new Date(post.created_at).toLocaleDateString()}</Text>
              </View>
            )}
          />
        </View>
      )}

      {/* Pagination */}
      {pagination && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => setPage(p => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            <Text>Previous</Text>
          </TouchableOpacity>
          <Text>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total)
          </Text>
          <TouchableOpacity
            onPress={() => setPage(p => Math.min(pagination.lastPage, p + 1))}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            <Text>Next</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

:::tip
Notice the `useEffect` that resets the page to 1 whenever filters, search, or sort change. This prevents the user from being stuck on an out-of-range page after narrowing results.
:::
