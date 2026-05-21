---
sidebar_position: 6
title: Nested Operations
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nested Operations

Execute multi-model atomic transactions from the client. Create parent and child records in a single request, with automatic rollback if anything fails.

## useNestedOperations()

```tsx title="src/hooks/useNestedOperations.ts"
import { useNestedOperations } from '@rhino-dev/rhino-react';

const nestedOps = useNestedOperations();

nestedOps.mutate({
  operations: [
    { action: 'create', model: 'blogs', data: { title: 'My Blog' } },
    { action: 'create', model: 'posts', data: { title: 'First Post', blog_id: '$0.id' } },
  ],
}, {
  onSuccess: (results) => console.log('All created:', results),
  onError: (error) => console.error('Rolled back:', error),
});
```

**API Request:** `POST /api/{organization}/nested`

## Operation Types

```typescript title="src/types.ts"
interface NestedOperation {
  action: 'create' | 'update' | 'delete';
  model: string;
  id?: string | number;      // Required for update and delete
  data?: Record<string, any>; // Required for create and update
}
```

| Action | Required Fields | Description |
|--------|-----------------|-------------|
| `create` | `model`, `data` | Creates a new record |
| `update` | `model`, `id`, `data` | Updates an existing record |
| `delete` | `model`, `id` | Deletes a record |

## Referencing Previous Results

Use `$N.field` syntax to reference results from earlier operations:

- `$0.id` — the `id` from the first operation (index 0)
- `$1.slug` — the `slug` from the second operation (index 1)
- `$2.name` — the `name` from the third operation (index 2)

This allows creating parent-child relationships in a single request:

```tsx title="src/components/CreateBlogForm.tsx"
nestedOps.mutate({
  operations: [
    // Operation 0: create blog
    {
      action: 'create',
      model: 'blogs',
      data: { title: 'Tech Blog', slug: 'tech-blog' },
    },
    // Operation 1: create post referencing blog
    {
      action: 'create',
      model: 'posts',
      data: {
        title: 'Getting Started',
        blog_id: '$0.id',  // → uses the blog's ID
      },
    },
    // Operation 2: create comment referencing post
    {
      action: 'create',
      model: 'comments',
      data: {
        content: 'Great post!',
        post_id: '$1.id',  // → uses the post's ID
      },
    },
    // Operation 3: update blog using reference
    {
      action: 'update',
      model: 'blogs',
      id: '$0.id',  // → update the blog we just created
      data: { description: 'A blog about technology' },
    },
  ],
});
```

## Atomicity

All operations run inside a database transaction. If **any** operation fails:
- All previous operations are rolled back
- No partial data is left in the database
- The `onError` callback receives the error details

```tsx title="src/components/CreateBlogForm.tsx"
nestedOps.mutate({
  operations: [
    { action: 'create', model: 'blogs', data: { title: 'Blog' } },
    { action: 'create', model: 'posts', data: { blog_id: '$0.id' } }, // ← missing required 'title'
  ],
}, {
  onError: (error) => {
    // The blog was NOT created either — everything rolled back
    if (error.response?.status === 422) {
      console.log('Validation errors:', error.response.data.errors);
      // { "operations.1.data.title": ["The title field is required"] }
    }
  },
});
```

## Complete Examples

### Multi-Step Form Submission

Create a blog with multiple posts in one submit:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/CreateBlogForm.tsx"
import { useState } from 'react';
import { useNestedOperations } from '@rhino-dev/rhino-react';

function CreateBlogForm() {
  const nestedOps = useNestedOperations();
  const [blogTitle, setBlogTitle] = useState('');
  const [posts, setPosts] = useState([{ title: '', content: '' }]);
  const [error, setError] = useState(null);

  const addPost = () => {
    setPosts([...posts, { title: '', content: '' }]);
  };

  const updatePost = (index, field, value) => {
    const updated = [...posts];
    updated[index][field] = value;
    setPosts(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const operations = [
      // First operation: create the blog
      {
        action: 'create',
        model: 'blogs',
        data: { title: blogTitle, slug: blogTitle.toLowerCase().replace(/\s+/g, '-') },
      },
      // Subsequent operations: create posts referencing the blog
      ...posts.map((post) => ({
        action: 'create',
        model: 'posts',
        data: {
          ...post,
          blog_id: '$0.id', // Reference the blog from operation 0
        },
      })),
    ];

    nestedOps.mutate({ operations }, {
      onSuccess: (results) => {
        alert(`Created blog with ${posts.length} posts!`);
        // Reset form
        setBlogTitle('');
        setPosts([{ title: '', content: '' }]);
      },
      onError: (err) => {
        setError(err.response?.data?.errors || 'Something went wrong');
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Blog</h2>

      <input
        value={blogTitle}
        onChange={(e) => setBlogTitle(e.target.value)}
        placeholder="Blog title"
      />

      <h3>Posts</h3>
      {posts.map((post, i) => (
        <div key={i} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
          <input
            value={post.title}
            onChange={(e) => updatePost(i, 'title', e.target.value)}
            placeholder={`Post ${i + 1} title`}
          />
          <textarea
            value={post.content}
            onChange={(e) => updatePost(i, 'content', e.target.value)}
            placeholder="Content"
          />
        </div>
      ))}

      <button type="button" onClick={addPost}>+ Add Post</button>

      {error && <pre style={{ color: 'red' }}>{JSON.stringify(error, null, 2)}</pre>}

      <button type="submit" disabled={nestedOps.isPending}>
        {nestedOps.isPending ? 'Creating...' : 'Create Blog & Posts'}
      </button>
    </form>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/CreateBlogForm.tsx"
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNestedOperations } from '@rhino-dev/rhino-react';

function CreateBlogForm() {
  const nestedOps = useNestedOperations();
  const [blogTitle, setBlogTitle] = useState('');
  const [posts, setPosts] = useState([{ title: '', content: '' }]);
  const [error, setError] = useState(null);

  const addPost = () => {
    setPosts([...posts, { title: '', content: '' }]);
  };

  const updatePost = (index, field, value) => {
    const updated = [...posts];
    updated[index][field] = value;
    setPosts(updated);
  };

  const handleSubmit = () => {
    setError(null);

    const operations = [
      // First operation: create the blog
      {
        action: 'create',
        model: 'blogs',
        data: { title: blogTitle, slug: blogTitle.toLowerCase().replace(/\s+/g, '-') },
      },
      // Subsequent operations: create posts referencing the blog
      ...posts.map((post) => ({
        action: 'create',
        model: 'posts',
        data: {
          ...post,
          blog_id: '$0.id', // Reference the blog from operation 0
        },
      })),
    ];

    nestedOps.mutate({ operations }, {
      onSuccess: (results) => {
        Alert.alert('Success', `Created blog with ${posts.length} posts!`);
        // Reset form
        setBlogTitle('');
        setPosts([{ title: '', content: '' }]);
      },
      onError: (err) => {
        setError(err.response?.data?.errors || 'Something went wrong');
      },
    });
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Create Blog</Text>

      <TextInput
        value={blogTitle}
        onChangeText={setBlogTitle}
        placeholder="Blog title"
      />

      <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Posts</Text>
      {posts.map((post, i) => (
        <View key={i} style={{ marginBottom: 16, padding: 16 }}>
          <TextInput
            value={post.title}
            onChangeText={(text) => updatePost(i, 'title', text)}
            placeholder={`Post ${i + 1} title`}
          />
          <TextInput
            value={post.content}
            onChangeText={(text) => updatePost(i, 'content', text)}
            placeholder="Content"
            multiline
          />
        </View>
      ))}

      <TouchableOpacity onPress={addPost} style={{ marginBottom: 16 }}>
        <Text>+ Add Post</Text>
      </TouchableOpacity>

      {error && (
        <Text style={{ color: 'red' }}>{JSON.stringify(error, null, 2)}</Text>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={nestedOps.isPending}
      >
        <Text>
          {nestedOps.isPending ? 'Creating...' : 'Create Blog & Posts'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

</TabItem>
</Tabs>

### Bulk Update

Update multiple records at once:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/BulkArchive.tsx"
function BulkArchive({ selectedIds }) {
  const nestedOps = useNestedOperations();

  const handleArchive = () => {
    nestedOps.mutate({
      operations: selectedIds.map((id) => ({
        action: 'update',
        model: 'posts',
        id,
        data: { status: 'archived' },
      })),
    }, {
      onSuccess: () => alert(`Archived ${selectedIds.length} posts`),
    });
  };

  return (
    <button onClick={handleArchive} disabled={nestedOps.isPending}>
      {nestedOps.isPending
        ? 'Archiving...'
        : `Archive ${selectedIds.length} Selected`}
    </button>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/BulkArchive.tsx"
import React from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { useNestedOperations } from '@rhino-dev/rhino-react';

function BulkArchive({ selectedIds }) {
  const nestedOps = useNestedOperations();

  const handleArchive = () => {
    nestedOps.mutate({
      operations: selectedIds.map((id) => ({
        action: 'update',
        model: 'posts',
        id,
        data: { status: 'archived' },
      })),
    }, {
      onSuccess: () => Alert.alert('Success', `Archived ${selectedIds.length} posts`),
    });
  };

  return (
    <TouchableOpacity onPress={handleArchive} disabled={nestedOps.isPending}>
      <Text>
        {nestedOps.isPending
          ? 'Archiving...'
          : `Archive ${selectedIds.length} Selected`}
      </Text>
    </TouchableOpacity>
  );
}
```

</TabItem>
</Tabs>

### Mixed Operations

Combine creates, updates, and deletes in one transaction:

```tsx title="src/components/MixedOperations.tsx"
nestedOps.mutate({
  operations: [
    // Create a new category
    { action: 'create', model: 'categories', data: { name: 'New Category' } },
    // Move posts to the new category
    { action: 'update', model: 'posts', id: 1, data: { category_id: '$0.id' } },
    { action: 'update', model: 'posts', id: 2, data: { category_id: '$0.id' } },
    // Delete the old empty category
    { action: 'delete', model: 'categories', id: 5 },
  ],
});
```

:::tip When to Use Nested Operations
Use nested operations when you need:
- **Atomicity** — all-or-nothing, no partial data
- **Cross-references** — child records that need the parent's ID
- **Efficiency** — one HTTP request instead of many
- **Consistency** — avoid race conditions between sequential requests
:::
