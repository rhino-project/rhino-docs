---
sidebar_position: 9
title: Custom Controllers
---

# Custom Controllers

Rhino auto-generates a full CRUD surface for every registered model — `index`, `show`, `store`, `update`, `destroy`, and the soft-delete routes — with zero controller code. That covers most of an API, but real apps always need logic beyond CRUD: a dashboard that aggregates across resources, a report that groups and counts, a computed summary, a bulk operation. Those live in a **custom controller** you write yourself.

The moment you leave the generated controller, you also leave everything Rhino was doing for you on every query — organization scoping, policies, and global scopes. The `ResourceScopeService` gives that back: a tenant-safe base query, composed exactly the way CRUD composes it, that you build your aggregations on top of.

## Why This Matters

CRUD is tenant-safe because Rhino applies organization scoping, policies, and global scopes to every query in **one place** — `ResourceService`. You never think about tenant isolation for a generated endpoint because you can't accidentally skip it.

A hand-written controller has none of that. If you reach for the Prisma client directly (or raw SQL) in a dashboard, **you** are now responsible for re-applying tenant isolation to **every model you touch** — and it is dangerously easy to leak across tenants. The trap is worst for a model scoped through a relationship (no `organizationId` column of its own): the correct filter is a nested relation condition that is easy to forget and easy to get subtly wrong.

Concretely, the framework's org scope is driven by the request context. Outside a request that context is absent, so a naive query **fails open** — it happily returns every tenant's rows:

```ts title="dashboard.controller.ts — LEAKS across tenants"
// BAD: raw Prisma, no org scoping. Returns EVERY organization's tasks.
const openTasks = await this.prisma.task.count({
  where: { status: 'open' },
});
```

The resolver gives you the **same** tenant-safe base query Rhino uses for CRUD, so a custom controller stays isolated by construction:

```ts title="dashboard.controller.ts — tenant-safe"
// GOOD: scoped to req.organization, same composition as CRUD.
const openTasks = await this.scope.count('task', ctx, { status: 'open' });
```

Same three lines of intent — but the second one cannot leak, because the scoped `where` (org filter + global scopes) is injected for you and cannot be dropped.

## The Resolver

Inject `ResourceScopeService` and pass a `ResourceContext` (`{ user, organization }`) to every call. In NestJS the context is always **explicit** — there is no ambient request-bound resolver — so you build `ctx` from the request in a controller, or construct it by hand in a job.

```ts title="src/dashboard/dashboard.controller.ts"
import { Controller, Get, Req } from '@nestjs/common';
import { ResourceScopeService, type ResourceContext } from '@rhino-dev/rhino-nestjs';

@Controller(':organization/dashboard')
export class DashboardController {
  constructor(private readonly scope: ResourceScopeService) {}

  @Get()
  async index(@Req() req: any) {
    // req.user and req.organization are set by the auth guard + ResolveOrganizationMiddleware
    const ctx: ResourceContext = { user: req.user, organization: req.organization };

    return {
      projects: await this.scope.count('project', ctx),
      tasks: await this.scope.count('task', ctx),
    };
  }
}
```

Register it like any normal NestJS `@Controller` and inject `ResourceScopeService`. Reference models by their **slug** as registered in `src/rhino.config.ts` (e.g. `'task'`, `'project'`).

### Building on the base query

`scopedWhere(modelSlug, ctx)` returns the composed Prisma `where` — org isolation plus any always-on global `scopes` — so you can build any Prisma call on top of it:

```ts
const where = this.scope.scopedWhere('task', ctx);

// `prisma` is your PrismaService (or the delegate via scope.delegate('task'))
const overdue = await prisma.task.count({
  where: { AND: [where, { dueAt: { lt: new Date() } }] },
});
```

Prefer the convenience helpers below when they fit — they inject the scoped `where` for you so it can never be forgotten:

| Helper | Returns | Notes |
|--------|---------|-------|
| `scope.scopedWhere(slug, ctx, { namedScope? })` | `Record<string, any>` | The composed tenant-safe `where`. |
| `scope.count(slug, ctx, extraWhere?)` | `Promise<number>` | `extraWhere` AND-ed under the scoped where. |
| `scope.findMany(slug, ctx, args?)` | `Promise<any[]>` | Scoped where AND-ed into `args.where`. |
| `scope.aggregate(slug, ctx, args)` | `Promise<any>` | Scoped where AND-ed into `args.where`. |
| `scope.groupBy(slug, ctx, args)` | `Promise<any>` | Scoped where AND-ed into `args.where`. |

Any `extraWhere` / `args.where` you pass is **AND-ed under** the scoped where, so the scoped constraints can never be overwritten or dropped.

:::tip
Reach for the helpers first. They exist precisely so a caller cannot bypass the scope — the tenant filter is composed in one place and injected, exactly like CRUD.
:::

## Explicit Mode

There is no request in a queue worker, a scheduled task, a console command, or a test — so there is no `req.organization` to read. Build the context by hand and pass it. The org scope then comes from the organization you pass, not from a route:

```ts title="src/jobs/nightly-digest.job.ts"
import { Injectable } from '@nestjs/common';
import { ResourceScopeService, type ResourceContext } from '@rhino-dev/rhino-nestjs';

@Injectable()
export class NightlyDigestJob {
  constructor(private readonly scope: ResourceScopeService) {}

  async run(organization: any, user: any) {
    const ctx: ResourceContext = { user, organization };
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Helper form — the scoped where is injected for you, so both calls stay
    // isolated to `organization` even though there is no request.
    const stale = await this.scope.findMany('task', ctx, {
      where: { updatedAt: { lt: cutoff } },
    });
    const openCount = await this.scope.count('task', ctx, { status: 'open' });

    return { stale, openCount };
  }
}
```

The API is identical to a controller — the only difference is where `ctx.organization` comes from. In a request it comes from the middleware; in a job you pass it in explicitly.

## Fail Closed

The resolver **never** returns an unscoped query for a tenant-owned model. Call it for a model with `belongsToOrganization: true` and no `ctx.organization`, and it **throws** a `RhinoException` (`403`, code `TENANT_CONTEXT_REQUIRED`) rather than silently returning every tenant's rows:

```ts
// project has belongsToOrganization: true
this.scope.count('project', { user }); // no organization
// → throws RhinoException 403 TENANT_CONTEXT_REQUIRED
```

This is the exact **opposite** of a raw model query, which fails *open* outside a request: `prisma.project.count()` with no `where` returns every organization's rows and never complains. The resolver turns a silent cross-tenant leak into a loud, catchable error at the call site.

:::warning
A missing organization in a background job is a bug, not an empty result. The resolver surfaces it as a `403 TENANT_CONTEXT_REQUIRED` instead of quietly returning cross-tenant data. Always pass a real `organization` in explicit mode.
:::

Global (non-tenant) models are unaffected — a model with no `belongsToOrganization` and no org relationship has nothing to scope, so the resolver returns its query without requiring an organization.

## Worked Example: A Tenant-Safe Dashboard

A dashboard that aggregates across two resources — `project` and `task` — scoped to the current tenant. Every read goes through the resolver, so nothing can leak across organizations:

```ts title="src/dashboard/dashboard.controller.ts"
import { Controller, Get, Req } from '@nestjs/common';
import { ResourceScopeService, type ResourceContext } from '@rhino-dev/rhino-nestjs';

@Controller(':organization/dashboard')
export class DashboardController {
  constructor(private readonly scope: ResourceScopeService) {}

  @Get()
  async index(@Req() req: any) {
    const ctx: ResourceContext = { user: req.user, organization: req.organization };

    // Totals — scoped where injected by the helpers
    const [totalProjects, totalTasks, openTasks] = await Promise.all([
      this.scope.count('project', ctx),
      this.scope.count('task', ctx),
      this.scope.count('task', ctx, { status: 'open' }),
    ]);

    // Group tasks by status for this tenant
    const byStatus = await this.scope.groupBy('task', ctx, {
      by: ['status'],
      _count: { _all: true },
    });

    return {
      projects: { total: totalProjects },
      tasks: {
        total: totalTasks,
        open: openTasks,
        byStatus: byStatus.map((row: any) => ({
          status: row.status,
          count: row._count._all,
        })),
      },
    };
  }
}
```

Every count, aggregate, and group-by is filtered to `req.organization` by construction. Add a second organization's data and this endpoint's numbers never move — you did not write a single `organizationId` filter, and you cannot forget one.

## Best Practices

- **Always go through the resolver.** Never write a raw `prisma.<model>` query or raw SQL against a tenant-owned model in a custom controller. If you need something the helpers don't cover, start from `scopedWhere()` and AND your extra conditions under it — never replace it.

- **Gate each resource with its policy.** The resolver scopes **rows** (which records the tenant can see); a policy authorizes **access** (whether this user may see them at all). They are complementary — check both. Authorize each resource the dashboard reads:

  ```ts
  import { ForbiddenException } from '@nestjs/common';
  import { ProjectPolicy, TaskPolicy } from '../policies';

  @Get()
  async index(@Req() req: any) {
    const ctx: ResourceContext = { user: req.user, organization: req.organization };

    if (!new ProjectPolicy().viewAny(ctx.user, ctx.organization)) {
      throw new ForbiddenException();
    }
    if (!new TaskPolicy().viewAny(ctx.user, ctx.organization)) {
      throw new ForbiddenException();
    }

    // ...aggregate with this.scope.* as above
  }
  ```

  You can also check a permission directly with `userHasPermission(user, 'task.index', organization)` — see [Policies](./policies).

- **Offload expensive work to a cached service.** A dashboard that runs a dozen aggregations on every request gets slow fast. Push heavy or external work (multi-model roll-ups, third-party calls) into a service that caches its result, so the per-request path stays cheap — but keep every underlying query going through the resolver so the cached values are still tenant-scoped.

## Related

- [Multi-Tenancy](./multi-tenancy) — how `belongsToOrganization` scoping, the `owner` chain, and `ResolveOrganizationMiddleware` work.
- [Policies](./policies) — the `ResourcePolicy` base class and the permission checks you gate custom actions with.
- [Querying](./querying) — filters, sorts, search, and pagination on the generated CRUD endpoints.
