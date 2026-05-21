---
sidebar_position: 1
title: Getting Started
---

# NestJS Server -- Getting Started

Install Rhino for NestJS and go from zero to a full REST API in under 5 minutes.

## Requirements

- Node.js 20+
- NestJS v10+ application
- npm or yarn

## Installation

```bash title="terminal"
npm install @rhino-dev/rhino-nestjs@^4.0
```

Then run the NestJS configure command:

```bash title="terminal"
npx rhino install
```

The configure command will:

- Publish the `src/rhino.config.ts` configuration file
- Register the Rhino service provider
- Set up route bindings and middleware
- Optionally enable multi-tenant support (organizations, roles)
- Optionally enable audit trail (change logging)

## Configuration

Register `RhinoModule` in your application's root module. The typical setup keeps the config in a helper (`buildRhinoConfig`) and wires it into `AppModule`:

```ts title="src/rhino.config.ts"
import type { PrismaClient } from '@prisma/client';
import type { RhinoModuleOptions } from '@rhino-dev/rhino-nestjs';

export function buildRhinoConfig(prisma: PrismaClient): RhinoModuleOptions {
  return {
    prismaClient: prisma,

    // Model registration -- slug => { model: 'prismaDelegate' }
    models: {
      posts:    { model: 'post' },
      comments: { model: 'comment' },
    },

    // Route groups -- controls URL prefixes, middleware, and model access
    routeGroups: {
      default: {
        prefix: '',          // Routes at /api/{slug}
        middleware: [],
        models: '*',         // All registered models
      },
    },

    // Multi-tenancy settings
    multiTenant: {
      organizationIdentifierColumn: 'id',   // 'id', 'slug', or 'uuid'
    },

    // Invitation system
    invitations: {
      expiresDays: 7,
      allowedRoles: null, // null = all roles, or ['admin', 'editor']
    },

    // Nested operations
    nested: {
      path: 'nested',         // Route path
      maxOperations: 50,      // Max ops per request
      allowedModels: null,    // null = all registered models
    },

    // Postman export
    postman: {
      baseUrl: '{{baseUrl}}/api',
      collectionName: 'Rhino API',
    },
  };
}
```

```ts title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import {
  RhinoModule,
  JwtAuthGuard,
  ResponseInterceptor,
} from '@rhino-dev/rhino-nestjs';
import { buildRhinoConfig } from './rhino.config';

const prisma = new PrismaClient();

@Module({
  imports: [
    RhinoModule.forRoot(buildRhinoConfig(prisma), {
      registerControllers: true,
      autoPolicyGuard: true,
      autoRouteGroupMiddleware: true,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
```

`RhinoModule.forRoot()` merges your values with sensible defaults, so you only need to specify properties you want to override. Use `RhinoModule.forRootAsync()` if the config has to be resolved via DI.

## Environment Variables

Add these to your `.env` file as needed:

```env title=".env"
# Invitation expiration (days)
INVITATION_EXPIRES_DAYS=7
```

## Register Your First Model

Create a Prisma model extending `RhinoModel`:

```ts title="app/models/post.ts"
import { DateTime } from 'luxon'
import { column, belongsTo, hasMany } from '@nestjs/lucid/orm'
import type { BelongsTo, HasMany } from '@nestjs/lucid/types/relations'
import vine from '@vinejs/vine'
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import User from '#models/user'
import Comment from '#models/comment'

export default class Post extends RhinoModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column()
  declare status: string

  @column()
  declare userId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // -- Validation (VineJS type schemas) --
  static validationSchema = {
    title: vine.string().maxLength(255),
    content: vine.string(),
    status: vine.enum(['draft', 'published', 'archived']),
  }

  // Field permissions are controlled by the policy.

  // -- Query Configuration --
  static allowedFilters = ['status', 'user_id']
  static allowedSorts = ['created_at', 'title', 'updated_at']
  static defaultSort = '-created_at'
  static allowedIncludes = ['user', 'comments']
  static allowedSearch = ['title', 'content']

  // -- Relationships --
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>
}
```

:::tip RhinoModel
`RhinoModel` extends `BaseModel` and includes `HasRhino`, `HasValidation`, `HidableColumns`, and `HasAutoScope` out of the box. Open the base class to see all available properties with types, defaults, and examples.

For additional features, use `compose()` on top of `RhinoModel`:
```ts
import RhinoModel from '@rhino-dev/rhino-nestjs/models/rhino_model'
import { compose } from '@nestjs/core/helpers'
import { HasAuditTrail } from '@rhino-dev/rhino-nestjs/mixins/has_audit_trail'
import { BelongsToOrganization } from '@rhino-dev/rhino-nestjs/mixins/belongs_to_organization'

export default class Post extends compose(RhinoModel, HasAuditTrail, BelongsToOrganization) {
  // ...
}
```
:::

Register it in `src/rhino.config.ts`:

```ts title="src/rhino.config.ts"
models: {
  posts: () => import('#models/post'),
},
```

That is all you need. You now have a full REST API for posts:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List with filters, sorts, search, pagination |
| `POST` | `/api/posts` | Create with validation |
| `GET` | `/api/posts/:id` | Show single record with relationships |
| `PUT` | `/api/posts/:id` | Update with validation |
| `DELETE` | `/api/posts/:id` | Soft delete |
| `GET` | `/api/posts/trashed` | List soft-deleted records |
| `POST` | `/api/posts/:id/restore` | Restore soft-deleted record |
| `DELETE` | `/api/posts/:id/force-delete` | Permanent delete |

:::tip Multi-Tenant Routes
When using a `tenant` route group with a parameterized prefix, all tenant routes are prefixed with `:organization`:

```
GET /api/:organization/posts
POST /api/:organization/posts
```

See [Route Groups](./route-groups) for configuration details.
:::

## Authentication Endpoints

Rhino also provides auth routes out of the box:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login, returns API token |
| `POST` | `/api/auth/logout` | Revoke all tokens |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

## Run Migrations

```bash title="terminal"
npx prisma migrate deploy
```

This will create the necessary tables for audit logs, invitations, and any model tables you have defined.

## Next Steps

- [Request Lifecycle](./request-lifecycle) -- how requests flow through the pipeline
- [Model Configuration](./models) -- mixins, properties, relationships
- [Route Groups](./route-groups) -- multi-tenant, admin, public, and custom route groups
- [Validation](./validation) -- VineJS schemas and policy-driven field permissions
- [Querying](./querying) -- filters, sorts, search, pagination, includes
- [Policies](./policies) -- role-based authorization and permissions
