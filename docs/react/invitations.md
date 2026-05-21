---
sidebar_position: 7
title: Invitations
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Invitations

Manage user invitations for multi-tenant organizations. Invite users by email, assign roles, resend or cancel pending invitations, and accept invitations via token.

## Invitation Object

```typescript title="src/types.ts"
interface Invitation {
  id: number;
  email: string;
  role_id: number;
  role?: { id: number; name: string };
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by?: { id: number; name: string };
  expires_at: string;
  created_at: string;
  updated_at: string;
}
```

## useInvitations(status?)

Fetch invitations for the current organization. Optionally filter by status.

```tsx title="src/hooks/useInvitations.ts"
import { useInvitations } from '@rhino-dev/rhino-react';

// All invitations
const { data: invitations } = useInvitations();

// Only pending invitations
const { data: pending } = useInvitations('pending');

// Only expired invitations
const { data: expired } = useInvitations('expired');
```

**Status filter values:** `'all'`, `'pending'`, `'accepted'`, `'expired'`, `'cancelled'`

**API Request:** `GET /api/{organization}/invitations?status=pending`

## useInviteUser()

Send a new invitation to an email address with a specific role.

```tsx title="src/hooks/useInviteUser.ts"
import { useInviteUser } from '@rhino-dev/rhino-react';

const invite = useInviteUser();

invite.mutate(
  { email: 'newuser@example.com', role_id: 2 },
  {
    onSuccess: (invitation) => {
      console.log('Invitation sent:', invitation);
    },
    onError: (error) => {
      if (error.response?.status === 422) {
        // User already invited or already a member
        console.log(error.response.data.errors);
      }
    },
  }
);
```

**API Request:** `POST /api/{organization}/invitations`

:::info Duplicate Prevention
The server prevents sending duplicate invitations. If a pending invitation already exists for the email, or if the user is already a member of the organization, the request will return a validation error.
:::

## useResendInvitation()

Resend an invitation email. This also refreshes the expiration date.

```tsx title="src/hooks/useResendInvitation.ts"
import { useResendInvitation } from '@rhino-dev/rhino-react';

const resend = useResendInvitation();

resend.mutate(invitationId, {
  onSuccess: () => {
    alert('Invitation resent!');
  },
});
```

**API Request:** `POST /api/{organization}/invitations/{id}/resend`

## useCancelInvitation()

Cancel a pending invitation. Only pending invitations can be cancelled.

```tsx title="src/hooks/useCancelInvitation.ts"
import { useCancelInvitation } from '@rhino-dev/rhino-react';

const cancel = useCancelInvitation();

cancel.mutate(invitationId, {
  onSuccess: () => {
    console.log('Invitation cancelled');
  },
});
```

**API Request:** `DELETE /api/{organization}/invitations/{id}`

## useAcceptInvitation()

Accept an invitation using the token from the invitation link. This is a **public route** — no authentication or organization context is required.

```tsx title="src/hooks/useAcceptInvitation.ts"
import { useAcceptInvitation } from '@rhino-dev/rhino-react';

const accept = useAcceptInvitation();

accept.mutate(token, {
  onSuccess: (result) => {
    // User is now a member of the organization
    console.log('Welcome to the organization!');
  },
  onError: (error) => {
    // Token invalid, expired, or already accepted
    console.error('Failed to accept:', error);
  },
});
```

**API Request:** `POST /api/invitations/accept` with `{ token: '...' }`

## Complete Invitation Manager

A full invitation management component with all hooks:

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/components/InvitationManager.tsx"
import { useState } from 'react';
import {
  useInvitations,
  useInviteUser,
  useResendInvitation,
  useCancelInvitation,
} from '@rhino-dev/rhino-react';

function InvitationManager({ roles }) {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id || 1);
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch invitations
  const { data: invitations, isLoading, refetch } = useInvitations(statusFilter);

  // Mutations
  const invite = useInviteUser();
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();

  const handleInvite = (e) => {
    e.preventDefault();
    invite.mutate(
      { email, role_id: roleId },
      {
        onSuccess: () => {
          setEmail('');
          refetch();
        },
      }
    );
  };

  const handleResend = (id) => {
    resend.mutate(id, { onSuccess: () => refetch() });
  };

  const handleCancel = (id) => {
    if (window.confirm('Cancel this invitation?')) {
      cancel.mutate(id, { onSuccess: () => refetch() });
    }
  };

  return (
    <div>
      <h2>Invite Team Members</h2>

      {/* Invite Form */}
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
        />
        <select value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Sending...' : 'Send Invite'}
        </button>
      </form>

      {invite.error && (
        <p style={{ color: 'red' }}>
          {invite.error.response?.data?.message || 'Failed to send invitation'}
        </p>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['all', 'pending', 'accepted', 'expired', 'cancelled'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              fontWeight: statusFilter === status ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Invitations List */}
      {isLoading ? (
        <p>Loading invitations...</p>
      ) : invitations?.length === 0 ? (
        <p>No invitations found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invited By</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations?.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.email}</td>
                <td>{inv.role?.name || `Role #${inv.role_id}`}</td>
                <td>
                  <span style={{
                    color: inv.status === 'pending' ? 'orange'
                         : inv.status === 'accepted' ? 'green'
                         : inv.status === 'expired' ? 'gray'
                         : 'red'
                  }}>
                    {inv.status}
                  </span>
                </td>
                <td>{inv.invited_by?.name || '—'}</td>
                <td>{new Date(inv.expires_at).toLocaleDateString()}</td>
                <td>
                  {inv.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={resend.isPending}
                      >
                        Resend
                      </button>
                      <button
                        onClick={() => handleCancel(inv.id)}
                        disabled={cancel.isPending}
                        style={{ marginLeft: '4px', color: 'red' }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/components/InvitationManager.tsx"
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  useInvitations,
  useInviteUser,
  useResendInvitation,
  useCancelInvitation,
} from '@rhino-dev/rhino-react';

function InvitationManager({ roles }) {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id || 1);
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch invitations
  const { data: invitations, isLoading, refetch } = useInvitations(statusFilter);

  // Mutations
  const invite = useInviteUser();
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();

  const handleInvite = () => {
    invite.mutate(
      { email, role_id: roleId },
      {
        onSuccess: () => {
          setEmail('');
          refetch();
        },
      }
    );
  };

  const handleResend = (id) => {
    resend.mutate(id, { onSuccess: () => refetch() });
  };

  const handleCancel = (id) => {
    Alert.alert('Confirm', 'Cancel this invitation?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: () => cancel.mutate(id, { onSuccess: () => refetch() }),
      },
    ]);
  };

  const statusColors = {
    pending: 'orange',
    accepted: 'green',
    expired: 'gray',
    cancelled: 'red',
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Invite Team Members</Text>

      {/* Invite Form */}
      <View style={{ marginBottom: 24 }}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Picker
          selectedValue={roleId}
          onValueChange={(value) => setRoleId(value)}
        >
          {roles.map((role) => (
            <Picker.Item key={role.id} label={role.name} value={role.id} />
          ))}
        </Picker>
        <TouchableOpacity
          onPress={handleInvite}
          disabled={invite.isPending}
        >
          <Text>
            {invite.isPending ? 'Sending...' : 'Send Invite'}
          </Text>
        </TouchableOpacity>
      </View>

      {invite.error && (
        <Text style={{ color: 'red', marginBottom: 8 }}>
          {invite.error.response?.data?.message || 'Failed to send invitation'}
        </Text>
      )}

      {/* Filter Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {['all', 'pending', 'accepted', 'expired', 'cancelled'].map((status) => (
          <TouchableOpacity
            key={status}
            onPress={() => setStatusFilter(status)}
          >
            <Text
              style={{
                fontWeight: statusFilter === status ? 'bold' : 'normal',
                textTransform: 'capitalize',
              }}
            >
              {status}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Invitations List */}
      {isLoading ? (
        <Text>Loading invitations...</Text>
      ) : invitations?.length === 0 ? (
        <Text>No invitations found.</Text>
      ) : (
        <View>
          {/* Header Row */}
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ flex: 2, fontWeight: 'bold' }}>Email</Text>
            <Text style={{ flex: 1, fontWeight: 'bold' }}>Role</Text>
            <Text style={{ flex: 1, fontWeight: 'bold' }}>Status</Text>
            <Text style={{ flex: 1, fontWeight: 'bold' }}>Expires</Text>
            <Text style={{ flex: 1, fontWeight: 'bold' }}>Actions</Text>
          </View>

          {/* Data Rows */}
          <FlatList
            data={invitations}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item: inv }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 2 }}>{inv.email}</Text>
                <Text style={{ flex: 1 }}>{inv.role?.name || `Role #${inv.role_id}`}</Text>
                <Text style={{ flex: 1, color: statusColors[inv.status] || 'black' }}>
                  {inv.status}
                </Text>
                <Text style={{ flex: 1 }}>
                  {new Date(inv.expires_at).toLocaleDateString()}
                </Text>
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  {inv.status === 'pending' && (
                    <>
                      <TouchableOpacity
                        onPress={() => handleResend(inv.id)}
                        disabled={resend.isPending}
                      >
                        <Text>Resend</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleCancel(inv.id)}
                        disabled={cancel.isPending}
                        style={{ marginLeft: 4 }}
                      >
                        <Text style={{ color: 'red' }}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          />
        </View>
      )}
    </ScrollView>
  );
}
```

</TabItem>
</Tabs>

## Accept Invitation Page

For handling invitation acceptance (linked from email):

<Tabs>
<TabItem value="web" label="React (Web)" default>

```tsx title="src/pages/AcceptInvitationPage.tsx"
import { useEffect, useState } from 'react';
import { useAcceptInvitation } from '@rhino-dev/rhino-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const accept = useAcceptInvitation();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    accept.mutate(token, {
      onSuccess: (result) => {
        setStatus('success');
        // Redirect to the organization after a delay
        setTimeout(() => {
          navigate(`/orgs/${result.organization_slug}/dashboard`);
        }, 2000);
      },
      onError: (error) => {
        setStatus('error');
      },
    });
  }, [token]);

  if (status === 'loading') return <div>Accepting invitation...</div>;
  if (status === 'invalid') return <div>Invalid invitation link.</div>;
  if (status === 'error') return <div>This invitation has expired or was already used.</div>;

  return (
    <div>
      <h1>Welcome!</h1>
      <p>You've joined the organization. Redirecting to your dashboard...</p>
    </div>
  );
}
```

</TabItem>
<TabItem value="native" label="React Native">

```tsx title="src/pages/AcceptInvitationScreen.tsx"
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAcceptInvitation } from '@rhino-dev/rhino-react';
import { useNavigation, useRoute } from '@react-navigation/native';

function AcceptInvitationScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const token = route.params?.token;

  const accept = useAcceptInvitation();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    accept.mutate(token, {
      onSuccess: (result) => {
        setStatus('success');
        // Navigate to the organization after a delay
        setTimeout(() => {
          navigation.navigate('Dashboard', { orgSlug: result.organization_slug });
        }, 2000);
      },
      onError: (error) => {
        setStatus('error');
      },
    });
  }, [token]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <ActivityIndicator size="large" />
        <Text>Accepting invitation...</Text>
      </View>
    );
  }

  if (status === 'invalid') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text>Invalid invitation link.</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text>This invitation has expired or was already used.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Welcome!</Text>
      <Text>You've joined the organization. Redirecting to your dashboard...</Text>
    </View>
  );
}
```

</TabItem>
</Tabs>

:::tip Invitation Expiration
Invitations expire after the configured number of days (default: 7). Resending an invitation refreshes the expiration date.
:::
