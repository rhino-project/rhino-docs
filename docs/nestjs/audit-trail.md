---
sidebar_position: 9
title: Audit Trail
---

# Audit Trail

Rhino includes an automatic audit trail system that records every change to your models. When `hasAuditTrail: true` is set on a model registration, create, update, delete, restore, and force-delete operations are logged with full before/after snapshots, user context, and request metadata.

## Enabling the Audit Trail

Set `hasAuditTrail: true` on the model registration in `src/rhino.config.ts`. Use `auditExclude` to keep sensitive fields out of the snapshots:

```ts title="src/rhino.config.ts"
posts: {
  model: 'post',
  hasAuditTrail: true,
  // Exclude sensitive fields from audit logs
  auditExclude: ['password', 'rememberToken'],
},
```

## Tracked Events

Rhino's audit service records changes around each CRUD operation automatically:

| Operation | Action Logged | Old Values | New Values |
|-------|--------------|------------|------------|
| Create | `created` | `null` | All attributes |
| Update | `updated` | Changed fields (original values) | Changed fields (new values) |
| Soft delete | `deleted` | All attributes | `null` |
| Force delete | `force_deleted` | All attributes | `null` |
| Restore | `restored` | `null` | All attributes |

For update events, only the dirty (changed) fields are recorded, not the entire record. If no fields actually changed, no audit log entry is created.

## AuditLog Model

Audit entries are stored in the `audit_logs` table. Define the `AuditLog` model in your Prisma schema:

```prisma title="prisma/schema.prisma"
model AuditLog {
  id             Int      @id @default(autoincrement())
  auditableType  String
  auditableId    String
  action         String
  oldValues      String?
  newValues      String?
  userId         Int?
  organizationId Int?
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())

  @@index([auditableType, auditableId])
  @@map("audit_logs")
}
```

Each entry contains:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Int` | Primary key |
| `auditableType` | `String` | The model table name (e.g., `'posts'`, `'users'`) |
| `auditableId` | `String` | The primary key of the audited record |
| `action` | `String` | One of: `created`, `updated`, `deleted`, `restored`, `force_deleted` |
| `oldValues` | `String?` | JSON snapshot of values before the change |
| `newValues` | `String?` | JSON snapshot of values after the change |
| `userId` | `Int?` | The ID of the user who performed the action |
| `organizationId` | `Int?` | The organization context (if multi-tenancy enabled) |
| `ipAddress` | `String?` | The IP address of the request |
| `userAgent` | `String?` | The User-Agent header of the request |
| `createdAt` | `DateTime` | When the log entry was created |

The `auditableType` and `auditableId` columns form a polymorphic reference to the audited record. `oldValues` / `newValues` are stored as JSON strings.

## Excluding Fields

By default, the `password` and `rememberToken` fields are excluded from audit log snapshots. Set `auditExclude` on the registration to customize which fields are excluded:

```ts title="src/rhino.config.ts"
users: {
  model: 'user',
  hasAuditTrail: true,
  auditExclude: ['password', 'rememberToken', 'apiToken', 'stripeSecret'],
},
```

Excluded fields will never appear in `oldValues` or `newValues`, preventing sensitive data from being stored in the audit log.

## Request Context

The audit trail automatically captures the current HTTP request context from the NestJS request:

- **userId** -- from the authenticated user (`req.user.id`)
- **organizationId** -- from `req.organization.id` (if multi-tenancy is enabled)
- **ipAddress** -- from the request IP
- **userAgent** -- from the `User-Agent` header

When running outside an HTTP request (e.g., scripts, tests, queue workers), these fields are set to `null`. Audit logging never throws an error when context is unavailable -- it silently records what it can.

## Querying Audit Logs

Because `AuditLog` is a plain Prisma model, you query it directly via the Prisma client:

```ts
// All changes by a specific user
const userChanges = await prisma.auditLog.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
});

// All deletions across all models
const deletions = await prisma.auditLog.findMany({
  where: { action: 'deleted' },
  orderBy: { createdAt: 'desc' },
});

// All entries for a specific record
const postHistory = await prisma.auditLog.findMany({
  where: { auditableType: 'posts', auditableId: '1' },
  orderBy: { createdAt: 'desc' },
});

for (const log of postHistory) {
  console.log(log.action);                     // 'created', 'updated', etc.
  console.log(JSON.parse(log.oldValues ?? 'null')); // Previous state
  console.log(JSON.parse(log.newValues ?? 'null')); // New state
  console.log(log.userId);                     // Who made the change
  console.log(log.createdAt);                  // When it happened
}
```

## Migration

Add the `AuditLog` model to `prisma/schema.prisma` (see above) and run a migration to create the `audit_logs` table:

```bash title="terminal"
npx prisma migrate dev
```

## Fail-Safe Design

Audit logging is designed to never break the main operation. All audit log creation is wrapped in try/catch blocks. If the `AuditLog` model is not available, the table does not exist, or a database error occurs during logging, the primary CRUD operation completes successfully and the audit failure is silently ignored.
