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

## Invitation Endpoints

The `InvitationController` provides five endpoints for managing invitations:

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

**Response:** Array of invitation objects with the `organization`, `role`, and `invitedBy` relations included.

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

Invitations are stored using an `OrganizationInvitation` Prisma model:

```prisma title="prisma/schema.prisma"
model OrganizationInvitation {
  id             Int       @id @default(autoincrement())
  organizationId Int
  email          String
  roleId         Int
  token          String    @unique
  status         String    @default("pending")
  invitedById    Int
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role         Role         @relation(fields: [roleId], references: [id])
  invitedBy    User         @relation("InvitedBy", fields: [invitedById], references: [id])

  @@map("organization_invitations")
}
```

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Int` | Primary key |
| `organizationId` | `Int` | The organization the invitee is being invited to |
| `email` | `String` | The email address of the invitee |
| `roleId` | `Int` | The role to assign upon acceptance |
| `invitedById` | `Int` | The user ID of the person who created the invitation |
| `token` | `String` | A cryptographically random 64-character hex token |
| `status` | `String` | One of: `pending`, `expired`, `cancelled`, `accepted` |
| `expiresAt` | `DateTime` | When the invitation expires |
| `acceptedAt` | `DateTime?` | When the invitation was accepted |
| `createdAt` | `DateTime` | When the invitation was created |

### Relations

- `organization` -- belongs to `Organization`
- `role` -- belongs to `Role`
- `invitedBy` -- belongs to `User`

## Token Generation

Tokens are generated by `InvitationService` when an invitation is created, using Node.js's `crypto.randomBytes()`:

```ts
import { randomBytes } from 'node:crypto';

// 32 bytes = 64 hex characters
const token = randomBytes(32).toString('hex');
```

This produces a cryptographically secure, URL-safe token suitable for inclusion in email links.

## Expiration Handling

When an invitation is created, the `expiresAt` field is set based on the `invitations.expiresDays` config value (default: 7 days). When an invitation is resent, the expiration is refreshed to start a new countdown from the current time.

When accepting an invitation, the system checks if the invitation has expired. If it has, the status is updated to `expired` and a `422` error is returned.

## Invitation Authorization

Access to invitation endpoints is controlled the same way as any resource:

| Action | Requirement |
|--------|-------------------|
| List (`viewAny`) | User must be authenticated and belong to the organization |
| Create | User must belong to the org. If `allowedRoles` is configured, user must hold one of those roles |
| Update / Resend / Cancel | User must belong to the org. Invitation must be pending |

When group membership enforcement is enabled, a coarse membership gate (the inviter must be a member of the target group) runs first, then the normal permission check. See [Route Groups → Group membership & auth](./route-groups#group-membership--auth).

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
// Inside the RhinoConfig object passed to RhinoModule.forRoot()
invitations: {
  expiresDays: 7,           // Days until invitation expires (default: 7)
  allowedRoles: null,       // null = all roles, or ['admin', 'editor']
  notificationHandler: async (invitation) => {
    // Send your invitation email here
  },
},
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `expiresDays` | `number` | `7` | Number of days until an invitation expires. |
| `allowedRoles` | `string[] \| null` | `null` | Role slugs allowed to create invitations. `null` allows all members. |

## Email Notifications

Rhino does not ship a mailer. Instead, configure a `notificationHandler` on `invitations` — Rhino calls it with the created invitation so you can send the email with whatever transport you use (Nodemailer, a transactional email API, a queue, etc.):

```ts title="src/rhino.config.ts"
invitations: {
  expiresDays: 7,
  notificationHandler: async (invitation) => {
    await mailer.send({
      to: invitation.email,
      subject: 'You have been invited',
      // include a link containing invitation.token
    });
  },
},
```

If the handler throws, the invitation is still created — the email can be resent later using the resend endpoint.
