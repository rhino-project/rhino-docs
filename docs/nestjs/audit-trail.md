---
sidebar_position: 9
title: Audit Trail
---

# Audit Trail

Rhino includes an automatic audit trail system that records every change to your models. When the `HasAuditTrail` mixin is applied, create, update, delete, restore, and force-delete operations are logged with full before/after snapshots, user context, and request metadata.

## HasAuditTrail Mixin

Apply the mixin to any model you want to audit:

```ts title="app/models/post.ts"
import { DateTime } from 'luxon'
import { BaseModel, column } from '@nestjs/lucid/orm'
import { compose } from '@nestjs/core/helpers'
import { HasRhino } from '@rhino-dev/rhino-nestjs/mixins/has_rhino'
import { HasAuditTrail } from '@rhino-dev/rhino-nestjs/mixins/has_audit_trail'

export default class Post extends compose(BaseModel, HasRhino, HasAuditTrail) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare content: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Exclude sensitive fields from audit logs
  static auditExclude = ['password', 'remember_token']
}
```

## Tracked Events

The mixin hooks into Prisma model lifecycle events to capture changes automatically:

| Event | Action Logged | Old Values | New Values |
|-------|--------------|------------|------------|
| `after:create` | `created` | `null` | All attributes |
| `after:update` | `updated` | Changed fields (original values) | Changed fields (new values) |
| `after:delete` (soft) | `deleted` | All attributes | `null` |
| `after:delete` (hard) | `force_deleted` | All attributes | `null` |
| Manual call | `restored` | `null` | `null` |

For update events, only the dirty (changed) fields are recorded, not the entire record. If no fields actually changed, no audit log entry is created.

## AuditLog Model

Audit entries are stored in the `audit_logs` table using the `AuditLog` Prisma model:

```ts
import AuditLog from '@rhino-dev/rhino-nestjs/models/audit_log'
```

Each entry contains:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `number` | Primary key |
| `auditableType` | `string` | The model table name (e.g., `'posts'`, `'users'`) |
| `auditableId` | `number \| string` | The primary key of the audited record |
| `action` | `string` | One of: `created`, `updated`, `deleted`, `restored`, `force_deleted` |
| `oldValues` | `object \| null` | JSON snapshot of values before the change |
| `newValues` | `object \| null` | JSON snapshot of values after the change |
| `userId` | `number \| null` | The ID of the user who performed the action |
| `organizationId` | `number \| null` | The organization context (if multi-tenancy enabled) |
| `ipAddress` | `string \| null` | The IP address of the request |
| `userAgent` | `string \| null` | The User-Agent header of the request |
| `createdAt` | `DateTime` | When the log entry was created |
| `updatedAt` | `DateTime` | When the log entry was last updated |

The `auditableType` and `auditableId` columns form a polymorphic reference to the audited record.

## Excluding Fields

By default, the `password` and `remember_token` fields are excluded from audit log snapshots. Override the `auditExclude` static property to customize which fields are excluded:

```ts title="app/models/user.ts"
export default class User extends compose(BaseModel, HasAuditTrail) {
  static auditExclude = ['password', 'remember_token', 'api_token', 'stripe_secret']
}
```

Excluded fields will never appear in `oldValues` or `newValues`, preventing sensitive data from being stored in the audit log.

## Request Context

The audit trail automatically captures the current HTTP request context using NestJS's `AsyncLocalStorage`-backed `HttpContext`:

- **userId** -- from `ctx.auth.user.id`
- **organizationId** -- from `ctx.organization.id` (if multi-tenancy is enabled)
- **ipAddress** -- from `ctx.request.ip()`
- **userAgent** -- from the `User-Agent` header

When running outside an HTTP context (e.g., Ace commands, tests, queue workers), these fields are set to `null`. Audit logging never throws an error when context is unavailable -- it silently records what it can.

## Manual Logging Methods

Prisma does not have native hooks for restore or force-delete operations, so the mixin provides two manual logging methods:

### logRestore()

Call this after restoring a soft-deleted record to log a `restored` action:

```ts
const post = await Post.query().onlyTrashed().where('id', 1).firstOrFail()

// Restore the record
post.deletedAt = null
await post.save()

// Log the restoration
await post.logRestore()
```

The `ResourcesController` calls this automatically when processing `POST /:model/:id/restore` requests.

### logForceDelete()

Call this before or after permanently deleting a record to log a `force_deleted` action:

```ts
const post = await Post.query().onlyTrashed().where('id', 1).firstOrFail()

// Log before deletion (so we capture the record's attributes)
await post.logForceDelete()

// Permanently delete
await Post.query().where('id', post.id).delete()
```

## Querying Audit Logs

Every model with the `HasAuditTrail` mixin gets an `auditLogs()` instance method that queries all audit log entries for that specific record:

```ts
const post = await Post.findOrFail(1)

// Get all audit logs for this post, ordered by most recent
const logs = await post.auditLogs()

for (const log of logs) {
  console.log(log.action)      // 'created', 'updated', etc.
  console.log(log.oldValues)   // Previous state
  console.log(log.newValues)   // Current state
  console.log(log.userId)      // Who made the change
  console.log(log.createdAt)   // When it happened
}
```

You can also query the `AuditLog` model directly for more advanced queries:

```ts
import AuditLog from '@rhino-dev/rhino-nestjs/models/audit_log'

// All changes by a specific user
const userChanges = await AuditLog.query()
  .where('user_id', userId)
  .orderBy('created_at', 'desc')

// All deletions across all models
const deletions = await AuditLog.query()
  .where('action', 'deleted')
  .orderBy('created_at', 'desc')

// Changes to a specific model type
const postChanges = await AuditLog.query()
  .where('auditable_type', 'posts')
  .orderBy('created_at', 'desc')
```

## Migration

The `audit_logs` table is created by a Rhino migration. Make sure you run migrations after installing:

```bash title="terminal"
npx prisma migrate deploy
```

The table structure matches the `AuditLog` model columns listed above.

## Fail-Safe Design

Audit logging is designed to never break the main operation. All audit log creation is wrapped in try/catch blocks. If the `AuditLog` model is not available, the table does not exist, or a database error occurs during logging, the primary CRUD operation completes successfully and the audit failure is silently ignored.
