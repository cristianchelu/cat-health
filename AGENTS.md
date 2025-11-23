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
- **Charts**: Chart.js with react-chartjs-2
- **Icons**: Lucide React + React Icons

## Code Standards & Patterns

### CSS Architecture

**IMPORTANT**: We prioritize native, semantic CSS with minimal inline styles.

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
- Always forward refs for reusable components
- Export both component and prop types

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
npm run test                    # Run tests
```

### API (`packages/api`)

```bash
npm run start                   # Start dev server with watch mode
npm run migrate                 # Run database migrations
npm run litterbox-migrate      # Run litterbox-specific migrations
npm run reset-db               # Reset database and run migrations
```

### UI (`packages/ui`)

```bash
npm run start                   # Start Vite dev server
npm run build                   # Build for production
npm run lint                    # Run ESLint
npm run preview                 # Preview production build
```

- Always assume Both the UI and API are running in the background when you want to run things.

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
import { Type } from '@fastify/type-provider-typebox';

// Internal imports with relative paths
import { db } from "../database/index.ts";
```

## Dependencies Overview

### Shared

- **TypeScript**: Primary language for both frontend and backend
- **Node.js**: Runtime environment

### Backend Key Dependencies

- **Fastify**: Web framework
- **TypeBox**: Schema validation
- **Kysely**: SQL query builder
- **better-sqlite3**: SQLite driver

### Frontend Key Dependencies

- **React 19**: UI framework
- **TanStack Query**: Server state management
- **React Router v7**: Client-side routing
- **Chart.js**: Data visualization
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

# Hygiene rules

- Any summary .md or explanation of changes MUST go in the `{root}/summaries/`
  folder, so as not to pollute the git history.