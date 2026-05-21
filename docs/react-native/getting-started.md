---
sidebar_position: 1
title: Getting Started
---

# React Native — Getting Started

Same Rhino hooks, adapted for native. Built on Expo with SecureStore, AsyncStorage, and platform-aware networking.

## Tech Stack

- **Expo SDK 54** — managed React Native workflow
- **React 19** + **React Native 0.81**
- **Expo Router** — file-based routing
- **TanStack Query** — server state management
- **NativeWind 4** — Tailwind CSS for React Native
- **Expo SecureStore** — encrypted token storage
- **AsyncStorage** — general persistence

## Quick Start

```bash title="terminal"
# Clone the template
git clone https://github.com/rhino-project/rhino-react-native-template
cd rhino-react-native-template

# Install dependencies
npm install

# Start Expo dev server
npm start
```

Run on devices:

```bash title="terminal"
npm run ios       # iPhone simulator
npm run android   # Android emulator
npm run web       # Web browser (testing)
```

## Project Structure

``` title="Project Structure"
app/                        # Expo Router file-based routing
├── (auth)/                 # Public routes
│   └── login.tsx
├── (app)/                  # Protected routes (drawer nav)
│   ├── _layout.tsx
│   └── ...screens
├── _layout.tsx             # Root with providers
└── index.tsx

src/
├── lib/
│   └── rhino-rn/          # Platform adapter layer
│       ├── storage.ts      # SecureStore + AsyncStorage
│       ├── api-client.ts   # Platform-aware Axios
│       ├── context/        # Auth & Org providers
│       └── hooks/          # CRUD hooks
├── components/
│   ├── ui/                 # Button, Input, etc.
│   └── features/           # Screen components
└── config/
    ├── query-client.ts
    └── env.ts
```

## API Configuration

The API client auto-detects the platform:

```typescript title="src/lib/rhino-rn/api-client.ts"
const API_CONFIG = {
  baseURL: __DEV__
    ? Platform.select({
        ios: 'http://localhost:8000/api',
        android: 'http://10.0.2.2:8000/api',  // Android emulator
        default: 'http://localhost:8000/api',
      })
    : 'https://api.production.com/api',
};
```

## Usage

Hooks work identically to the web client:

```tsx title="src/screens/UsersList.tsx"
import { useModelIndex, useAuth } from '../lib/rhino-rn';

function UsersList() {
  const { data: response } = useModelIndex('users');

  return (
    <FlatList
      data={response?.data || []}
      renderItem={({ item }) => <Text>{item.name}</Text>}
    />
  );
}
```
