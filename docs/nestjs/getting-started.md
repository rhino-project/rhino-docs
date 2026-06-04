---
sidebar_position: 1
title: Getting Started
---

# NestJS Server -- Getting Started

Install Rhino for NestJS and go from zero to a full REST API in under 5 minutes.

## Requirements

- Node.js 18+
- NestJS v10+ application
- Prisma (`@prisma/client`)
- npm or yarn

## Installation

```bash title="terminal"
npm install @rhino-dev/rhino-nestjs
```

Then run the interactive installer:

```bash title="terminal"
npx rhino install
```

The installer will:

- Publish the `src/rhino.config.ts` configuration helper
- Wire `RhinoModule` into your `AppModule`
- Connect your Prisma client
- Optionally enable multi-tenant support (organizations, roles)
- Optionally enable audit trail (change logging)
- Optionally set up the Claude Code skills

## Configuration

Register `RhinoModule` in your application's root module. The typical setup keeps the config in a helper (`buildRhinoConfig`) and wires it into `AppModule`:

```ts title="src/rhino.config.ts"
import { PrismaClient } from '@prisma/client';
import type { RhinoConfig } from '@rhino-dev/rhino-nestjs';

export function buildRhinoConfig(prisma: PrismaClient): RhinoConfig {
  return {
    // The consuming app's PrismaClient instance
    prismaClient: prisma as any,

    // Model registration -- slug => ModelRegistration ({ model: 'prismaDelegate', ... })
    models: {
      posts:    { model: 'post' },
      comments: { model: 'comment' },
    },

    // Route groups -- control URL prefixes, middleware, and model access
    routeGroups: {
      tenant: {
        prefix: ':organization', // Routes at /api/:organization/{slug}
        models: '*',             // All registered models
      },
    },

    // Multi-tenancy settings
    multiTenant: {
      enabled: true,
      organizationIdentifierColumn: 'slug', // 'id', 'slug', or 'uuid'
      organizationModel: 'organization',
      userOrganizationModel: 'userRole',
    },

    // Authentication
    auth: {
      jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
      jwtExpiresIn: '7d',
      userModel: 'user',
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

## Bootstrap

Call `applyRhinoRouting()` in `main.ts` after creating the Nest application. This registers the generated routes under the `/api` prefix:

```ts title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { applyRhinoRouting } from '@rhino-dev/rhino-nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  applyRhinoRouting(app, { prefix: 'api' });
  await app.listen(3000);
}
bootstrap();
```

## Environment Variables

Add these to your `.env` file as needed:

```env title=".env"
DATABASE_URL="postgresql://user:pass@localhost:5432/app"
JWT_SECRET="change-me-in-production"
```

## Register Your First Model

Rhino models are plain **Prisma** models. Define them in `prisma/schema.prisma` — there is no base class to extend and no decorators to add:

```prisma title="prisma/schema.prisma"
model Post {
  id             Int       @id @default(autoincrement())
  title          String
  content        String?
  status         String    @default("draft")
  userId         Int
  organizationId Int?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  author       User          @relation(fields: [userId], references: [id])
  comments     Comment[]
  organization Organization? @relation(fields: [organizationId], references: [id])

  @@map("posts")
}
```

Register it in `src/rhino.config.ts`. The slug (`posts`) becomes the URL segment and permission prefix; `model` is the Prisma client delegate name (camelCase):

```ts title="src/rhino.config.ts"
import { z } from 'zod';

models: {
  posts: {
    model: 'post',
    softDeletes: true,
    allowedFilters: ['status', 'userId'],
    allowedSorts: ['createdAt', 'title', 'updatedAt'],
    defaultSort: '-createdAt',
    allowedIncludes: ['author', 'comments'],
    allowedSearch: ['title', 'content'],
    validation: z.object({
      title: z.string().max(255),
      content: z.string(),
      status: z.enum(['draft', 'published', 'archived']),
    }),
  },
},
```

:::tip ModelRegistration
The object you pass per slug is a `ModelRegistration`. Every behavior — validation, soft deletes, audit trail, organization scoping, query configuration, policies, scopes — is declared here as plain fields. See [Model Configuration](./models) for the full reference.
:::

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
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/auth/logout` | Log out |
| `POST` | `/api/auth/password/recover` | Send password reset email |
| `POST` | `/api/auth/password/reset` | Reset password with token |
| `POST` | `/api/auth/register` | Register via invitation token |

## Run Migrations

```bash title="terminal"
npx prisma migrate deploy
```

This applies your Prisma migrations, creating the tables for audit logs, invitations, and any model tables you have defined.

## Next Steps

- [Request Lifecycle](./request-lifecycle) -- how requests flow through the pipeline
- [Model Configuration](./models) -- registration fields, relationships, scoping
- [Route Groups](./route-groups) -- multi-tenant, admin, public, and custom route groups
- [Validation](./validation) -- Zod schemas and policy-driven field permissions
- [Querying](./querying) -- filters, sorts, search, pagination, includes
- [Policies](./policies) -- role-based authorization and permissions
