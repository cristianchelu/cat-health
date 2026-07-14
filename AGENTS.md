# Pet Assistant - Codebase Context

## Project Overview

This is a **Pet Assistant** application focused on cat health monitoring through smart litterbox analysis. The project is a monorepo with two main packages:

- **API** (`packages/api`): Fastify-based TypeScript backend with SQLite database
- **UI** (`packages/ui`): React + TypeScript frontend with Vite

## Architecture

### Backend (`packages/api`)

- **Framework**: Fastify with TypeBox for schema validation
- **Database**: SQLite with Kysely query builder
- **TypeScript**: Native TypeScript execution with `--experimental-strip-types`
- **Structure**:
  - `src/main.ts` - Server entry point
  - `src/routes/` - API route handlers (pets, events, devices)
  - `src/database/` - Database configuration, migrations, and types
  - `data/database.sqlite` - SQLite database file

### Frontend (`packages/ui`)

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **State Management**: TanStack Query for server state
- **Charts / metrics**: Custom SVG and layout components (no Chart.js)
- **Icons**: Lucide React + React Icons

## Code Standards & Patterns

### Date & Timezone

**NEVER** use `new Date().toISOString().split('T')[0]` or `date.toISOString().split('T')[0]` to obtain a local calendar date string. `toISOString()` returns UTC, which will produce the wrong calendar date for users in positive UTC offsets during the hours around midnight.

**ALWAYS** use one of:

- `format(date, 'yyyy-MM-dd')` from `date-fns` (uses local time)
- `createDayRange(date?)` from `@/lib/utils` when you need a full `DateRange` for a single day

### Regional formatting (display)

**NEVER** format user-visible dates, times, or grouped numbers with raw `format(…, 'HH:mm')`, `Intl.NumberFormat(undefined)`, or hardcoded locales in components.

**ALWAYS** use `useFormatters()` from `@/contexts/RegionalPreferencesProvider` for display formatting. Calendar math (`yyyy-MM-dd` ranges, API query windows) uses `date-fns` + `useRegionalPreferences().timezone` — not display prefs.

### CSS Architecture

**IMPORTANT**: We prioritize native, semantic CSS with minimal inline styles. NO FUCKING TAILWIND.

#### CSS File Structure

Every component MUST have a corresponding CSS file:

```tsx
// MyComponent.tsx
import "./MyComponent.css";
return (
  <div className="my-component">
    <a className="some-class" />
  </div>
);
```

```css
/* MyComponent.css */
.my-component {
  /* Component styles */

  .some-class {
    /* Nested element styles */
    &:disabled {
      /* Pseudo-selector styles */
    }
    @media (max-width: 768px) {
      /* Responsive styles close by the affected class */
    }
  }
}
```

**ALWAYS use CSS variables** from `packages/ui/src/theme.css` instead of hardcoding values.
**ALWAYS use CSS nesting** with one single top-level classname that contains everything else.

### Component Architecture

#### TypeScript Component Pattern

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ComponentName.css";

interface ComponentNameProps extends React.ComponentProps<"div"> {
  variant?: "default" | "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  customProp?: string;
}

const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      customProp,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn("component-name", variant, size, className)}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ComponentName.displayName = "ComponentName";

export { type ComponentNameProps };
export default ComponentName;
```

- Define utility functions outside the component whenever they don't depend on props or state.
- Avoid typecasting unless absolutely necessary.
- Avoid `any` unless absolutely necessary.

#### Utility Functions

- Use `cn()` from `@/lib/utils` for conditional class names
- Reuse generic unknown-shape helpers from `@/lib/utils` (for example `isRecord()` and `getStringValue()`) instead of redefining local copies.
- Always forward refs for reusable components
- Export both component and prop types

#### UI copy

**UI copy — keep it quiet.** Default surfaces show label, value, and actions only. Do not add helper text, footnotes, or "why this matters" paragraphs unless the user explicitly asks or the interaction is genuinely non-obvious. Explanations belong in edit/confirm flows or docs — not stacked under every read-only field.

### API Patterns

- Use TypeBox for request/response validation
- Organize routes by resource (e.g., pets, events)

#### Types

- Derive types using TypeBox Static<> for DTOs
- Derive db types using Kysely
- Define interfaces and types in `src/types/` and reuse them when possible.
- Always search for existing types before creating new ones.
- Avoid typecasting unless absolutely necessary.
- Avoid `any` unless absolutely necessary.

#### Route Structure

```typescript
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { db } from "../database/index.ts";

// Schema definitions
const GetEntitySchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  // ... other properties
});

const entityRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        response: {
          "200": Type.Array(GetEntitySchema),
        },
      },
    },
    async () => {
      return await db.selectFrom("entity").selectAll().execute();
    },
  );

  // ... other routes
}
export default const entityRoutes;
```

#### Database Patterns

- Use Kysely query builder for type-safe SQL
- Define table types in `src/database/types/`
- Handle migrations in `src/database/migrations/`
- Use TypeBox for API schema validation

#### Query performance (potato hardware)

**Assume potato hardware.** This app runs on Raspberry Pis and other low-end hosts — not just dev laptops. Micro-lags compound: sequential awaits, N+1 queries, and extra HTTP hops that feel "free" locally add up fast under real load.

**Default patterns:**

- **Independent reads** → `Promise.all` (e.g. parent row + child rows when both keys are known upfront). Never await sequentially out of habit.
- **Related rows for many parents** → one batched query (`WHERE parent_id IN (...)`), then group in JS. Never loop-query per row.
- **API shape** → embed small related payloads (e.g. `children[]` on single-resource GET) instead of a second round-trip when the row count is tiny (0–2).
- **Lists** → paginate flat; if nested relations are needed, batch-fetch for the page — not N+1 per item.

SQLite is in-process, so JOIN vs two parallel queries is usually a wash for single-row lookups; prefer whichever keeps handler code simple. The win is avoiding _sequential_ chains and _N+1_ loops, not JOIN theology.

#### Device providers and integration boundary

External integrations (ESPHome, SurePet, inference, cameras, etc.) follow a **provider-agnostic wrapper** with the smallest blast radius: vendor-specific HTTP, auth, and payload shapes live under `packages/api/src/services/devices/providers/<name>/` only. Routes, shared DTOs, and UI must not grow per-provider snowflakes (no `/accounts/:id/<vendor>/…` endpoints, no `useSurePet*` hooks, no `provider === 'surepet'` feature gates).

**Composable surface (shared + routes):**

- **Capabilities** on each `DeviceProvider` and returned by `GET /devices/providers` — UI and wizards branch on flags (`supports_discovery`, `supports_pet_linking`, `skip_discovery`, `supported_device_types`, etc.), not hardcoded provider names.
- **Generic account actions** — e.g. `GET /devices/accounts/:id/discover`, `GET /devices/accounts/:id/remote-pets`; the route resolves the account manager and calls optional methods (`discoverDevices`, `listRemotePets`) without checking `account.provider`.
- **Normalized linking** — `ProviderRemotePet` / `ProviderPetLink` in `packages/shared/src/schemas/api/integrations.ts`; persisted links use `external_pet_id` and opaque `metadata` (e.g. tag IDs). Providers map to/from their cloud API inside the provider package only.
- **Lifecycle hooks** on `AccountManager` when needed (e.g. `onDeviceRegistered`) instead of provider checks in route handlers.

**Where provider-specific code is allowed:** provider package implementation, provider-scoped config/state schemas in shared when needed for validation (e.g. `surepet.ts` account credentials), provider-named UI **flow** modules under `packages/ui/.../flows/<provider>/` for registration forms only — not for transport types or API paths. Event `provider_data` may stay discriminated by provider for dedup/ingest; do not mirror that in generic settings or list APIs.

**Provider state siloing (UI):** Only **provider-specific UI modules** may import provider-scoped shared schemas (e.g. `SureFeederState` from `surepet.ts`) or parse `device.state` / account config internals. Generic device surfaces — list cards, detail page shells, settings lists — must stay ignorant of vendor field names and enum values.

- **Wire format:** `GetDeviceResponse.state` remains `Record<string, unknown>`. Live state from controllers should include a flat `provider` discriminant (same pattern as event `provider_data`), e.g. `{ provider: 'surepet', bowl_status, ... }`.
- **Parsing:** Provider UI owns helpers like `parseSurePetFeederState(state)` that check `state.provider` and map enums to labels. Do not cast `device.state as SureFeederState` in generic components.
- **Composition:** Use registries (e.g. `devicePageRegistry`, `deviceCardStatusRegistry`) keyed by `device.provider` + `device.type` to mount provider views. Registries import provider components; generic callers only call `resolveDevicePage(device)` / `resolveDeviceCardStatus(device)`.
- **Colocation:** Provider device UI lives under `packages/ui/src/pages/devices/components/<provider>/` (detail views, card status widgets, formatters). Registration wizards stay under `.../flows/<provider>/`.

When adding a new cloud provider, extend capabilities + optional `AccountManager` methods first; add a new generic route only if the capability is truly new and shared across future providers.

## Domain Context

### Core Entities

1. **Pets** - Cat profiles with basic information
2. **Devices** - Smart litterbox devices
3. **Events** - Litterbox usage events with sensor data

### Key Features

- **Litterbox Analytics**: Weight-based visit detection and analysis
- **Health Monitoring**: Tracking elimination patterns and weights
- **Data Visualization**: Charts for visit frequency, weight trends
- **Event Processing**: Raw sensor data analysis and pattern recognition

### Data Flow

1. Smart litterbox sensors generate raw weight data
2. Events are processed to detect visit phases (entry, elimination, exit)
3. Frontend visualizes patterns and trends
4. Manual verification and annotation capabilities

## Development Commands

### Root workspace

```bash
npm run test                    # All workspaces (see TESTING.md)
npm run test:unit               # Unit tests only
npm run test:integration        # API integration tests
```

### API (`packages/api`)

```bash
npm run start                   # Start dev server with watch mode
npm run migrate                 # Run database migrations
npm run reset-db               # Reset database and run migrations
```

### UI (`packages/ui`)

```bash
npm run start                   # Start Vite dev server
npm run build                   # Build for production
npm run lint                    # Run ESLint
npm run preview                 # Preview production build
```

## File Naming Conventions

- **Components**: PascalCase (`PetSummaryCard.tsx`)
- **CSS Files**: kebab-case matching component (`pet-summary-card.css`)
- **API Routes**: lowercase (`pets.ts`, `events.ts`)
- **Database Types**: PascalCase with Table suffix (`PetTable.ts`)
- **Utilities**: camelCase (`apiClient.ts`, `utils.ts`)

## Import Patterns

### Frontend

```typescript
// External libraries first
import React from "react";
import { useQuery } from "@tanstack/react-query";

// Internal imports with @ alias
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PetCard } from "@/components/pet/PetCard";

// CSS import last
import "./ComponentName.css";
```

### Backend

```typescript
// External libraries first
import { Type } from "@fastify/type-provider-typebox";

// Internal imports with relative paths
import { db } from "../database/index.ts";
```

## Dependencies Overview

### Shared

- **TypeScript**: Primary language for both frontend and backend
- **Node.js**: Runtime environment
- **Binary payloads** (`packages/shared/src/binary/`): versioned encode/decode for compact DB/network blobs (e.g. litterbox `raw_data`). Prefer `Uint8Array` APIs; API code may wrap with `Buffer` where needed.

### Backend Key Dependencies

- **Fastify**: Web framework
- **TypeBox**: Schema validation
- **Kysely**: SQL query builder
- **better-sqlite3**: SQLite driver

### Frontend Key Dependencies

- **React 19**: UI framework
- **TanStack Query**: Server state management
- **React Router v7**: Client-side routing
- **Custom charts**: SVG/CSS metric and signal views in components
- **Vite**: Build tool and dev server

## Theme & Design System

The application uses a comprehensive design system defined in `theme.css` with:

- **Dark/Light mode support** via `prefers-color-scheme`
- **Consistent color palette** for primary, secondary, success, warning, error states
- **Semantic spacing scale** from 2px to 64px
- **Typography scale** from 12px to 48px
- **Border radius** and **shadow** systems
- **Z-index layering** for modals, dropdowns, tooltips

Always reference these variables instead of hardcoding values to maintain design consistency and enable easy theming updates.

# General rules

- **Commit messages** — use Conventional Commits with a package scope: `type(scope): imperative subject` (e.g. `fix(ui): hide stale compartment selectors`). Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`. Scopes: `api`, `ui`, `shared`, or cross-cutting `docs` / `deps`. See [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages).
- **Testing** — see [TESTING.md](TESTING.md) for boundaries, harness usage, TDD workflow, and anti-patterns. Commands live in [CONTRIBUTING.md](CONTRIBUTING.md#tests).
- Any summary .md or explanation of changes MUST go in the `{root}/summaries/`
  folder, so as not to pollute the git history.
- Always assume Both the UI and API are running in the background when you want to run things.
  If you want to test something, ask the user.
- I repeat, no fucking tailwind. anywhere.
