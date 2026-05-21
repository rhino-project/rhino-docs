---
sidebar_position: 3
title: CRUD Hooks
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# CRUD Hooks

Complete CRUD operations with TanStack Query -- zero boilerplate. Every hook automatically scopes requests to the current organization, manages caching, and invalidates related queries on mutation success.

All five hooks are imported from `@rhino-dev/rhino-react`:

```tsx title="src/hooks/crud.ts"
import {
  useModelIndex,
  useModelShow,
  useModelStore,
  useModelUpdate,
  useModelDelete,
} from '@rhino-dev/rhino-react';
```

---

## useModelIndex(model, options?)

Fetch a paginated list of records with filtering, sorting, search, and more.

```tsx title="src/components/PostsList.tsx"
const { data: response, isLoading, error, refetch } = useModelIndex('posts', {
  filters: { status: 'published', user_id: 1 },
  includes: ['user', 'comments'],
  sort: '-created_at',
  search: 'laravel',
  page: 1,
  perPage: 20,
  fields: ['id', 'title', 'excerpt'],
});

const posts = response?.data || [];
const pagination = response?.pagination;
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | The model name matching your API resource (e.g., `'posts'`, `'users'`). |
| `options` | `ModelQueryOptions` | Optional. Filtering, sorting, pagination, search, includes, and field selection. |

### Return Value

Returns a standard TanStack Query result object:

| Property | Type | Description |
|---|---|---|
| `data` | `QueryResponse<T> \| undefined` | Contains `data` (array of records) and `pagination` metadata. |
| `isLoading` | `boolean` | `true` during the initial fetch. |
| `error` | `Error \| null` | The error object if the request failed. |
| `refetch` | `() => Promise` | Manually re-trigger the query. |

### ModelQueryOptions

```tsx title="src/types.ts"
interface ModelQueryOptions {
  filters?: Record<string, any>;
  includes?: string[];
  sort?: string;
  fields?: string[];
  search?: string;
  page?: number;
  perPage?: number;
}
```

| Option | Type | Example | Description |
|---|---|---|---|
| `filters` | `Record<string, any>` | `{ status: 'published' }` | Key-value pairs translated to `?filter[key]=value`. |
| `includes` | `string[]` | `['user', 'comments']` | Eager-load relationships. Sent as `?include=user,comments`. |
| `sort` | `string` | `'-created_at'` | Sort field. Prefix with `-` for descending. Comma-separate for multiple: `'-created_at,title'`. |
| `fields` | `string[]` | `['id', 'title']` | Sparse fieldset. Only return these fields. |
| `search` | `string` | `'laravel'` | Full-text search query sent as `?search=laravel`. |
| `page` | `number` | `1` | Current page number. |
| `perPage` | `number` | `20` | Number of records per page. Sent as `?per_page=20`. |

### QueryResponse Type

```tsx title="src/types.ts"
interface QueryResponse<T> {
  data: T[];
  pagination: PaginationMeta | null;
}

interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
}
```

:::info
Pagination metadata is extracted from **response headers**, not the response body. The hook handles this automatically -- you just read `response.pagination`.
:::

### Complete Posts List Example

A full component with search, filtering, pagination controls, loading state, and error handling:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/PostsList.tsx"
import { useState } from 'react';
import { useModelIndex } from '@rhino-dev/rhino-react';

function PostsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: response, isLoading, error, refetch } = useModelIndex('posts', {
    filters: statusFilter !== 'all' ? { status: statusFilter } : undefined,
    includes: ['user', 'tags'],
    sort: '-created_at',
    search: search || undefined,
    page,
    perPage: 15,
    fields: ['id', 'title', 'excerpt', 'status', 'created_at'],
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (error) {
    return (
      <div>
        <p>Failed to load posts: {error.message}</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        placeholder="Search posts..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1); // Reset to first page on new search
        }}
      />

      {/* Filter */}
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setPage(1);
        }}
      >
        <option value="all">All Statuses</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </select>

      {/* Loading */}
      {isLoading && <p>Loading posts...</p>}

      {/* Posts List */}
      {!isLoading && posts.length === 0 && <p>No posts found.</p>}

      {posts.map((post) => (
        <article key={post.id}>
          <h3>{post.title}</h3>
          <p>{post.excerpt}</p>
          <small>
            By {post.user?.name} | {new Date(post.created_at).toLocaleDateString()}
          </small>
          <span>{post.status}</span>
          <div>
            {post.tags?.map((tag) => (
              <span key={tag.id}>{tag.name}</span>
            ))}
          </div>
        </article>
      ))}

      {/* Pagination Controls */}
      {pagination && (
        <nav>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            Previous
          </button>

          <span>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total)
          </span>

          <button
            onClick={() => setPage((p) => Math.min(pagination.lastPage, p + 1))}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/PostsList.tsx"
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useModelIndex } from '@rhino-dev/rhino-react';

const STATUS_OPTIONS = ['all', 'published', 'draft', 'archived'];

function PostsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: response, isLoading, error, refetch } = useModelIndex('posts', {
    filters: statusFilter !== 'all' ? { status: statusFilter } : undefined,
    includes: ['user', 'tags'],
    sort: '-created_at',
    search: search || undefined,
    page,
    perPage: 15,
    fields: ['id', 'title', 'excerpt', 'status', 'created_at'],
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: 'red' }}>Failed to load posts: {error.message}</Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Search */}
      <TextInput
        placeholder="Search posts..."
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          setPage(1);
        }}
      />

      {/* Filter */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {STATUS_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => {
              setStatusFilter(option);
              setPage(1);
            }}
          >
            <Text>
              {option === 'all' ? 'All Statuses' : option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading */}
      {isLoading && <ActivityIndicator size="large" />}

      {/* Posts List */}
      {!isLoading && posts.length === 0 && (
        <Text>No posts found.</Text>
      )}

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: post }) => (
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{post.title}</Text>
            <Text>{post.excerpt}</Text>
            <Text>
              By {post.user?.name} | {new Date(post.created_at).toLocaleDateString()}
            </Text>
            <Text>{post.status}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {post.tags?.map((tag) => (
                <Text key={tag.id}>{tag.name}</Text>
              ))}
            </View>
          </View>
        )}
      />

      {/* Pagination Controls */}
      {pagination && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
          <TouchableOpacity
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pagination.currentPage <= 1}
          >
            <Text>Previous</Text>
          </TouchableOpacity>

          <Text>
            Page {pagination.currentPage} of {pagination.lastPage}
            {' '}({pagination.total} total)
          </Text>

          <TouchableOpacity
            onPress={() => setPage((p) => Math.min(pagination.lastPage, p + 1))}
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
When the user changes search or filter values, reset `page` back to `1`. Otherwise they may end up on a page that no longer exists in the new result set.
:::

---

## useModelShow(model, id, options?)

Fetch a single record by ID with optional relationship eager-loading.

```tsx title="src/components/PostDetail.tsx"
const { data: post, isLoading, error } = useModelShow('posts', 42, {
  includes: ['user', 'comments'],
});
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | The model name (e.g., `'posts'`). |
| `id` | `string \| number` | The record ID. The query is disabled when `id` is falsy. |
| `options` | `ModelQueryOptions` | Optional. Supports `includes`, `fields`, `filters`, and `sort`. |

### Return Value

| Property | Type | Description |
|---|---|---|
| `data` | `T \| undefined` | The model record directly -- **not** wrapped in a `data` property. |
| `isLoading` | `boolean` | `true` during the initial fetch. |
| `error` | `Error \| null` | The error object if the request failed. |
| `refetch` | `() => Promise` | Manually re-trigger the query. |

:::warning
Unlike `useModelIndex`, which returns `{ data: T[], pagination }`, `useModelShow` returns the record **directly**. There is no wrapper object.
:::

### Detail Page Example

A component that displays a post with its author and comments:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/PostDetail.tsx"
import { useModelShow } from '@rhino-dev/rhino-react';

function PostDetail({ postId }) {
  const { data: post, isLoading, error } = useModelShow('posts', postId, {
    includes: ['user', 'comments', 'tags'],
  });

  if (isLoading) {
    return <div>Loading post...</div>;
  }

  if (error) {
    return <div>Error loading post: {error.message}</div>;
  }

  if (!post) {
    return <div>Post not found.</div>;
  }

  return (
    <article>
      <header>
        <h1>{post.title}</h1>
        <p>
          By {post.user?.name} | Published{' '}
          {new Date(post.created_at).toLocaleDateString()}
        </p>
        <div>
          {post.tags?.map((tag) => (
            <span key={tag.id}>{tag.name}</span>
          ))}
        </div>
      </header>

      <div dangerouslySetInnerHTML={{ __html: post.body }} />

      <section>
        <h2>Comments ({post.comments?.length || 0})</h2>
        {post.comments?.map((comment) => (
          <div key={comment.id}>
            <strong>{comment.author_name}</strong>
            <p>{comment.body}</p>
            <small>{new Date(comment.created_at).toLocaleDateString()}</small>
          </div>
        ))}
      </section>
    </article>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/PostDetail.tsx"
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useModelShow } from '@rhino-dev/rhino-react';

function PostDetail({ postId }) {
  const { data: post, isLoading, error } = useModelShow('posts', postId, {
    includes: ['user', 'comments', 'tags'],
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Loading post...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>Error loading post: {error.message}</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Post not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      {/* Header */}
      <View>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>{post.title}</Text>
        <Text>
          By {post.user?.name} | Published{' '}
          {new Date(post.created_at).toLocaleDateString()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {post.tags?.map((tag) => (
            <Text key={tag.id}>{tag.name}</Text>
          ))}
        </View>
      </View>

      {/* Body */}
      <Text>{post.body}</Text>

      {/* Comments */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
          Comments ({post.comments?.length || 0})
        </Text>
        {post.comments?.map((comment) => (
          <View key={comment.id} style={{ padding: 12 }}>
            <Text style={{ fontWeight: 'bold' }}>{comment.author_name}</Text>
            <Text>{comment.body}</Text>
            <Text>
              {new Date(comment.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
```

</TabItem>
</Tabs>

:::tip
The query is automatically **disabled** when `id` is falsy (`null`, `undefined`, `0`, `''`). This makes it safe to use in components where the ID may not be available immediately, such as when waiting for route params.
:::

---

## useModelStore(model)

Create a new record via a POST request. Returns a TanStack Query mutation object.

```tsx title="src/components/CreatePostForm.tsx"
const createPost = useModelStore('posts');

createPost.mutate(
  { title: 'New Post', content: 'Hello world!' },
  {
    onSuccess: (newPost) => console.log('Created:', newPost),
    onError: (error) => console.error('Failed:', error),
  }
);
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | The model name (e.g., `'posts'`). |

### Mutation Input

Pass the new record data directly to `mutate()`:

```tsx title="src/components/CreatePostForm.tsx"
createPost.mutate({ title: 'My Post', body: 'Content here', status: 'draft' });
```

### Return Value

| Property | Type | Description |
|---|---|---|
| `mutate(data, options?)` | `function` | Trigger the POST request. Fire-and-forget. |
| `mutateAsync(data, options?)` | `function` | Same as `mutate` but returns a Promise. |
| `isPending` | `boolean` | `true` while the request is in flight. |
| `isSuccess` | `boolean` | `true` after a successful creation. |
| `isError` | `boolean` | `true` if the mutation failed. |
| `error` | `Error \| null` | The error object on failure. |
| `data` | `T \| undefined` | The created record returned by the server. |
| `reset()` | `function` | Reset the mutation state back to idle. |

:::info
On success, `useModelStore` automatically invalidates all `useModelIndex` and `useModelShow` queries for the same model. Your lists refresh without any manual cache management.
:::

### Create Form Example

A full create form with inputs, loading state, error display, and list refresh:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/CreatePostForm.tsx"
import { useState } from 'react';
import { useModelStore, useModelIndex } from '@rhino-dev/rhino-react';

function CreatePostForm() {
  const createPost = useModelStore('posts');
  const { refetch } = useModelIndex('posts');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});

    createPost.mutate(
      { title, body, status: 'draft' },
      {
        onSuccess: (newPost) => {
          // Reset form
          setTitle('');
          setBody('');
          // List auto-refreshes via query invalidation, but you can also
          // call refetch() explicitly if needed
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            // Laravel validation errors
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
        />
        {errors.title && <p style={{ color: 'red' }}>{errors.title[0]}</p>}
      </div>

      <div>
        <label htmlFor="body">Body</label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your post..."
          rows={6}
        />
        {errors.body && <p style={{ color: 'red' }}>{errors.body[0]}</p>}
      </div>

      <button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Creating...' : 'Create Post'}
      </button>

      {createPost.isError && !Object.keys(errors).length && (
        <p style={{ color: 'red' }}>
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/CreatePostForm.tsx"
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useModelStore, useModelIndex } from '@rhino-dev/rhino-react';

function CreatePostForm() {
  const createPost = useModelStore('posts');
  const { refetch } = useModelIndex('posts');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    setErrors({});

    createPost.mutate(
      { title, body, status: 'draft' },
      {
        onSuccess: (newPost) => {
          setTitle('');
          setBody('');
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  return (
    <View style={{ padding: 16 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Post title"
        />
        {errors.title && <Text style={{ color: 'red' }}>{errors.title[0]}</Text>}
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Body</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write your post..."
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        {errors.body && <Text style={{ color: 'red' }}>{errors.body[0]}</Text>}
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={createPost.isPending}
      >
        {createPost.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text>Create Post</Text>
        )}
      </TouchableOpacity>

      {createPost.isError && !Object.keys(errors).length && (
        <Text style={{ color: 'red' }}>
          Something went wrong. Please try again.
        </Text>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

---

## useModelUpdate(model)

Update an existing record via a PUT request. Returns a TanStack Query mutation object.

```tsx title="src/components/EditPostForm.tsx"
const updatePost = useModelUpdate('posts');

updatePost.mutate(
  { id: 42, data: { title: 'Updated Title', status: 'published' } },
  {
    onSuccess: (updated) => console.log('Updated:', updated),
  }
);
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | The model name (e.g., `'posts'`). |

### Mutation Input

Pass an object with `id` and `data`:

```tsx title="src/components/EditPostForm.tsx"
updatePost.mutate({
  id: 42,                                    // The record ID
  data: { title: 'New Title', status: 'published' }, // Fields to update
});
```

| Property | Type | Description |
|---|---|---|
| `id` | `string \| number` | The ID of the record to update. |
| `data` | `Record<string, any>` | The fields to update. Only include changed fields. |

### Return Value

Same mutation shape as `useModelStore` -- see the table above for `mutate`, `isPending`, `isSuccess`, `error`, etc.

:::info
On success, `useModelUpdate` automatically invalidates all `useModelIndex` and `useModelShow` queries for the same model, ensuring your UI stays in sync.
:::

### Edit Form Example

A pre-populated edit form that loads existing data with `useModelShow` and saves with `useModelUpdate`:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/EditPostForm.tsx"
import { useState, useEffect } from 'react';
import { useModelShow, useModelUpdate } from '@rhino-dev/rhino-react';

function EditPostForm({ postId, onSaved }) {
  const { data: post, isLoading: isLoadingPost } = useModelShow('posts', postId);
  const updatePost = useModelUpdate('posts');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('draft');
  const [errors, setErrors] = useState({});

  // Populate form when post data loads
  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setBody(post.body || '');
      setStatus(post.status || 'draft');
    }
  }, [post]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});

    updatePost.mutate(
      { id: postId, data: { title, body, status } },
      {
        onSuccess: (updatedPost) => {
          onSaved?.(updatedPost);
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  if (isLoadingPost) {
    return <div>Loading post...</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title && <p style={{ color: 'red' }}>{errors.title[0]}</p>}
      </div>

      <div>
        <label htmlFor="body">Body</label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
        />
        {errors.body && <p style={{ color: 'red' }}>{errors.body[0]}</p>}
      </div>

      <div>
        <label htmlFor="status">Status</label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <button type="submit" disabled={updatePost.isPending}>
        {updatePost.isPending ? 'Saving...' : 'Save Changes'}
      </button>

      {updatePost.isError && !Object.keys(errors).length && (
        <p style={{ color: 'red' }}>Failed to save. Please try again.</p>
      )}
    </form>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/EditPostForm.tsx"
import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useModelShow, useModelUpdate } from '@rhino-dev/rhino-react';

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
];

function EditPostForm({ postId, onSaved }) {
  const { data: post, isLoading: isLoadingPost } = useModelShow('posts', postId);
  const updatePost = useModelUpdate('posts');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('draft');
  const [errors, setErrors] = useState({});

  // Populate form when post data loads
  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setBody(post.body || '');
      setStatus(post.status || 'draft');
    }
  }, [post]);

  const handleSubmit = () => {
    setErrors({});

    updatePost.mutate(
      { id: postId, data: { title, body, status } },
      {
        onSuccess: (updatedPost) => {
          onSaved?.(updatedPost);
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  if (isLoadingPost) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Loading post...</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
        />
        {errors.title && <Text style={{ color: 'red' }}>{errors.title[0]}</Text>}
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Body</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />
        {errors.body && <Text style={{ color: 'red' }}>{errors.body[0]}</Text>}
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Status</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {STATUS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => setStatus(option.value)}
            >
              <Text>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={updatePost.isPending}
      >
        {updatePost.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text>Save Changes</Text>
        )}
      </TouchableOpacity>

      {updatePost.isError && !Object.keys(errors).length && (
        <Text style={{ color: 'red' }}>Failed to save. Please try again.</Text>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

---

## useModelDelete(model)

Soft delete a record via a DELETE request. Returns a TanStack Query mutation object.

```tsx title="src/components/DeleteButton.tsx"
const deletePost = useModelDelete('posts');

deletePost.mutate(42, {
  onSuccess: () => console.log('Deleted'),
});
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `model` | `string` | The model name (e.g., `'posts'`). |

### Mutation Input

Pass the record ID directly to `mutate()`:

```tsx title="src/components/DeleteButton.tsx"
deletePost.mutate(42);
```

### Return Value

Same mutation shape as `useModelStore` -- see the table above for `mutate`, `isPending`, `isSuccess`, `error`, etc.

:::info
On success, `useModelDelete` automatically invalidates all `useModelIndex` and `useModelShow` queries for the same model.
:::

:::tip
`useModelDelete` performs a **soft delete**. The record is not permanently removed from the database -- it can be restored later using `useModelRestore`. See the [Soft Deletes](./soft-deletes) page for the full trash/restore/force-delete lifecycle.
:::

### Delete Button with Confirmation

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/DeleteButton.tsx"
function DeleteButton({ postId, onDeleted }) {
  const deletePost = useModelDelete('posts');

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to move this post to trash?')) {
      deletePost.mutate(postId, {
        onSuccess: () => {
          onDeleted?.();
        },
      });
    }
  };

  return (
    <button onClick={handleDelete} disabled={deletePost.isPending}>
      {deletePost.isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/DeleteButton.tsx"
import { Alert } from 'react-native';
import { Text, TouchableOpacity, ActivityIndicator } from 'react-native';

function DeleteButton({ postId, onDeleted }) {
  const deletePost = useModelDelete('posts');

  const handleDelete = () => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to move this post to trash?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deletePost.mutate(postId, {
              onSuccess: () => {
                onDeleted?.();
              },
            });
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handleDelete}
      disabled={deletePost.isPending}
    >
      {deletePost.isPending ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text>Delete</Text>
      )}
    </TouchableOpacity>
  );
}
```

</TabItem>
</Tabs>

---

## Error Handling

All mutation hooks (`useModelStore`, `useModelUpdate`, `useModelDelete`) support the standard TanStack Query `onError` callback. The error object from Axios includes the full HTTP response, making it straightforward to handle validation errors, authorization failures, and server errors.

### Handling Validation Errors (422)

Laravel returns validation errors in a predictable format. Each field maps to an array of error messages:

```tsx title="src/utils/errorHandling.ts"
const createPost = useModelStore('posts');

createPost.mutate(data, {
  onError: (error) => {
    if (error.response?.status === 422) {
      const validationErrors = error.response.data.errors;
      // {
      //   title: ['The title field is required.'],
      //   body: ['The body must be at least 10 characters.'],
      // }
      setErrors(validationErrors);
    }
  },
});
```

### Handling Authorization Errors (403)

```tsx title="src/utils/errorHandling.ts"
createPost.mutate(data, {
  onError: (error) => {
    if (error.response?.status === 403) {
      alert('You do not have permission to perform this action.');
    }
  },
});
```

### Handling Not Found Errors (404)

```tsx title="src/utils/errorHandling.ts"
updatePost.mutate({ id: postId, data }, {
  onError: (error) => {
    if (error.response?.status === 404) {
      alert('This record no longer exists.');
    }
  },
});
```

### Comprehensive Error Handler

A reusable pattern for handling all common error types:

```tsx title="src/utils/errorHandling.ts"
function handleMutationError(error, setErrors) {
  const status = error.response?.status;

  switch (status) {
    case 422:
      // Validation errors
      setErrors(error.response.data.errors || {});
      break;
    case 403:
      alert('You are not authorized to perform this action.');
      break;
    case 404:
      alert('The requested resource was not found.');
      break;
    case 500:
      alert('A server error occurred. Please try again later.');
      break;
    default:
      alert('An unexpected error occurred.');
      break;
  }
}

// Usage:
createPost.mutate(data, {
  onError: (error) => handleMutationError(error, setErrors),
});
```

---

## Automatic Cache Invalidation

All mutation hooks automatically invalidate related queries on success. You do not need to manually manage the TanStack Query cache in most cases.

| Hook | Invalidates |
|---|---|
| `useModelStore` | `useModelIndex` + `useModelShow` for the same model |
| `useModelUpdate` | `useModelIndex` + `useModelShow` for the same model |
| `useModelDelete` | `useModelIndex` + `useModelShow` for the same model |

This means that after creating, updating, or deleting a record, any component using `useModelIndex` or `useModelShow` for that model will automatically refetch its data.

---

## Complete CRUD Example

A full `PostsManager` component that combines all five hooks -- listing, creating, editing, deleting, with search and pagination:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/pages/PostsManager.tsx"
import { useState } from 'react';
import {
  useModelIndex,
  useModelShow,
  useModelStore,
  useModelUpdate,
  useModelDelete,
} from '@rhino-dev/rhino-react';

function PostsManager() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ---- List posts ----
  const {
    data: response,
    isLoading,
    error,
  } = useModelIndex('posts', {
    includes: ['user'],
    sort: '-created_at',
    search: search || undefined,
    page,
    perPage: 10,
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (error) {
    return <p>Failed to load posts: {error.message}</p>;
  }

  return (
    <div>
      <h1>Posts</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search posts..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      {/* Create toggle */}
      <button onClick={() => setShowCreateForm(!showCreateForm)}>
        {showCreateForm ? 'Cancel' : 'New Post'}
      </button>

      {/* Create Form */}
      {showCreateForm && (
        <CreateForm
          onCreated={() => {
            setShowCreateForm(false);
          }}
        />
      )}

      {/* Loading */}
      {isLoading && <p>Loading...</p>}

      {/* Posts */}
      {posts.map((post) => (
        <div key={post.id}>
          {editingId === post.id ? (
            <InlineEditRow
              post={post}
              onSaved={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <PostRow
              post={post}
              onEdit={() => setEditingId(post.id)}
            />
          )}
        </div>
      ))}

      {/* Pagination */}
      {pagination && pagination.lastPage > 1 && (
        <nav>
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={pagination.currentPage <= 1}
          >
            Previous
          </button>
          <span>
            Page {pagination.currentPage} of {pagination.lastPage}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

// ---- Post Row (read-only) ----
function PostRow({ post, onEdit }) {
  const deletePost = useModelDelete('posts');

  const handleDelete = () => {
    if (window.confirm(`Move "${post.title}" to trash?`)) {
      deletePost.mutate(post.id);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ flex: 1 }}>
        <strong>{post.title}</strong>
        <small> by {post.user?.name}</small>
      </div>
      <button onClick={onEdit}>Edit</button>
      <button onClick={handleDelete} disabled={deletePost.isPending}>
        {deletePost.isPending ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}

// ---- Inline Edit Row ----
function InlineEditRow({ post, onSaved, onCancel }) {
  const updatePost = useModelUpdate('posts');
  const [title, setTitle] = useState(post.title);

  const handleSave = () => {
    updatePost.mutate(
      { id: post.id, data: { title } },
      { onSuccess: () => onSaved() }
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: 1 }}
      />
      <button onClick={handleSave} disabled={updatePost.isPending}>
        {updatePost.isPending ? 'Saving...' : 'Save'}
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ---- Create Form ----
function CreateForm({ onCreated }) {
  const createPost = useModelStore('posts');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});

    createPost.mutate(
      { title, body, status: 'draft' },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          onCreated?.();
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
        />
        {errors.title && <p style={{ color: 'red' }}>{errors.title[0]}</p>}
      </div>
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Post body"
          rows={4}
        />
        {errors.body && <p style={{ color: 'red' }}>{errors.body[0]}</p>}
      </div>
      <button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/pages/PostsManager.tsx"
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import {
  useModelIndex,
  useModelShow,
  useModelStore,
  useModelUpdate,
  useModelDelete,
} from '@rhino-dev/rhino-react';

function PostsManager() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ---- List posts ----
  const {
    data: response,
    isLoading,
    error,
  } = useModelIndex('posts', {
    includes: ['user'],
    sort: '-created_at',
    search: search || undefined,
    page,
    perPage: 10,
  });

  const posts = response?.data || [];
  const pagination = response?.pagination;

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: 'red' }}>Failed to load posts: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>Posts</Text>

      {/* Search */}
      <TextInput
        placeholder="Search posts..."
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          setPage(1);
        }}
      />

      {/* Create toggle */}
      <TouchableOpacity
        onPress={() => setShowCreateForm(!showCreateForm)}
      >
        <Text>
          {showCreateForm ? 'Cancel' : 'New Post'}
        </Text>
      </TouchableOpacity>

      {/* Create Form */}
      {showCreateForm && (
        <CreateForm
          onCreated={() => {
            setShowCreateForm(false);
          }}
        />
      )}

      {/* Loading */}
      {isLoading && <ActivityIndicator size="large" />}

      {/* Posts */}
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item: post }) => (
          <View>
            {editingId === post.id ? (
              <InlineEditRow
                post={post}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <PostRow
                post={post}
                onEdit={() => setEditingId(post.id)}
              />
            )}
          </View>
        )}
      />

      {/* Pagination */}
      {pagination && pagination.lastPage > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 }}>
          <TouchableOpacity
            onPress={() => setPage((p) => p - 1)}
            disabled={pagination.currentPage <= 1}
          >
            <Text>Previous</Text>
          </TouchableOpacity>
          <Text>
            Page {pagination.currentPage} of {pagination.lastPage}
          </Text>
          <TouchableOpacity
            onPress={() => setPage((p) => p + 1)}
            disabled={pagination.currentPage >= pagination.lastPage}
          >
            <Text>Next</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---- Post Row (read-only) ----
function PostRow({ post, onEdit }) {
  const deletePost = useModelDelete('posts');

  const handleDelete = () => {
    Alert.alert(
      'Confirm Delete',
      `Move "${post.title}" to trash?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePost.mutate(post.id),
        },
      ]
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontWeight: 'bold' }}>{post.title}</Text>
        <Text> by {post.user?.name}</Text>
      </View>
      <TouchableOpacity onPress={onEdit}>
        <Text>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDelete}
        disabled={deletePost.isPending}
      >
        {deletePost.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text>Delete</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---- Inline Edit Row ----
function InlineEditRow({ post, onSaved, onCancel }) {
  const updatePost = useModelUpdate('posts');
  const [title, setTitle] = useState(post.title);

  const handleSave = () => {
    updatePost.mutate(
      { id: post.id, data: { title } },
      { onSuccess: () => onSaved() }
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        style={{ flex: 1 }}
      />
      <TouchableOpacity
        onPress={handleSave}
        disabled={updatePost.isPending}
      >
        {updatePost.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text>Save</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel}>
        <Text>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---- Create Form ----
function CreateForm({ onCreated }) {
  const createPost = useModelStore('posts');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    setErrors({});

    createPost.mutate(
      { title, body, status: 'draft' },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          onCreated?.();
        },
        onError: (error) => {
          if (error.response?.status === 422) {
            setErrors(error.response.data.errors || {});
          }
        },
      }
    );
  };

  return (
    <View style={{ padding: 16, marginBottom: 16 }}>
      <View style={{ marginBottom: 12 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Post title"
        />
        {errors.title && <Text style={{ color: 'red' }}>{errors.title[0]}</Text>}
      </View>
      <View style={{ marginBottom: 12 }}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Post body"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {errors.body && <Text style={{ color: 'red' }}>{errors.body[0]}</Text>}
      </View>
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={createPost.isPending}
      >
        {createPost.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text>Create Post</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
```

</TabItem>
</Tabs>

:::warning
All CRUD hooks require an active organization context. If `useOrganization()` returns `null`, query hooks will return an error state and mutation hooks will throw. Make sure your component tree is wrapped with the proper providers and that the user has selected an organization. See [Authentication](./authentication) for setup details.
:::

---

## Next Steps

- [Querying](./querying) -- deep dive into filters, sorts, search, and pagination
- [Soft Deletes](./soft-deletes) -- trash, restore, and permanent delete hooks
- [Nested Operations](./nested-operations) -- atomic multi-model transactions
- [Authentication](./authentication) -- login, logout, and organization context
