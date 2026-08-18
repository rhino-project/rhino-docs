---
sidebar_position: 8
title: Custom Controllers
---

# Custom Controllers

Rhino auto-generates a complete, tenant-safe CRUD API for every model you register — index, show, store, update, destroy, plus soft-delete and audit endpoints. That covers most of what an app needs.

:::warning First check whether you need a controller at all
Counts, sums and other **aggregates over one resource** do **not** need a controller — that is what [Computed Attributes](./computed-attributes) are for. `GET /api/tickets/computed?attributes=open_tickets_count` is org-scoped, policy-filtered, and narrowed by the same `?filter[]`/`?search=`/`?scope=` as the listing, all for a few lines on the model. Reach for a controller when the shape genuinely isn't "attributes of one resource" — cross-model reports, non-CRUD workflows, bulk operations.
:::

But real apps eventually need logic that isn't CRUD: a dashboard that aggregates across several resources, a report that groups and sums, a computed summary, a bulk operation. None of that fits the generated endpoints, so you reach for a **custom controller** — a plain Rails controller you write by hand.

The moment you do, you leave the safety of the generated pipeline. This page is about writing that controller so it stays as tenant-isolated as the CRUD Rhino gives you for free — using the `Rhino.query` resolver.

## Why This Matters

CRUD is tenant-safe because Rhino applies organization scoping, policies, and global scopes to **every query in one place**. When you hit `GET /api/acme-corp/posts`, the framework resolves the organization from the request, applies the `BelongsToOrganization` scope, runs `HasAutoScope`, and authorizes through the policy — for you, on every request, without you writing a line of it.

A hand-written controller bypasses all of that. If you write a raw model query in a dashboard, **you** become responsible for re-applying tenant isolation to every model you touch. And it is dangerously easy to leak across tenants:

```ruby title="app/controllers/dashboard_controller.rb"
# WRONG — raw query, no tenant scoping
class DashboardController < ApplicationController
  def show
    # Returns EVERY organization's tasks. Cross-tenant leak.
    @open_tasks = Task.where(status: 'open').count
  end
end
```

It gets worse for a model scoped through a **relationship** (`Task → Project → Organization`, no `organization_id` column of its own). There's no column to remember to filter on — the scoping lives in the framework's walk of the `belongs_to` chain, which a raw query skips entirely.

:::danger Outside a request, the org scope fails OPEN
`BelongsToOrganization` reads the current organization from `RequestStore`. In a job, a rake task, or a console — where there is no request — that context is empty, so `Task.all` returns **every tenant's rows**. A raw query that looks fine in a controller becomes a full cross-tenant dump the moment it runs anywhere without a request.
:::

The resolver gives you the **same tenant-safe base query Rhino uses for CRUD**. Build your aggregations on top of it and the custom controller stays isolated by construction:

```ruby title="app/controllers/dashboard_controller.rb"
# CORRECT — resolver returns an org-scoped relation
@open_tasks = Rhino.query(Task).where(status: 'open').count
```

Same query shape, one difference: `Rhino.query(Task)` is already scoped to the current tenant (and refuses to run without one). That's the whole point of the resolver.

## The Resolver — Direct Mode

`Rhino.query(model_class)` returns an `ActiveRecord::Relation` that is **already organization-scoped**, using the org and user resolved from the current request (via `RequestStore`). This is the ambient form — use it inside a tenant request, where a controller `before_action` has already installed the context.

```ruby title="app/controllers/reports_controller.rb"
class ReportsController < ApplicationController
  def show
    # Already scoped to the request's organization.
    tasks = Rhino.query(Task)

    render json: {
      total:     tasks.count,
      completed: tasks.where(status: 'done').count,
      overdue:   tasks.where('due_date < ?', Date.current).count,
    }
  end
end
```

Because it returns a plain relation, you build on it with the full ActiveRecord API — `where`, `group`, `joins`, `sum`, `count`, and so on. Everything you chain runs **inside** the tenant boundary.

To layer a whitelisted named scope on top, use `Rhino.scoped_query`:

```ruby title="app/controllers/reports_controller.rb"
# Org-scoped base query + the model's "availableForDrivers" named scope
routes = Rhino.scoped_query(Route, 'availableForDrivers')
```

The scope name is the wire name (camelCase accepted, same as `?scope=`); pass `nil` to fall back to the model's `rhino_default_scope`. See [Querying → Named Scopes](./querying.md#named-scopes) for how scopes are declared and whitelisted.

## Explicit Mode

Direct mode depends on a request having populated the context. In a **background job, a rake task, a scheduled task, a console session, or a test**, there is no request — so you pass the user and organization explicitly. Here the org scope comes from the org you pass, not from a route.

Chain `Rhino.for_user(user).in_organization(org)`, then call `query` (or `scoped_query`) exactly as in direct mode:

```ruby title="app/jobs/tenant_digest_job.rb"
class TenantDigestJob < ApplicationJob
  def perform(user_id, organization_id)
    user = User.find(user_id)
    org  = Organization.find(organization_id)

    overdue = Rhino.for_user(user)
                   .in_organization(org)
                   .query(Task)
                   .where('due_date < ?', Date.current)
                   .count

    DigestMailer.overdue(user, overdue).deliver_later
  end
end
```

If you need several queries under the same context, use the `run` block form. The user and org are installed into `RequestStore` for the duration of the block and restored afterward, so any `Rhino.query` inside sees them:

```ruby title="app/jobs/tenant_digest_job.rb"
Rhino.for_user(user).in_organization(org).run do
  overdue   = Rhino.query(Task).where('due_date < ?', Date.current).count
  completed = Rhino.query(Task).where(status: 'done').count
  # ...
end
```

The context is fully isolated: it is snapshotted, installed, and restored on the way out — there is no stickiness. A later `Rhino.query` with no context still fails closed (see below).

## Fail Closed

The resolver **never** returns an unscoped query for a tenant-owned model. If you call `Rhino.query(Task)` for an org-scopable model with no organization context available, it raises `Rhino::MissingTenantContext` rather than silently returning every tenant's rows:

```ruby
# No request, no explicit org → raises, does NOT dump all tenants
Rhino.query(Task)
# => Rhino::MissingTenantContext: Task
```

This is the **opposite** of a raw model query. `Task.all` outside a request fails *open* — it returns every organization's rows because the `RequestStore` org context is empty. `Rhino.query(Task)` fails *closed* — no context means an exception, never a leak. That guarantee is exactly why you route custom-controller queries through the resolver instead of the model.

:::note
The fail-closed check only applies to organization-scopable models (those including `Rhino::BelongsToOrganization`, directly or through a relationship). A model that isn't tenant-owned has nothing to scope, so `Rhino.query` returns its relation unchanged.
:::

## Worked Example: A Tenant-Safe Dashboard

Here is a realistic dashboard controller that aggregates across two resources — projects and tasks — and stays scoped to the current tenant by construction. Every query goes through `Rhino.query`, so both resources are isolated to the request's organization:

```ruby title="app/controllers/dashboard_controller.rb"
class DashboardController < ApplicationController
  # A `before_action` that renders halts the request, so the action never runs
  # for an unauthorized user.
  before_action :authorize_dashboard!

  def show
    projects = Rhino.query(Project)
    tasks    = Rhino.query(Task)

    render json: {
      projects: {
        total:    projects.count,
        archived: projects.where(status: 'archived').count,
      },
      tasks: {
        total:        tasks.count,
        overdue:      tasks.where('due_date < ?', Date.current).count,
        by_status:    tasks.group(:status).count,
        by_priority:  tasks.group(:priority).count,
      },
    }
  end

  private

  def authorize_dashboard!
    user = Rhino.context.user

    # Gate each resource with its policy — the resolver scopes ROWS,
    # policies authorize ACCESS.
    unless ProjectPolicy.new(user, Project).index? &&
           TaskPolicy.new(user, Task).index?
      render json: { message: 'This action is unauthorized.' }, status: :forbidden
    end
  end
end
```

`tasks.group(:status).count` returns a hash like `{ 'todo' => 12, 'in_progress' => 5, 'done' => 40 }` — a group-by-status summary that only ever counts the current tenant's tasks, because `tasks` is `Rhino.query(Task)`. `Rhino.context.user` and `Rhino.context.organization` expose the current request's user and organization when you need them (for example, to gate access).

Wire it up with a normal Rails route inside your tenant scope:

```ruby title="config/routes.rb"
scope 'api/:organization' do
  get 'dashboard', to: 'dashboard#show'
end
```

## Best Practices

- **Always go through the resolver.** Never write a raw model query (`Task.where(...)`) or raw SQL in a custom controller. `Rhino.query` / `Rhino.scoped_query` are the only forms that carry tenant isolation — and fail closed if it's missing.

- **Gate each resource with its policy.** The resolver scopes **rows** (which records exist for this tenant); a policy authorizes **access** (whether this user may read them at all). They are separate checks. Run a per-resource `authorize` / `allows?`-style check for every resource a custom endpoint touches:

  ```ruby
  user = Rhino.context.user
  head :forbidden unless TaskPolicy.new(user, Task).index?

  tasks = Rhino.query(Task)
  ```

- **Offload expensive or external work to a cached service.** Heavy aggregations, third-party calls, and slow reports don't belong in the per-request path. Compute them in a service and cache the result so the controller stays cheap:

  ```ruby
  stats = Rails.cache.fetch(["dashboard", Rhino.context.organization&.id], expires_in: 5.minutes) do
    DashboardStats.new.call   # uses Rhino.query internally
  end
  ```

## Related

- [Multi-Tenancy](./multi-tenancy.md) — how organization scoping, `BelongsToOrganization`, and nested ownership work.
- [Policies & Permissions](./policies.md) — the policy layer you gate each custom endpoint with.
- [Querying](./querying.md) — filters, sorts, includes, and the named scopes `Rhino.scoped_query` applies.
