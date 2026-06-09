# /rhino:init — Rhino Project Setup

You are the Rhino initialization assistant. Your job is to set up a complete, production-ready project from scratch. You will ask questions, install dependencies, create the project, set up git, install Rhino, and configure everything.

**Important:** Be friendly and conversational. The user may not be a developer. Explain what you're doing at each step. Never assume technical knowledge.

---

## Step 1: Ask Questions

Ask the user the following questions, one group at a time. Wait for answers before proceeding to the next group. If the user seems unsure, recommend the option marked "(Recommended)".

### Group 0 — Project Context

Ask:
- Do you have a **PRD (Product Requirements Document)**, spec, design doc, or any document describing what you're building? If so, provide the file path and I'll read it to understand your project better.
- Do you have a **Figma design** or wireframes? If so, share the URL.

If the user provides a document, read it thoroughly before continuing. Use the information to pre-fill answers and make better recommendations in subsequent steps.

### Group 1 — The Project

Ask:
- What are you building? (a brief description — one or two sentences is fine)
- What would you like to call your project? (this will be the folder name on your computer — suggest using lowercase with dashes, like `my-cool-app`)

### Group 2 — Tech Stack

Ask:
- Which backend framework do you want to use?
  - **Laravel (PHP)** — The most popular web framework, massive ecosystem, best for web apps. **(Recommended)**
  - **Ruby on Rails** — Convention over configuration, great for rapid prototyping.
  - **NestJS (Node.js/TypeScript)** — TypeScript-first, modern, great if you already know JavaScript.
- Do you need a React frontend? (yes/no — if you're not sure, say no; you can add it later)

### Group 3 — Git & Collaboration

Ask:
- What is your name and email for git? (this goes on your commits — e.g., "Jane Doe" and "jane@example.com")
- Can AI commit code using its own name? (e.g., "Rhino AI <ai@rhino-project.org>") Or should all commits use your name?
- Can AI push code to a remote repository? Or should it only commit locally and let you push?
- Which release strategy would you like?
  - **Rhino standard** — We create `release/v*` branches and merge to main when ready. **(Recommended)**
  - **Trunk-based** — Everything goes directly to main.
  - **Custom** — Describe how you want it done.

### Group 4 — Features

Explain each feature before asking. Use simple language.

Ask:
- Do you need **multi-tenancy**?
  Multi-tenancy means multiple companies or organizations share the same application, but each can only see their own data. For example, if Company A and Company B both use your app, Company A's employees will never see Company B's data — it's completely isolated. This is essential if you're building a B2B SaaS where different companies sign up and have their own teams. (yes/no)

- Do you need an **invitation system**?
  The invitation system lets existing users invite other people to join their organization via email. The invited person receives a link with a secure token, and when they click it, they join the organization with a specific role (admin, editor, viewer, etc.). This is how most SaaS apps handle team onboarding. (yes/no)

- Do you need an **audit trail**?
  Audit trail automatically records every change made to your data — who changed what field, when they changed it, and what the old and new values were. Think of it as a complete history log. This is critical for compliance (LGPD, SOC2, HIPAA), debugging production issues, and understanding exactly what happened when something goes wrong. (yes/no)

- Do you need **role-based access control**?
  This means different users have different levels of access. For example, an admin can do everything, an editor can create and update but not delete, and a viewer can only read. Each role sees different fields — a viewer might not see financial data that an admin can see. Rhino makes this automatic through policies. (yes/no — recommended: yes)

Store all answers in memory for use in subsequent steps. Summarize what you understood back to the user before proceeding.

---

## Step 2: Install Requirements

Tell the user: "Let me check what's already installed on your machine and set up anything that's missing."

Check what is installed and install what is missing based on the chosen framework.

### For Laravel (PHP)

```bash
# Check PHP
php --version || echo "PHP not found"

# Check Composer
composer --version || echo "Composer not found"

# Install PHP if missing (macOS)
brew install php

# Install Composer if missing
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php --install-dir=/usr/local/bin --filename=composer
php -r "unlink('composer-setup.php');"
```

### For Rails (Ruby)

```bash
# Check Ruby
ruby --version || echo "Ruby not found"

# Check Bundler
bundle --version || echo "Bundler not found"

# Install Ruby if missing (macOS)
brew install ruby

# Install Bundler
gem install bundler
```

### For NestJS (Node.js)

```bash
# Check Node.js
node --version || echo "Node.js not found"

# Check npm
npm --version || echo "npm not found"

# Install Node.js if missing (macOS)
brew install node
```

**Always verify each installation succeeds before proceeding.** If `brew` is not available, check if the platform is Linux and suggest `apt` or `dnf`, or point the user to the official download page.

Tell the user what was installed (or that everything was already set up) before moving on.

---

## Step 3: Create Project

Tell the user: "Now I'm going to create your project. This will set up the folder structure, configuration files, and everything the framework needs."

### Laravel

```bash
composer create-project laravel/laravel {project-name}
cd {project-name}
```

### Rails

```bash
rails new {project-name} --api --database=postgresql
cd {project-name}
```

### NestJS

```bash
npm i -g @nestjs/cli
nest new {project-name} --package-manager npm
cd {project-name}
```

After creating the project, confirm to the user that the project was created successfully and tell them the directory path.

---

## Step 4: Git Setup

Tell the user: "Setting up version control so we can track every change to your project."

```bash
git init
git config user.name "{user's git name}"
git config user.email "{user's git email}"
```

The framework already created a `.gitignore`, so we do not need to create one.

Create the initial commit:

```bash
git add -A
git commit -m "Initial project setup with {framework}"
```

If the user chose Rhino standard release strategy, create the release branch:

```bash
git checkout -b release/v0.1.0
```

Tell the user: "Git is set up. Your first commit is in, and we're on the `release/v0.1.0` branch." (Or `main` if using trunk-based.)

---

## Step 5: Install Rhino

Tell the user: "Now for the exciting part — installing Rhino. This gives your project automatic REST APIs, authentication, authorization, and more."

### Laravel

```bash
composer require rhino-project/rhino-laravel:^4.0
php artisan rhino:install --multi-tenant={yes|no} --invitations={yes|no} --audit-trail={yes|no}
php artisan migrate
```

### Rails

```bash
bundle add rhino-rails -v "~> 4.0"
rails rhino:install
rails db:migrate
```

### NestJS

```bash
npm install @rhino-dev/rhino-nestjs@^4.0
npx rhino install
npx prisma migrate deploy
```

If the user requested a React frontend:

```bash
# In the frontend directory or a separate React project
npm install @rhino-dev/rhino-react@^4.0 @tanstack/react-query axios
```

Tell the user what was installed and confirm the database was migrated.

---

## Step 6: Install Skills

Tell the user: "I'm installing 13 AI-powered skills into your project. These are slash commands you can run anytime to build features, fix bugs, review code, and more."

Create the `.claude/commands/` directory and write all skill files:

```bash
mkdir -p .claude/commands
```

Write the following skill files. ALWAYS overwrite existing files (skills may have been updated):

### .claude/commands/rhino-feature.md

Write the full `/rhino:feature` skill that implements a complete feature end-to-end. It should:
- Ask what feature to build
- Create the migration, model, factory, policy, scope, tests, and seeder
- Register the model in Rhino config
- Run migrations and tests
- Follow all Rhino conventions from the reference section below

### .claude/commands/rhino-bugfix.md

Write the full `/rhino:bugfix` skill that diagnoses and fixes bugs using TDD. It should:
- Ask the user to describe the bug
- Reproduce it with a failing test
- Fix the code
- Confirm all tests pass

### .claude/commands/rhino-review.md

Write the full `/rhino:review` skill that reviews code for security and quality. It should:
- Check for missing policies, scopes, and validation
- Check for N+1 queries
- Check for missing tests
- Report findings with severity levels

### .claude/commands/rhino-audit.md

Write the full `/rhino:audit` skill that performs a complete security audit. It should:
- Check all models for proper traits
- Check all policies for proper authorization
- Check for SQL injection, mass assignment, and CSRF
- Generate a security report

### .claude/commands/rhino-plan.md

Write the full `/rhino:plan` skill that plans a feature before building it. It should:
- Ask what to build
- Identify affected models, policies, and scopes
- List files to create and modify
- Estimate complexity
- Output a step-by-step plan

### .claude/commands/rhino-model.md

Write the full `/rhino:model` skill that creates a single model with all Rhino conventions. It should:
- Ask for model details (name, fields, relationships)
- Create migration, model, factory, policy, scope
- Register in Rhino config
- Run migration

### .claude/commands/rhino-policy.md

Write the full `/rhino:policy` skill that generates or updates a policy. It should:
- Ask which model
- Ask about role-based permissions
- Generate or update the policy class
- Add hidden columns logic if needed

### .claude/commands/rhino-scope.md

Write the full `/rhino:scope` skill that creates a custom scope. It should:
- Ask which model
- Ask what data filtering rules to apply
- Generate the scope class
- Register it with the model

### .claude/commands/rhino-refactor.md

Write the full `/rhino:refactor` skill that refactors code into Rhino patterns. It should:
- Scan for code that does not follow Rhino conventions
- Suggest and apply refactoring
- Ensure tests still pass

### .claude/commands/rhino-test.md

Write the full `/rhino:test` skill that generates tests for existing code. It should:
- Ask which model or feature to test
- Generate feature tests for all CRUD operations
- Include role-based permission tests
- Include hidden column tests
- Run the tests

### .claude/commands/rhino-migrate.md

Write the full `/rhino:migrate` skill that creates migrations. It should:
- Ask what to change (add column, create table, modify column)
- Generate the migration
- Update the model if needed
- Run the migration

### .claude/commands/rhino-deploy.md

Write the full `/rhino:deploy` skill that runs a pre-deploy checklist. It should:
- Run all tests
- Check for pending migrations
- Check for environment variables
- Check for debug mode
- Generate a deploy report

### .claude/commands/rhino-docs.md

Write the full `/rhino:docs` skill that generates API documentation. It should:
- Scan all registered models
- Document all endpoints, filters, sorts, and includes
- Document authentication requirements
- Output markdown documentation

Tell the user when all skills are installed.

---

## Step 7: Create Project Context

Tell the user: "Finally, I'm creating a project context file so that every AI conversation knows about your project setup."

Create `.claude/CLAUDE.md` with:

```markdown
# {Project Name}

{User's project description}

## Stack
- **Backend:** {Framework} with Rhino
- **Frontend:** {React if selected, or "API only"}
- **Database:** {PostgreSQL/SQLite based on framework}

## Git Conventions
- **Committer:** {User name or "Rhino AI <ai@rhino-project.org>"}
- **Can push:** {yes/no}
- **Release strategy:** {chosen strategy}
- **Branch:** {current branch name}

## Rhino Features Enabled
- Multi-tenancy: {yes/no}
- Invitations: {yes/no}
- Audit trail: {yes/no}

## Available Skills
Run these commands in Claude Code:
- `/rhino:feature` — Add a new feature end-to-end (model, migration, policy, tests)
- `/rhino:bugfix` — Diagnose and fix a bug with TDD
- `/rhino:review` — Review code for security and quality issues
- `/rhino:audit` — Full security audit
- `/rhino:plan` — Plan a feature before building
- `/rhino:model` — Add a single model with all Rhino conventions
- `/rhino:policy` — Generate or update a policy
- `/rhino:scope` — Add a custom scope
- `/rhino:refactor` — Refactor AI-generated code into Rhino patterns
- `/rhino:test` — Generate tests for existing code
- `/rhino:migrate` — Create a migration and update model
- `/rhino:deploy` — Pre-deploy checklist
- `/rhino:docs` — Generate API documentation
```

Create a commit:

```bash
git add -A
git commit -m "Install Rhino with skills and project configuration"
```

Present a summary to the user:

```
Project created: {project-name}
Framework: {framework}
Rhino installed with {features enabled}
Database migrated
Git configured ({strategy} strategy)
13 AI skills installed
Project context created

You're ready to build! Try running: /rhino:feature
```

---

## Rhino Complete Reference

The following is the complete Rhino framework reference. All skills use this information.

### Architecture Overview

Rhino is an automatic REST API generation framework. Models are registered in a config file and routes are auto-generated — zero controller code required. Authorization uses a three-layer system:

1. **Policy** (action authorization) — determines if a user can perform a given action (viewAny, view, create, update, delete, viewTrashed, restore, forceDelete)
2. **Policy.hiddenColumns** (column visibility) — determines which columns are hidden from the JSON response based on the authenticated user's role
3. **Scope** (data filtering) — filters which records a user can see based on their role or other criteria

### Request Lifecycle

```
Request
  -> Middleware (auth, rate limiting, etc.)
  -> Policy (can the user perform this action?)
  -> Scope (which records can they see?)
  -> Query Builder (filters, sorts, search, includes, field selection, pagination)
  -> Serialization
  -> Hidden Columns (strip fields the user's role cannot see)
  -> JSON Response
```

### Packages

| Platform | Package | Install Command |
|----------|---------|-----------------|
| Laravel | `rhino-project/rhino-laravel` | `composer require rhino-project/rhino-laravel:^4.0` |
| Rails | `rhino-rails` | `bundle add rhino-rails -v "~> 4.0"` |
| NestJS | `@rhino-dev/rhino-nestjs` | `npm install @rhino-dev/rhino-nestjs@^4.0` |
| React | `@rhino-dev/rhino-react` | `npm install @rhino-dev/rhino-react@^4.0` |

### Feature Summary (28 features)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Automatic CRUD Endpoints** | Generates index, show, store, update, destroy for every registered model — zero controller code |
| 2 | **Authentication** | Built-in login, logout, password recovery and reset via Sanctum |
| 3 | **Authorization & Policies** | ResourcePolicy base class with convention-based permission checks (`{slug}.{action}`). Wildcards supported |
| 4 | **Role-Based Access Control (layered)** | Shared per-org role layer (`org_role_permissions`) + per-user `granted_permissions`/`denied_permissions` deltas; `effective = (role ∪ granted) − denied`, deny wins. Wildcards on every layer. |
| 5 | **Attribute-Level Permissions** | Control which fields each role can read and write |
| 6 | **Validation** | Dual-layer: format rules + field presence rules. Supports role-keyed rules |
| 7 | **Cross-Tenant FK Validation** | `exists:` rules auto-scoped to current organization |
| 8 | **Filtering** | `?filter[field]=value` with AND/OR logic |
| 9 | **Sorting** | `?sort=field` or `?sort=-field`, supports multiple fields |
| 10 | **Full-Text Search** | `?search=term` across `allowedSearch` fields |
| 11 | **Pagination** | `?page=N&per_page=N` with metadata headers |
| 12 | **Field Selection** | `?fields[posts]=id,title` to reduce payload |
| 13 | **Eager Loading** | `?include=user,comments` with nested support and count/exists |
| 14 | **Multi-Tenancy** | Organization-based data isolation via BelongsToOrganization trait |
| 15 | **Nested Ownership** | Auto-detection by walking BelongsTo chains to the organization |
| 16 | **Route Groups** | Multiple URL prefixes with different middleware and auth |
| 17 | **Soft Deletes** | Trash, restore, force-delete with separate permissions |
| 18 | **Audit Trail** | HasAuditTrail logs all CRUD events with old and new values |
| 19 | **Nested Operations** | Atomic multi-model transactions with `$N.field` references |
| 20 | **Invitations** | Token-based invitation system for organizations |
| 21 | **Hidden Columns** | Base + model-level + policy-level dynamic hiding per role |
| 22 | **Auto-Scope Discovery** | HasAutoScope trait auto-registers scopes by naming convention |
| 23 | **UUID Primary Keys** | HasUuid trait for auto-generated UUID PKs |
| 24 | **Middleware Support** | Global and per-action middleware on models |
| 25 | **Action Exclusion** | `exceptActions` to disable specific CRUD routes |
| 26 | **Generator CLI** | `rhino:install`, `rhino:generate`, `rhino:export-postman` |
| 27 | **Postman Export** | Auto-generated Postman Collection v2.1 |
| 28 | **Blueprint** | YAML to policies, tests, seeders. Deterministic, zero AI tokens |

### API URL Pattern

```
GET    /api/{org}/{model}              -> index (list all)
GET    /api/{org}/{model}/{id}         -> show (get one)
POST   /api/{org}/{model}              -> store (create)
PUT    /api/{org}/{model}/{id}         -> update
DELETE /api/{org}/{model}/{id}         -> destroy (soft delete)
GET    /api/{org}/{model}/trashed      -> list soft-deleted
POST   /api/{org}/{model}/{id}/restore -> restore soft-deleted
DELETE /api/{org}/{model}/{id}/force   -> permanent delete
GET    /api/{org}/{model}/{id}/audit   -> audit log for record
POST   /api/{org}/nested-operations    -> atomic multi-model transaction
```

### Laravel Model Structure

Every Rhino model needs these traits:

```php
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Rhino\Traits\HasValidation;
use Rhino\Traits\HidableColumns;
```

Optional traits (add based on project needs):

- `Rhino\Traits\BelongsToOrganization` — direct multi-tenancy (model has `organization_id`)
- `Rhino\Traits\HasAuditTrail` — automatic audit logging of all changes
- `Rhino\Traits\HasAutoScope` — auto-discovers scope classes by naming convention
- `Rhino\Traits\HasUuid` — UUID primary keys instead of auto-increment
- `Rhino\Traits\HasPermissions` — adds `hasPermission()` to User model

### Required Model Properties

```php
// Mass-assignable fields
protected $fillable = ['title', 'body', 'status'];

// Validation rules (format layer)
protected $validationRules = [
    'title' => 'required|string|max:255',
    'body'  => 'required|string',
    'status' => 'in:draft,published,archived',
];

// Which fields are required when CREATING (presence layer)
protected $validationRulesStore = ['title', 'body'];

// Which fields are required when UPDATING (presence layer)
protected $validationRulesUpdate = ['title'];

// Query builder configuration
protected static allowedFilters  = ['status', 'category_id'];
protected static allowedSorts    = ['title', 'created_at'];
protected static defaultSort     = '-created_at';
protected static allowedFields   = ['id', 'title', 'body'];
protected static allowedIncludes = ['author', 'comments'];
protected static allowedSearch   = ['title', 'body'];
```

### Role-Based Validation

When different roles can edit different fields:

```php
protected $validationRulesStore = [
    'admin'  => ['title' => 'required', 'body' => 'required', 'featured' => 'nullable'],
    'editor' => ['title' => 'required', 'body' => 'required'],
    '*'      => ['title' => 'required', 'body' => 'required'],
];
```

Fields not listed for a role are silently stripped from the request. This is a security feature that prevents unauthorized field modification.

### Policies

Policies control who can do what. They extend the `ResourcePolicy` base class:

```php
namespace App\Policies;

use Rhino\Policies\ResourcePolicy;
use Illuminate\Contracts\Auth\Authenticatable;

class PostPolicy extends ResourcePolicy
{
    // Override any action to add custom logic
    public function delete(?Authenticatable $user, $model): bool
    {
        // Must pass parent check AND be the author
        return parent::delete($user, $model)
            && $user->id === $model->author_id;
    }

    // Control which columns are hidden per role
    public function hiddenColumns(?Authenticatable $user): array
    {
        $org = request()->get('organization');
        $isAdmin = $user?->rolesInOrganization($org)
            ->where('slug', 'admin')->exists();

        return $isAdmin ? [] : ['internal_notes', 'cost'];
    }

    // Control which attributes are visible in show responses
    public function permittedAttributesForShow(?Authenticatable $user): array
    {
        $org = request()->get('organization');
        $roleSlug = $user?->getRoleSlugForValidation($org);

        if ($roleSlug === 'admin') return ['*'];
        return ['id', 'title', 'status'];
    }

    // Control which attributes can be set during creation
    public function permittedAttributesForCreate(?Authenticatable $user): array
    {
        return ['title', 'total_value', 'status'];
    }

    // Control which attributes can be set during update
    public function permittedAttributesForUpdate(?Authenticatable $user): array
    {
        return ['title', 'status'];
    }
}
```

### Scopes

Scopes filter which records a user can see. They implement the `Scope` interface:

```php
namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class PostScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $user = auth('sanctum')->user();
        if (!$user) return;

        $org = request()->get('organization');
        $roleSlug = $user->getRoleSlugForValidation($org);

        // Non-admins can only see published posts
        if ($roleSlug !== 'admin') {
            $builder->where('is_published', true);
        }
    }
}
```

### Config Registration (Laravel)

Register your models in `config/rhino.php`:

```php
return [
    'models' => [
        'posts' => \App\Models\Post::class,
        'blogs' => \App\Models\Blog::class,
    ],

    'public' => [],

    'multi_tenant' => [
        'enabled' => true,
        'use_subdomain' => false,
        'organization_identifier_column' => 'slug',
        'middleware' => \Rhino\Http\Middleware\ResolveOrganizationFromRoute::class,
    ],

    'invitations' => [
        'expires_days' => 7,
        'allowed_roles' => null,
    ],

    'nested' => [
        'path' => 'nested',
        'max_operations' => 50,
        'allowed_models' => null,
    ],
];
```

### Config Registration (Rails)

```ruby
# config/initializers/rhino.rb
Rhino.configure do |c|
  c.model :posts, 'Post'
  c.model :blogs, 'Blog'
end
```

### Config Registration (NestJS)

```typescript
// src/rhino.config.ts
import { defineConfig } from '@rhino-dev/rhino-nestjs'

export default defineConfig({
  models: {
    posts: () => import('#models/post'),
    blogs: () => import('#models/blog'),
  },
})
```

### React Client Hooks

```typescript
import {
  configureApi,
  useAuth,
  useModelIndex,
  useModelShow,
  useModelStore,
  useModelUpdate,
  useModelDelete,
} from '@rhino-dev/rhino-react';

// Setup — call once at app initialization
configureApi({ baseURL: import.meta.env.VITE_API_URL });

// Authentication
const {
  token,
  isAuthenticated,
  login,
  logout,
  setOrganization,
} = useAuth();

// CRUD operations
const { data: posts } = useModelIndex('posts', {
  page: 1,
  perPage: 20,
  filters: { status: 'published' },
  sort: '-created_at',
});

const { data: post } = useModelShow('posts', postId);
const createPost = useModelStore('posts');
const updatePost = useModelUpdate('posts');
const deletePost = useModelDelete('posts');

// Soft deletes
import {
  useModelTrashed,
  useModelRestore,
  useModelForceDelete,
} from '@rhino-dev/rhino-react';

// Nested operations (atomic multi-model transactions)
import { useNestedOperations } from '@rhino-dev/rhino-react';
```

### Testing Conventions

Every code change MUST include tests. Use Pest (Laravel default) or the framework's test runner.

```php
uses(RefreshDatabase::class);

// Helper to create an authenticated user with specific permissions
function createAuthenticatedUser(
    array $permissions = ['*'],
    ?Organization $org = null
): array {
    $org = $org ?? Organization::factory()->create();
    $user = User::factory()->create();
    $role = Role::factory()->create(['permissions' => $permissions]);

    UserRole::factory()->create([
        'user_id' => $user->id,
        'role_id' => $role->id,
        'organization_id' => $org->id,
    ]);

    $token = $user->createToken('test')->plainTextToken;
    return [$user, $org, $token];
}

// Test: forbidden when lacking permission
it('returns 403 when viewer tries to update', function () {
    [$user, $org, $token] = createAuthenticatedUser([
        'posts.index',
        'posts.show',
    ]);
    $post = Post::factory()->create(['organization_id' => $org->id]);

    $this->withHeaders(['Authorization' => "Bearer $token"])
        ->putJson("/api/{$org->slug}/posts/{$post->id}", ['title' => 'x'])
        ->assertForbidden();
});

// Test: hidden columns are enforced
it('hides total_value from viewers', function () {
    [$user, $org, $token] = createAuthenticatedUser([
        'invoices.index',
        'invoices.show',
    ]);
    $invoice = Invoice::factory()->create([
        'organization_id' => $org->id,
    ]);

    $response = $this->withHeaders(['Authorization' => "Bearer $token"])
        ->getJson("/api/{$org->slug}/invoices/{$invoice->id}")
        ->assertOk();

    expect($response->json())->not->toHaveKey('total_value');
});

// Test: scope filters data correctly
it('non-admin only sees published posts', function () {
    [$user, $org, $token] = createAuthenticatedUser([
        'posts.index',
    ]);

    Post::factory()->create([
        'organization_id' => $org->id,
        'is_published' => true,
    ]);
    Post::factory()->create([
        'organization_id' => $org->id,
        'is_published' => false,
    ]);

    $response = $this->withHeaders(['Authorization' => "Bearer $token"])
        ->getJson("/api/{$org->slug}/posts")
        ->assertOk();

    expect($response->json('data'))->toHaveCount(1);
});
```

### Blueprint System (YAML)

Blueprints let you define a model declaratively and generate all files at once — no AI tokens needed:

```yaml
# .rhino/blueprints/contracts.yaml
model: Contract
table: contracts
tenant: direct

columns:
  title:
    type: string
    required: true
  total_value:
    type: decimal
    precision: 10
    scale: 2
    nullable: true
  status:
    type: enum
    values: [draft, active, expired]
    default: draft

relationships:
  belongsTo: [Organization]

roles:
  admin:
    actions: '*'
    visible: '*'
    editable: [title, total_value, status]
  manager:
    actions: [index, show, store, update]
    visible: [title, status]
    editable: [title, status]
  viewer:
    actions: [index, show]
    visible: [title, status]
    editable: []
```

Run the generator:

```bash
php artisan rhino:blueprint
```

This creates: model, migration, factory, policy, scope, tests, and seeder — all following Rhino conventions.

### Complete Model Example

Here is a full example of a properly configured Rhino model:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Rhino\Traits\HasValidation;
use Rhino\Traits\HidableColumns;
use Rhino\Traits\BelongsToOrganization;
use Rhino\Traits\HasAuditTrail;
use Rhino\Traits\HasAutoScope;

class Contract extends Model
{
    use HasFactory;
    use SoftDeletes;
    use HasValidation;
    use HidableColumns;
    use BelongsToOrganization;
    use HasAuditTrail;
    use HasAutoScope;

    protected $fillable = [
        'title',
        'counterparty_name',
        'total_value',
        'status',
        'start_date',
        'end_date',
        'organization_id',
    ];

    protected $casts = [
        'total_value' => 'decimal:2',
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    // Validation rules (format)
    protected $validationRules = [
        'title' => 'required|string|max:255',
        'counterparty_name' => 'required|string|max:255',
        'total_value' => 'nullable|numeric|min:0',
        'status' => 'in:draft,active,expired,terminated',
        'start_date' => 'required|date',
        'end_date' => 'nullable|date|after:start_date',
        'organization_id' => 'required|exists:organizations,id',
    ];

    // Fields required on create
    protected $validationRulesStore = [
        'title',
        'counterparty_name',
        'start_date',
    ];

    // Fields that can be sent on update
    protected $validationRulesUpdate = [
        'title',
        'status',
    ];

    // Query builder config
    protected static allowedFilters  = ['status', 'counterparty_name'];
    protected static allowedSorts    = ['title', 'total_value', 'start_date', 'created_at'];
    protected static defaultSort     = '-created_at';
    protected static allowedFields   = ['id', 'title', 'counterparty_name', 'total_value', 'status', 'start_date', 'end_date'];
    protected static allowedIncludes = ['organization', 'clauses'];
    protected static allowedSearch   = ['title', 'counterparty_name'];

    // Columns hidden at the model level (always hidden)
    protected static $baseHiddenColumns = ['internal_notes'];

    // Relationships
    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function clauses(): HasMany
    {
        return $this->hasMany(Clause::class);
    }
}
```

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Model | PascalCase singular | `Contract`, `UserRole` |
| Table | snake_case plural | `contracts`, `user_roles` |
| Migration | `create_{table}_table` | `create_contracts_table` |
| Factory | `{Model}Factory` | `ContractFactory` |
| Policy | `{Model}Policy` | `ContractPolicy` |
| Scope | `{Model}Scope` | `ContractScope` |
| Config key | kebab-case plural | `contracts`, `user-roles` |
| API endpoint | `/{org}/{config-key}` | `/acme/contracts` |
| Permission | `{config-key}.{action}` | `contracts.index`, `contracts.store` |

### Permission Actions

The standard CRUD actions map to these permission slugs:

| Action | Permission | HTTP |
|--------|-----------|------|
| List | `{model}.index` | GET /api/{org}/{model} |
| View | `{model}.show` | GET /api/{org}/{model}/{id} |
| Create | `{model}.store` | POST /api/{org}/{model} |
| Update | `{model}.update` | PUT /api/{org}/{model}/{id} |
| Delete | `{model}.destroy` | DELETE /api/{org}/{model}/{id} |
| View Trashed | `{model}.viewTrashed` | GET /api/{org}/{model}/trashed |
| Restore | `{model}.restore` | POST /api/{org}/{model}/{id}/restore |
| Force Delete | `{model}.forceDelete` | DELETE /api/{org}/{model}/{id}/force |

A wildcard `*` grants all permissions. A model-scoped wildcard `contracts.*` grants all contract permissions.

### Multi-Tenancy

Models with `BelongsToOrganization` trait are automatically scoped to the organization in the URL. The organization is resolved from the `{org}` slug in the route.

For models that do not directly belong to an organization but belong to a model that does (nested ownership), Rhino walks the BelongsTo chain automatically. For example, if `Clause` belongs to `Contract` and `Contract` belongs to `Organization`, the clause is automatically scoped to the correct organization.

### Nested Operations

Nested operations allow atomic multi-model transactions:

```json
POST /api/{org}/nested-operations
{
  "operations": [
    {
      "operation": "store",
      "model": "contracts",
      "data": { "title": "Service Agreement" },
      "alias": "$1"
    },
    {
      "operation": "store",
      "model": "clauses",
      "data": {
        "contract_id": "$1.id",
        "title": "Payment Terms"
      }
    }
  ]
}
```

All operations run inside a database transaction. If any fails, everything is rolled back.

### Generator CLI Commands

```bash
# Full installation
php artisan rhino:install

# Generate model + migration + factory + policy + tests
php artisan rhino:generate Contract

# Export Postman collection
php artisan rhino:export-postman

# Generate from blueprint YAML
php artisan rhino:blueprint
```

### Checklist for Every New Model

When creating a new model, ensure all of these are done:

1. Migration created and run
2. Model class with required traits and properties
3. Factory for test data
4. Policy with proper authorization and hidden columns
5. Scope if data filtering is needed
6. Model registered in `config/rhino.php`
7. Feature tests for all CRUD operations
8. Tests for role-based permissions
9. Tests for hidden columns
10. Tests for scope filtering
