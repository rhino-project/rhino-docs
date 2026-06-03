---
sidebar_position: 0
title: Introduction
slug: /intro
---

# What is Rhino?

Rhino is a full-stack library that turns your models into a complete REST API — with React hooks to consume it. No boilerplate controllers, no manual route definitions, no hand-written fetch calls. Available for **Laravel**, **Ruby on Rails**, and **NestJS**.

**Register a model. Get an API. Use a hook.**

## Pick your stack

Jump straight to the docs for your framework:

<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem', marginBottom: '2rem'}}>

<div style={{border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: '8px', padding: '1.25rem'}}>

### Laravel

Eloquent models, policies, validation, multi-tenancy.

**[Get started →](./server/getting-started.md)**

</div>

<div style={{border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: '8px', padding: '1.25rem'}}>

### Rails

ActiveRecord, Pundit policies, the same powerful features.

**[Get started →](./rails/getting-started.md)**

</div>

<div style={{border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: '8px', padding: '1.25rem'}}>

### NestJS

TypeScript, Prisma, decorators, dependency injection.

**[Get started →](./nestjs/getting-started.md)**

</div>

<div style={{border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: '8px', padding: '1.25rem'}}>

### React Client

Hooks for auth, CRUD, pagination, includes.

**[Get started →](./react/getting-started.md)**

</div>

</div>

Or keep reading for the architecture overview and a Hello World example.

## How It Works

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   React / React Native  │  HTTP   │  Laravel, Rails, or     │
│                         │◄───────►│  NestJS Server        │
│  useModelIndex('posts') │         │                          │
│  useModelStore('posts') │         │  Register a model        │
│  useModelUpdate('posts')│         │                          │
│  useModelDelete('posts')│         │  Automatic CRUD routes   │
│  useAuth()              │         │  Validation, Policies    │
└─────────────────────────┘         └──────────────────────────┘
    @rhino-dev/rhino-react              rhino-project/rhino-laravel (Laravel)
                                  rhino-rails (Ruby on Rails)
                                  @rhino-dev/rhino-nestjs (NestJS)
```

## Features

- **Automatic REST API** — register a model, get full CRUD endpoints with zero controllers
- **React Hooks** — TanStack Query hooks for every endpoint (index, show, store, update, delete)
- **Role-Based Permissions** — per-organization roles with wildcard support (`posts.*`, `*`)
- **Role-Based Validation** — different fields allowed per role (admin vs editor vs viewer)
- **Multi-Tenancy** — built-in organization scoping via URL prefix or subdomain
- **Soft Deletes** — trash, restore, and force-delete with separate permissions
- **Audit Trail** — automatic change logging (who changed what, when)
- **Nested Operations** — atomic multi-model transactions with cross-references
- **Invitation System** — invite users to organizations with role assignment
- **Blueprint Generator** — define permissions in YAML, generate fully working policies, tests, and seeders deterministically
- **Query Builder** — filters, sorts, search, pagination, includes, field selection
- **React Native Support** — same hooks with platform-adapted storage and networking

## Quick Install

### Server (Laravel)

```bash title="terminal"
composer require rhino-project/rhino-laravel:^4.0
php artisan rhino:install
```

### Server (Ruby on Rails)

```bash title="terminal"
bundle add rhino-rails -v "~> 4.0"
rails rhino:install
```

### Server (NestJS)

```bash title="terminal"
npm install @rhino-dev/rhino-nestjs@^4.0
npx rhino install
```

### Client (React)

```bash title="terminal"
npm install @rhino-dev/rhino-react@^4.0 @tanstack/react-query axios
```

## Hello World Example

### 1. Register a model on the server

**Laravel:**

```php title="config/rhino.php"
return [
    'models' => [
        'posts' => \App\Models\Post::class,
    ],
];
```

**Ruby on Rails:**

```ruby title="config/initializers/rhino.rb"
Rhino.configure do |c|
  c.model :posts, 'Post'
end
```

**Node.js (NestJS):**

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RhinoModule } from '@rhino-dev/rhino-nestjs';

const prisma = new PrismaClient();

@Module({
  imports: [
    RhinoModule.forRoot({
      prismaClient: prisma,
      models: {
        posts: { model: 'post' },
      },
    }),
  ],
})
export class AppModule {}
```

This automatically creates these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/{id}` | Show single record |
| `PUT` | `/api/posts/{id}` | Update with validation |
| `DELETE` | `/api/posts/{id}` | Soft delete |

### 2. Use it from React

```tsx title="src/components/Posts.tsx"
import { useModelIndex, useModelStore } from '@rhino-dev/rhino-react';

function Posts() {
  // Fetch posts with pagination and sorting
  const { data: response, isLoading } = useModelIndex('posts', {
    page: 1,
    perPage: 10,
    sort: '-created_at',
  });

  // Create a new post
  const createPost = useModelStore('posts');

  const handleCreate = () => {
    createPost.mutate({ title: 'My First Post', content: 'Hello world!' });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <button onClick={handleCreate}>New Post</button>
      {response?.data.map(post => (
        <h2 key={post.id}>{post.title}</h2>
      ))}
    </div>
  );
}
```

