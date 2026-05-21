---
sidebar_position: 11
title: Invitations
---

# Invitations

Rhino includes a full invitation system for multi-tenant organizations. Users can be invited to join an organization via email, with token-based acceptance, role assignment, and expiration handling.

## Overview

The invitation flow works as follows:

1. An authenticated user creates an invitation for an email address within an organization
2. A 64-character hex token is generated and an email notification is sent
3. The invitee receives the email and clicks the acceptance link
4. If the invitee is authenticated, the invitation is accepted immediately and they are added to the organization with the assigned role
5. If the invitee is not authenticated, the API returns the invitation details so the frontend can redirect to a registration page

## InvitationsController Endpoints

The `InvitationsController` provides five endpoints for managing invitations:

### List Invitations

```
GET /api/:organization/invitations
```

Lists all invitations for the organization. Supports filtering by status.

**Query Parameters:**

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `status` | `pending`, `expired`, `all` | `all` | Filter invitations by status |

**Authorization:** User must be authenticated and belong to the organization.

**Response:** Array of invitation objects with preloaded `organization`, `role`, and `invitedByUser` relationships.

---

### Create Invitation

```
POST /api/:organization/invitations
```

Creates a new invitation and sends an email notification.

**Request Body:**

```json title="Request"
{
  "email": "newuser@example.com",
  "role_id": 2
}
```

**Validation:**
- `email` -- required, valid email, max 255 characters
- `role_id` -- required, integer

**Checks performed:**
1. No duplicate pending invitation for the same email and organization
2. User with this email is not already a member of the organization
3. The specified role exists

**Authorization:** User must belong to the organization. If `invitations.allowedRoles` is configured, the user must hold one of the listed roles.

**Response:** `201 Created` with the serialized invitation.

---

### Resend Invitation

```
POST /api/:organization/invitations/:id/resend
```

Resends the invitation email and refreshes the expiration date. Only pending invitations can be resent.

**Authorization:** User must belong to the organization and the invitation must be in `pending` status.

**Response:** `200 OK` with a success message and the updated invitation.

---

### Cancel Invitation

```
DELETE /api/:organization/invitations/:id
```

Cancels a pending invitation by setting its status to `cancelled`. The invitation record is not deleted from the database.

**Authorization:** User must belong to the organization and the invitation must be in `pending` status.

**Response:** `200 OK` with a success message.

---

### Accept Invitation

```
POST /api/invitations/accept
```

Accepts an invitation using a token. This is a public endpoint (no organization middleware) because the invitee may not yet be a member.

**Request Body:**

```json title="Request"
{
  "token": "a1b2c3d4e5f6...64-char-hex-token"
}
```

**Validation:**
- `token` -- required, string, exactly 64 characters

**Behavior:**

- If the user is **not authenticated**, the response includes the invitation details and `requires_registration: true`, allowing the frontend to redirect to a registration page
- If the user **is authenticated**, the invitation is accepted immediately, and the user is added to the organization with the assigned role

**Response (not authenticated):**
```json title="Response"
{
  "invitation": { ... },
  "requires_registration": true,
  "message": "Please register or login to accept this invitation"
}
```

**Response (authenticated):**
```json title="Response"
{
  "message": "Invitation accepted successfully",
  "invitation": { ... },
  "organization": { ... }
}
```

## OrganizationInvitation Model

The `OrganizationInvitation` model represents an invitation record:

```ts
import OrganizationInvitation from '@rhino-dev/rhino-nestjs/models/organization_invitation'
```

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | `number` | Primary key |
| `organizationId` | `number` | The organization the invitee is being invited to |
| `email` | `string` | The email address of the invitee |
| `roleId` | `number` | The role to assign upon acceptance |
| `invitedBy` | `number` | The user ID of the person who created the invitation |
| `token` | `string` | A cryptographically random 64-character hex token |
| `status` | `string` | One of: `pending`, `expired`, `cancelled`, `accepted` |
| `expiresAt` | `DateTime \| null` | When the invitation expires |
| `acceptedAt` | `DateTime \| null` | When the invitation was accepted |
| `createdAt` | `DateTime` | When the invitation was created |
| `updatedAt` | `DateTime` | When the invitation was last updated |
| `deletedAt` | `DateTime \| null` | Soft delete timestamp |

### Relationships

- `organization` -- BelongsTo Organization
- `role` -- BelongsTo Role
- `invitedByUser` -- BelongsTo User

### Instance Methods

| Method | Description |
|--------|-------------|
| `isExpired()` | Returns `true` if the invitation is pending and past its expiration date |
| `isPending()` | Returns `true` if the status is `pending` and the invitation has not expired |
| `accept(user)` | Accepts the invitation for the given user, sets status to `accepted`, and adds the user to the organization |

### Scopes

```ts
// Query only pending, non-expired invitations
await OrganizationInvitation.query().withScopes((s) => s.pending())

// Query only expired invitations
await OrganizationInvitation.query().withScopes((s) => s.expired())
```

## Token Generation

Tokens are generated automatically in the `@beforeCreate` hook using Node.js's `crypto.randomBytes()`:

```ts
import { randomBytes } from 'node:crypto'

// 32 bytes = 64 hex characters
const token = randomBytes(32).toString('hex')
```

This produces a cryptographically secure, URL-safe token suitable for inclusion in email links.

## Expiration Handling

When an invitation is created, the `expiresAt` field is automatically set based on the `invitations.expiresDays` config value (default: 7 days):

```ts
invitation.expiresAt = DateTime.now().plus({ days: 7 })
```

When an invitation is resent, the expiration is refreshed to start a new countdown from the current time.

When accepting an invitation, the system checks if the invitation has expired. If it has, the status is updated to `expired` and a `422` error is returned.

## InvitationPolicy Authorization

The `InvitationPolicy` class controls access to invitation endpoints:

| Method | Permission Required |
|--------|-------------------|
| `viewAny(user, organization)` | User must be authenticated and belong to the organization |
| `create(user, organization)` | User must belong to the org. If `allowedRoles` is configured, user must hold one of those roles |
| `update(user, invitation, organization)` | User must belong to the org. Invitation must be pending |
| `delete(user, invitation, organization)` | Same as update |

### Allowed Roles

By default, any member of an organization can create invitations. To restrict this to specific roles, configure `invitations.allowedRoles`:

```ts title="src/rhino.config.ts"
invitations: {
  expiresDays: 7,
  allowedRoles: ['admin', 'manager'], // Only admins and managers can invite
},
```

When set to `null` (default), all organization members can create invitations.

## Configuration

```ts title="src/rhino.config.ts"
import { RhinoModule } from "@rhino-dev/rhino-nestjs";  // wire via RhinoModule.forRoot() in your AppModule

RhinoModule.forRoot({
  invitations: {
    expiresDays: 7,           // Days until invitation expires (default: 7)
    allowedRoles: null,       // null = all roles, or ['admin', 'editor']
  },
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `expiresDays` | `number` | `7` | Number of days until an invitation expires. |
| `allowedRoles` | `string[] \| null` | `null` | Role slugs allowed to create invitations. `null` allows all members. |

## Email Notifications

When an invitation is created or resent, Rhino sends an email notification using NestJS's mail service (`@nestjs/mail`). The system first tries to render an HTML view at `emails/invitation`, falling back to a plain text email if the view is not available.

If email sending fails entirely, the invitation is still created. The email can be resent later using the resend endpoint.
