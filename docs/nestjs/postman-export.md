---
sidebar_position: 12
title: Postman Export
---

# Postman Export

Rhino includes a CLI command that generates a complete Postman Collection v2.1 JSON file for all registered models. The collection includes authentication routes, per-model CRUD folders with filter, sort, search, include, and field examples, and soft-delete actions.

## Usage

```bash title="terminal"
npx rhino export-postman
```

This introspects all registered models from `src/rhino.config.ts` and writes a `postman_collection.json` file.

### Command Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | `postman_collection.json` | Output file path |
| `--base-url` | `http://localhost:3000/api` | Base URL for requests |

### Examples

```bash title="terminal"
# Default output
npx rhino export-postman

# Custom output path and base URL
npx rhino export-postman --output=api-collection.json --base-url=https://api.example.com/api
```

## Configuration

The optional `postman` block in `src/rhino.config.ts` lets you point the exporter at non-default model names used to enumerate roles and permissions:

```ts title="src/rhino.config.ts"
// Inside the RhinoConfig object passed to RhinoModule.forRoot()
postman: {
  roleModel: 'role',
  userRoleModel: 'userRole',
  userModel: 'user',
},
```

| Option | Type | Description |
|--------|------|-------------|
| `roleModel` | `string` | Prisma model used to enumerate roles. |
| `userRoleModel` | `string` | Prisma model for user-role memberships. |
| `userModel` | `string` | Prisma model for users. |

The base URL and output path are controlled by the command-line flags above.

## Generated Collection Structure

The exported collection is organized into folders:

### Collection Variables

The collection includes pre-defined variables that can be customized in Postman:

| Variable | Default Value | Description |
|----------|--------------|-------------|
| `baseUrl` | From config | Base URL for all requests |
| `modelId` | `1` | Example resource ID |
| `token` | (empty) | Auth token, auto-filled by the Login request |
| `organization` | `organization-1` | Organization identifier (only when multi-tenant with URL prefix) |

### Authentication Folder

A top-level `Authentication` folder containing:

- **Login** -- `POST /auth/login` with test script that auto-saves the returned token to the `{{token}}` collection variable
- **Logout** -- `POST /auth/logout`
- **Password recover** -- `POST /auth/password/recover`
- **Password reset** -- `POST /auth/password/reset`
- **Register (with invitation)** -- `POST /auth/register`
- **Accept invitation** -- `POST /invitations/accept`

### Per-Model Folders

Each registered model gets its own folder with sub-folders for each action. The command introspects the registration's fields (`allowedFilters`, `allowedSorts`, `allowedIncludes`, `allowedFields`, `allowedSearch`, `validation`/`validationStore`, `exceptActions`, `softDeletes`) to generate accurate example requests.

**Index sub-folder:**
- List all
- Filter by each allowed filter (one request per filter)
- Sort by each allowed sort (ascending and descending)
- Include each allowed relationship
- Include all relationships at once
- Select fields
- Search (if search fields are configured)
- Paginate
- Combined request (filter + sort + include + fields + pagination)

**Show sub-folder:**
- Show by ID
- Show with include
- Show with fields

**Store sub-folder:**
- Create with example body generated from validation rules

**Update sub-folder:**
- Update all fields
- Update partial (first field only)

**Destroy sub-folder:**
- Delete by ID

**Soft-delete sub-folders** (when `softDeletes = true`):
- **Trashed** -- List trashed, List trashed with sort
- **Restore** -- Restore by ID
- **Force Delete** -- Force delete by ID

### Example Request Bodies

The command generates example request bodies from the registration's Zod schema. Field values are inferred from the schema types:

| Schema Type | Example Value |
|------|--------------|
| `z.boolean()` | `true` |
| `z.number()` | `1` |
| `z.string().max(N)` | String of `min(10, N)` characters |
| `z.string()` | `"Example fieldName"` |

### Multi-Tenant Support

When multi-tenancy is enabled with URL prefix mode, all model routes include the `{{organization}}` variable:

```
GET {{baseUrl}}/{{organization}}/posts
POST {{baseUrl}}/{{organization}}/posts
```

The `organization` collection variable is included automatically.

## Importing the Collection

1. Run `npx rhino export-postman`
2. Open Postman
3. Click **Import** and select the generated `postman_collection.json`
4. Update the `baseUrl` variable to match your environment
5. Run the **Login** request first to populate the `{{token}}` variable
6. All subsequent requests will use the saved token automatically
