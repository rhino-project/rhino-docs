---
sidebar_position: 3
title: "Authorization"
---

# Authorization

Authorization in Rhino is **declarative and centralized**: every CRUD action, every field, and every include is gated by a policy that resolves the caller's role in the current organization. Your job is to write policies that describe *who may do what* — not to sprinkle `if ($role === 'admin')` checks through controllers where they drift out of sync and leak across route groups.

This page shows how the Helpdesk app authorizes tickets and comments. See [Policies](../policies) for the full API and [Tenant Safety](./tenant-safety) for the *which records* layer that runs alongside these *which actions / which fields* checks. Back to the [best-practices hub](./).

:::note The two questions
The [Scope layer](../request-lifecycle#3-scope-layer) answers **"which records is this user allowed to touch?"** (tenant isolation). Policies answer **"which *actions* and which *fields*?"** They are independent gates and both must pass. Never use one to do the other's job.
:::

## Principle: authorization lives in a Policy, never in a controller

Rhino resolves the policy for each model by Laravel convention (`Ticket` → `App\Policies\TicketPolicy`) and calls the matching method *before* the action runs — see the [Policy layer](../request-lifecycle#2-policy-layer) of the request lifecycle. The base `ResourcePolicy` already maps every action to a permission check. Extend it; don't reinvent it.

```php title="app/Http/Controllers/TicketController.php"
// ❌ Bad — role logic scattered in a hand-written controller, unreachable by Rhino's pipeline
public function update(Request $request, Ticket $ticket)
{
    $role = $request->input('role');           // client-sent, see below — never trust this
    if ($role !== 'admin' && $role !== 'agent') {
        abort(403);
    }
    $ticket->update($request->all());          // no attribute gating, no include auth
    return $ticket;
}
```

```php title="app/Policies/TicketPolicy.php"
// ✅ Good — one policy; Rhino invokes it automatically for every Ticket route in every group
<?php

namespace App\Policies;

use Rhino\LaravelApi\Policies\ResourcePolicy;

class TicketPolicy extends ResourcePolicy
{
    // Resolves to the 'tickets' slug automatically; only set it to override.
    protected $resourceSlug = 'tickets';
}
```

That empty class is a complete policy. `ResourcePolicy::update()` already checks `tickets.update`, `create()` checks `tickets.store`, and so on. You write code only to *narrow* the defaults.

| API Action | Policy Method | Permission Checked |
|---|---|---|
| `GET /tickets` (index) | `viewAny()` | `tickets.index` |
| `GET /tickets/{id}` (show) | `view()` | `tickets.show` |
| `POST /tickets` (store) | `create()` | `tickets.store` |
| `PUT /tickets/{id}` (update) | `update()` | `tickets.update` |
| `DELETE /tickets/{id}` (destroy) | `delete()` | `tickets.destroy` |
| `GET /tickets/trashed` | `viewTrashed()` | `tickets.trashed` |
| `POST /tickets/{id}/restore` | `restore()` | `tickets.restore` |
| `DELETE /tickets/{id}/force-delete` | `forceDelete()` | `tickets.forceDelete` |

## Principle: never trust a client-sent role — resolve it from Membership

A role is a **server-side fact** about the caller's `Membership` in the current organization, not a value in the request body. Rhino's `hasPermission()` already resolves the caller's org-scoped permissions for you; inside a policy, the `hasRole()` helper checks the caller's role *in the current request's organization*. Use them — never read a role off the payload.

```php title="app/Policies/TicketPolicy.php"
// ❌ Bad — trusting a role the client put in the request; anyone can send "role":"admin"
public function forceDelete(?Authenticatable $user, $ticket): bool
{
    return request('role') === 'admin';
}
```

```php title="app/Policies/TicketPolicy.php"
// ✅ Good — role resolved server-side from the caller's Membership in this org.
// force-delete is the one destructive action Helpdesk narrows to admin: agents can
// soft-delete and restore, but never permanently erase (see the role table below).
use Illuminate\Contracts\Auth\Authenticatable;

public function forceDelete(?Authenticatable $user, $ticket): bool
{
    // Superadmin bypass, then the base permission check (tickets.forceDelete).
    if ($user->hasPermission('*')) {
        return true;
    }

    return parent::forceDelete($user, $ticket) && $this->hasRole($user, 'admin');
}
```

`hasRole($user, 'admin')` and `hasPermission('tickets.forceDelete', $org)` both read from the org-scoped permission source — `user_roles` layered with `org_role_permissions` — resolved from the request's organization context. There is no way for the client to spoof it.

:::warning Always call `parent::`
Overriding a policy method without calling `parent::method()` **bypasses the permission system** for that action. Add your extra condition on top of the parent check (`parent::delete(...) && $yourCondition`), never in place of it.
:::

## Principle: model the three roles as permission sets, not code branches

The Helpdesk `Membership.role` is one of `admin`, `agent`, `viewer` per organization. Encode what each role can *do* as a permission set on the role layer, so adding a member is a one-line grant and a new ability doesn't mean touching every user row. This is the [layered permission model](../policies#layered-permissions): `effective = (role ∪ granted) − denied`, deny always wins.

```php title="database/seeders/RoleSeeder.php"
// ✅ Good — define each Helpdesk role's abilities ONCE on the org role layer
OrgRolePermission::create([
    'organization_id' => $org->id,
    'role_id'         => $adminRole->id,
    'permissions'     => ['tickets.*', 'ticket-comments.*'],  // full CRUD + trash/restore/force-delete
]);

OrgRolePermission::create([
    'organization_id' => $org->id,
    'role_id'         => $agentRole->id,
    'permissions'     => [
        'tickets.index', 'tickets.show', 'tickets.store', 'tickets.update',
        'tickets.destroy', 'tickets.trashed', 'tickets.restore',
        'ticket-comments.*',                                 // agents work tickets, not member mgmt
    ],
]);

OrgRolePermission::create([
    'organization_id' => $org->id,
    'role_id'         => $viewerRole->id,
    'permissions'     => [
        'tickets.index', 'tickets.show',                     // read-only
        'ticket-comments.index', 'ticket-comments.show',
    ],
]);
```

One member needs a one-off exception? Don't invent a fourth role — use the per-user delta columns:

```php title="database/seeders/MembershipSeeder.php"
// This agent keeps the base agent abilities, but is barred from deleting tickets —
// a per-user deny overrides the role grant (deny always wins).
UserRole::create([
    'user_id'              => $user->id,
    'organization_id'      => $org->id,
    'role_id'              => $agentRole->id,
    'denied_permissions'   => ['tickets.destroy'],
]);
```

What each Helpdesk role resolves to on the `tickets` resource:

| Action | admin | agent | viewer |
|---|---|---|---|
| List / view tickets | Yes | Yes | Yes |
| Create / update ticket | Yes | Yes | No |
| Delete (close) ticket | Yes | Yes | No |
| View trashed / restore | Yes | Yes | No |
| Force-delete ticket | Yes | No | No |
| See `internal_notes` (see below) | Yes | Yes | No |

## Attribute-level permissions: hide `internal_notes` and internal comments from viewers

Action-level authorization answers *can this user update a ticket?* Attribute-level authorization answers *which columns of that ticket can they see and set?* In Helpdesk, `Ticket.internal_notes` and any `TicketComment` with `is_internal = true` are **agent/admin only** — a `viewer` must never receive them, even on a ticket they're allowed to read.

This is the [Attribute Permissions](../policies#attribute-permissions) step ([lifecycle step 6](../request-lifecycle#6-attribute-permissions-via-policy)): after the query runs and *before* serialization, Rhino calls `permittedAttributesForShow()` / `hiddenAttributesForShow()` and strips columns per role.

```php title="app/Policies/TicketPolicy.php"
// ❌ Bad — returns internal_notes to everyone; a viewer sees confidential notes in the JSON
class TicketPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'tickets';
    // No attribute methods → default ['*'] / [] → every field is exposed to every role.
}
```

```php title="app/Policies/TicketPolicy.php"
// ✅ Good — internal_notes hidden from viewers; agents/admins keep it
<?php

namespace App\Policies;

use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Policies\ResourcePolicy;

class TicketPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'tickets';

    public function hiddenAttributesForShow(?Authenticatable $user): array
    {
        // Handle the null (unauthenticated) case — treat as least privilege.
        if ($this->hasRole($user, 'admin') || $this->hasRole($user, 'agent')) {
            return [];
        }

        return ['internal_notes']; // viewers (and anon) never receive it
    }
}
```

:::info Two ways to hide, chosen deliberately
`hiddenAttributesForShow()` is a **blacklist** (hide these) — best when most fields are public and a few are sensitive, as with `internal_notes`. `permittedAttributesForShow()` is a **whitelist** (only these) — best when the default should be *deny*. Rhino merges both: the whitelist narrows, then the blacklist strips on top. Both receive `null` for unauthenticated requests, so always handle it.
:::

`TicketComment` hides at the **row** level, not the column level: an internal comment shouldn't merely have fields stripped — it should be invisible to viewers entirely. That's a scope/query concern, so gate `is_internal` visibility with a named scope and keep the write-side field locked in the policy:

```php title="app/Policies/TicketCommentPolicy.php"
// ✅ Good — only agents/admins may mark a comment internal on create
public function permittedAttributesForCreate(?Authenticatable $user): array
{
    if ($this->hasRole($user, 'admin') || $this->hasRole($user, 'agent')) {
        return ['body', 'is_internal'];
    }

    return ['body']; // a viewer submitting is_internal gets a 403, not a silent accept
}
```

A viewer who tries to set a forbidden field is rejected loudly, which is the correct failure mode:

```json title="Response — 403 Forbidden"
{
    "message": "You are not allowed to set the following field(s): is_internal"
}
```

For hiding whole internal comments from the list, pair this with a default scope on `TicketComment` — see [Tenant Safety](./tenant-safety) and [Models & Queries](./models-and-queries#named-scopes-and-the-default-scope).

## Include authorization is independent — a caller must be able to view the relation

Loading a relation via `?include=` is a **separate** authorization. Even a user with full ticket access cannot eager-load comments they lack `ticket-comments.index` on. Rhino checks each included resource independently, so you don't have to re-guard relations by hand.

```
GET /{organization}/tickets?include=comments
```

If the caller lacks `ticket-comments.index`, Rhino rejects the whole request:

```json title="Response — 403 Forbidden"
{
    "message": "You do not have permission to include comments."
}
```

Because the check is per-resource, seed each role's include-able relations by granting the *target's* `index` permission — a viewer with `ticket-comments.index` can include comments, but the row-level scope above still strips internal ones. Nested includes (`?include=comments.author`) authorize every hop.

## Route-group permission layering: same model, different rules per group

The Helpdesk app registers models under two [route groups](../route-groups) — the single-tenant `app` group (global `Category`/`Plan`/`Article`, no org segment) and the multitenant `tenant` group (`Ticket`/`TicketComment`, prefixed `{organization}`). A model reachable in more than one group must not carry one flat rule: `tenant` permissions resolve against the **org-scoped** layered source, while a non-tenant group resolves against `users.permissions`. The active group is available server-side as `request()->route()?->defaults['route_group']`, so a policy can branch on *context*, not just role.

```php title="app/Policies/CategoryPolicy.php"
// ❌ Bad — one rule for a model reachable in two groups; either the tenant side over-grants
//          write access, or the vendor 'app' side is wrongly blocked. Context is ignored.
class CategoryPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'categories';

    public function update(?Authenticatable $user, $category): bool
    {
        return $user->hasPermission('categories.update'); // same everywhere → leaks
    }
}
```

```php title="app/Policies/CategoryPolicy.php"
// ✅ Good — the global catalog is writable only from the vendor 'app' group;
//           tenants see it read-only. Layer the rule by route_group.
<?php

namespace App\Policies;

use Illuminate\Contracts\Auth\Authenticatable;
use Rhino\LaravelApi\Policies\ResourcePolicy;

class CategoryPolicy extends ResourcePolicy
{
    protected $resourceSlug = 'categories';

    public function update(?Authenticatable $user, $category): bool
    {
        $group = request()->route()?->defaults['route_group'] ?? null;

        // Only vendor staff on the single-tenant 'app' group may edit the shared catalog.
        if ($group !== 'app') {
            return false;
        }

        return parent::update($user, $category);
    }
}
```

:::tip Let each layer do one thing
Route-group tagging picks the **context** (which prefix/host, which permission source). The policy picks the **action + fields**. Tenant scoping picks the **records**. Keep them separate: a model exposed in two groups gets *one* policy that branches on `route_group`, not two divergent copies of the logic — and the org-vs-user permission source is chosen for you by the group, per the [permission-resolution rules](../route-groups#permission-resolution).
:::

## Checklist

- **One policy per model**, extending `ResourcePolicy`; controllers never make role decisions.
- **Roles resolve from `Membership`** via `hasRole()` / `hasPermission()` — never from the request body.
- **Encode roles as permission sets** on the org role layer; use `granted`/`denied` deltas for one-offs, not new roles.
- **`internal_notes` and internal comments are hidden by role** with `hiddenAttributesForShow()` and locked on write with `permittedAttributesForCreate()`.
- **Always call `parent::`** in an override so the base permission check survives.
- **Branch on `route_group`** for any model reachable in more than one group; keep record-scoping in [Tenant Safety](./tenant-safety), field-shaping in the policy.
