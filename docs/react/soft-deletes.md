---
sidebar_position: 5
title: Soft Deletes
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Soft Deletes

Hooks for the full soft-delete lifecycle — list trashed items, restore them, or permanently delete.

## useModelTrashed(model, options?)

Fetch soft-deleted records. Accepts the same query options as `useModelIndex` (filters, sorts, pagination, search, includes).

```tsx title="src/hooks/useModelTrashed.ts"
import { useModelTrashed } from '@rhino-dev/rhino-react';

const { data: response, isLoading } = useModelTrashed('posts', {
  sort: '-deleted_at',
  page: 1,
  perPage: 20,
  includes: ['user'],
});

const trashedPosts = response?.data || [];
const pagination = response?.pagination;
```

**API Request:** `GET /api/{organization}/posts/trashed?sort=-deleted_at&page=1&per_page=20&include=user`

## useModelRestore(model)

Restore a soft-deleted record. Clears the `deleted_at` timestamp and makes the record visible again.

```tsx title="src/hooks/useModelRestore.ts"
import { useModelRestore } from '@rhino-dev/rhino-react';

const restore = useModelRestore('posts');

restore.mutate(postId, {
  onSuccess: (restoredPost) => {
    console.log('Restored:', restoredPost);
    // restoredPost.deleted_at is now null
  },
  onError: (error) => {
    console.error('Restore failed:', error);
  },
});
```

**API Request:** `POST /api/{organization}/posts/{id}/restore`

## useModelForceDelete(model)

Permanently delete a record from the database. This cannot be undone.

```tsx title="src/hooks/useModelForceDelete.ts"
import { useModelForceDelete } from '@rhino-dev/rhino-react';

const forceDelete = useModelForceDelete('posts');

forceDelete.mutate(postId, {
  onSuccess: () => {
    console.log('Permanently deleted');
  },
});
```

**API Request:** `DELETE /api/{organization}/posts/{id}/force-delete`

:::warning Permanent Action
Force delete removes the record from the database entirely. There is no way to recover it. Always use a confirmation dialog.
:::

## Complete Trash Manager Component

A full trash management interface with restore and permanent delete:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/TrashManager.tsx"
import { useState } from 'react';
import {
  useModelTrashed,
  useModelRestore,
  useModelForceDelete,
} from '@rhino-dev/rhino-react';

function TrashManager() {
  const [page, setPage] = useState(1);

  // Fetch trashed posts
  const { data: response, isLoading, refetch } = useModelTrashed('posts', {
    sort: '-deleted_at',
    page,
    perPage: 10,
    includes: ['user'],
  });

  // Mutations
  const restore = useModelRestore('posts');
  const forceDelete = useModelForceDelete('posts');

  const trashedPosts = response?.data || [];
  const pagination = response?.pagination;

  const handleRestore = (id) => {
    restore.mutate(id, {
      onSuccess: () => refetch(),
    });
  };

  const handleForceDelete = (id) => {
    if (window.confirm('Permanently delete this post? This cannot be undone.')) {
      forceDelete.mutate(id, {
        onSuccess: () => refetch(),
      });
    }
  };

  if (isLoading) return <div>Loading trash...</div>;

  return (
    <div>
      <h2>Trash ({pagination?.total || 0} items)</h2>

      {trashedPosts.length === 0 ? (
        <p>Trash is empty.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Deleted By</th>
              <th>Deleted At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {trashedPosts.map((post) => (
              <tr key={post.id}>
                <td>{post.title}</td>
                <td>{post.user?.name}</td>
                <td>{new Date(post.deleted_at).toLocaleDateString()}</td>
                <td>
                  <button
                    onClick={() => handleRestore(post.id)}
                    disabled={restore.isPending}
                  >
                    {restore.isPending ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    onClick={() => handleForceDelete(post.id)}
                    disabled={forceDelete.isPending}
                    style={{ color: 'red', marginLeft: '8px' }}
                  >
                    {forceDelete.isPending ? 'Deleting...' : 'Delete Forever'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {pagination && pagination.lastPage > 1 && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span>
            Page {pagination.currentPage} of {pagination.lastPage}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.lastPage, p + 1))}
            disabled={page >= pagination.lastPage}
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

```tsx title="src/components/TrashManager.tsx"
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import {
  useModelTrashed,
  useModelRestore,
  useModelForceDelete,
} from '@rhino-dev/rhino-react';

function TrashManager() {
  const [page, setPage] = useState(1);

  // Fetch trashed posts
  const { data: response, isLoading, refetch } = useModelTrashed('posts', {
    sort: '-deleted_at',
    page,
    perPage: 10,
    includes: ['user'],
  });

  // Mutations
  const restore = useModelRestore('posts');
  const forceDelete = useModelForceDelete('posts');

  const trashedPosts = response?.data || [];
  const pagination = response?.pagination;

  const handleRestore = (id) => {
    restore.mutate(id, {
      onSuccess: () => refetch(),
    });
  };

  const handleForceDelete = (id) => {
    Alert.alert(
      'Confirm Delete',
      'Permanently delete this post? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            forceDelete.mutate(id, {
              onSuccess: () => refetch(),
            });
          },
        },
      ]
    );
  };

  if (isLoading) return <View><Text>Loading trash...</Text></View>;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Trash ({pagination?.total || 0} items)</Text>

      {trashedPosts.length === 0 ? (
        <Text>Trash is empty.</Text>
      ) : (
        {/* Table Header */}
        <View style={{ flexDirection: 'row' }}>
          <Text style={{ flex: 2, fontWeight: 'bold' }}>Title</Text>
          <Text style={{ flex: 1, fontWeight: 'bold' }}>Deleted By</Text>
          <Text style={{ flex: 1, fontWeight: 'bold' }}>Deleted At</Text>
          <Text style={{ flex: 2, fontWeight: 'bold' }}>Actions</Text>
        </View>

        {/* Table Rows */}
        <FlatList
          data={trashedPosts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item: post }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 2 }}>{post.title}</Text>
              <Text style={{ flex: 1 }}>{post.user?.name}</Text>
              <Text style={{ flex: 1 }}>
                {new Date(post.deleted_at).toLocaleDateString()}
              </Text>
              <View style={{ flex: 2, flexDirection: 'row' }}>
                <TouchableOpacity
                  onPress={() => handleRestore(post.id)}
                  disabled={restore.isPending}
                >
                  <Text>{restore.isPending ? 'Restoring...' : 'Restore'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleForceDelete(post.id)}
                  disabled={forceDelete.isPending}
                  style={{ marginLeft: 8 }}
                >
                  <Text style={{ color: 'red' }}>
                    {forceDelete.isPending ? 'Deleting...' : 'Delete Forever'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.lastPage > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <Text>Previous</Text>
          </TouchableOpacity>
          <Text>
            Page {pagination.currentPage} of {pagination.lastPage}
          </Text>
          <TouchableOpacity
            onPress={() => setPage((p) => Math.min(pagination.lastPage, p + 1))}
            disabled={page >= pagination.lastPage}
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

## Integration with Regular Delete

The regular `useModelDelete` hook performs a soft delete (moves to trash). Combine it with the trash hooks for a complete workflow:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/PostActions.tsx"
import { useModelDelete, useModelTrashed, useModelRestore } from '@rhino-dev/rhino-react';

function PostActions({ post }) {
  const softDelete = useModelDelete('posts');
  const restore = useModelRestore('posts');

  return (
    <div>
      {post.deleted_at ? (
        // Post is in trash — show restore
        <button onClick={() => restore.mutate(post.id)}>
          Restore
        </button>
      ) : (
        // Post is active — show delete
        <button onClick={() => softDelete.mutate(post.id)}>
          Move to Trash
        </button>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/PostActions.tsx"
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useModelDelete, useModelTrashed, useModelRestore } from '@rhino-dev/rhino-react';

function PostActions({ post }) {
  const softDelete = useModelDelete('posts');
  const restore = useModelRestore('posts');

  return (
    <View>
      {post.deleted_at ? (
        // Post is in trash — show restore
        <TouchableOpacity onPress={() => restore.mutate(post.id)}>
          <Text>Restore</Text>
        </TouchableOpacity>
      ) : (
        // Post is active — show delete
        <TouchableOpacity onPress={() => softDelete.mutate(post.id)}>
          <Text>Move to Trash</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

</TabItem>
</Tabs>

:::tip Tab-based Interface
A common pattern is to show active items and trashed items in separate tabs:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/pages/PostsPage.tsx"
function PostsPage() {
  const [tab, setTab] = useState('active');

  return (
    <div>
      <button onClick={() => setTab('active')}>Active</button>
      <button onClick={() => setTab('trash')}>Trash</button>

      {tab === 'active' ? <PostsList /> : <TrashManager />}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/pages/PostsPage.tsx"
import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';

function PostsPage() {
  const [tab, setTab] = useState('active');

  return (
    <View>
      <TouchableOpacity onPress={() => setTab('active')}>
        <Text>Active</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setTab('trash')}>
        <Text>Trash</Text>
      </TouchableOpacity>

      {tab === 'active' ? <PostsList /> : <TrashManager />}
    </View>
  );
}
```

</TabItem>
</Tabs>

:::
