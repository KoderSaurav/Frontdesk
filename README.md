# Frontdesk

A customer support management application designed for tracking issues, calculating business-hour SLAs, handling concurrent ticket assignments, and maintaining tamper-proof audit histories.

---

## Architecture Overview

Frontdesk is built as a client-server web application with separation of concerns:

- **Frontend:** React application built with TypeScript, Tailwind CSS, and Vite. Implements a unified support queue, responsive ticket management workspace, dynamic countdown badges, and customer self-service views.
- **Backend:** Node.js service using Express and TypeScript. Implements business hours SLA calculations, atomic assignment locks, role-based message filtering, and append-only audit logging.
- **Database:** PostgreSQL with support for local instances, cloud-hosted databases (Neon / Vercel Postgres), and an automatic in-memory fallback for development environments.

---

## Key Technical Features

### 1. Working Hours SLA Calculation Engine
Support SLA deadlines are computed strictly within company operating hours:
- **Operating Schedule:** Monday through Friday, 09:30 to 18:30 (9 working hours / 540 minutes per day).
- **Non-Working Periods:** Weekends (Saturday and Sunday) and statutory festival holidays are excluded from SLA timers. If a ticket is submitted outside working hours (e.g., Friday at 18:00), only 30 minutes count toward the SLA on Friday, and the timer resumes Monday at 09:30.
- **Priority Tiers:**
  - `URGENT`: 2 working hours response deadline, resolution by end of current working day (18:30).
  - `MEDIUM`: 4.5 working hours response deadline (half working day), 3 working days resolution deadline.
  - `LOW`: 9 working hours response deadline (1 working day), 5 working days resolution deadline (1 working week).
- **Timer Pausing (`WAITING_FOR_CUSTOMER`):** When a ticket transitions to `WAITING_FOR_CUSTOMER`, the SLA countdown is suspended. When the customer submits a reply, the system calculates the exact working minutes paused and shifts the target deadlines forward accordingly.
- **Inactivity Auto-Closure:** Tickets remaining in `WAITING_FOR_CUSTOMER` for 1 working week (45 working hours) without customer activity are automatically closed by background evaluation.
- **Reopen Policy:** Resolved tickets can be reopened by the customer within 7 calendar days. Beyond this window, reopening is restricted, requiring a new ticket.
- **Midway Priority Recalculation:** When an agent updates ticket priority, the system calculates working minutes already consumed since creation, deducts them from the new priority's quota, and recalculates the deadline. If the consumed time exceeds the new quota, the ticket is immediately flagged as overdue.

### 2. Concurrency Safety on Ticket Assignment
To prevent race conditions where multiple agents attempt to claim the same unassigned ticket simultaneously:
- Ticket assignment uses an atomic conditional SQL update:
  ```sql
  UPDATE tickets 
  SET assigned_to = $agentId, status = 'IN_PROGRESS', updated_at = NOW() 
  WHERE id = $ticketId AND assigned_to IS NULL 
  RETURNING *;
  ```
- If two requests arrive concurrently, the first transaction claims the row; the second transaction matches zero rows and the API responds with HTTP 409 Conflict (`ASSIGNMENT_CONFLICT`), preventing conflicting customer responses.

### 3. Data Isolation for Internal Notes
Internal team communications are separated from public customer interactions:
- Messages are marked with an `is_internal` boolean flag.
- The customer API endpoint (`/api/v1/customer/tickets/:ticketNumber`) applies query-level filtering (`WHERE is_internal = FALSE`) and an outbound serialization transform to ensure private staff notes are never exposed in customer-facing network payloads or views.
- In the agent workspace, internal notes are visually distinguished with amber callouts and lock indicators.

### 4. Immutable Audit Trail
All ticket lifecycle events (`CREATED`, `ASSIGNED`, `REPLIED`, `NOTE_ADDED`, `STATUS_CHANGE`, `PRIORITY_CHANGE`, `REOPENED`, `AUTO_CLOSED`) are recorded in an append-only `audit_logs` table with actor identity, action type, old/new state snapshots, and ISO timestamps. Database rules prevent modifications or deletions to audit records.

### 5. Customer Authentication & Role-Based Access Control (RBAC)
To prevent unauthorized access across customer and agent domains:
- **Authentication:** Customers register and log in using email and salted `scrypt` password hashing. Authenticated sessions receive signed RFC 7519 HMAC-SHA256 JWT tokens.
- **Agent Route Protection:** The `requireAgent` middleware blocks customers from calling `/api/v1/agent/*` endpoints with `HTTP 403 Forbidden`.
- **Insecure Direct Object Reference (IDOR) Prevention:** The `requireCustomerOwnership` middleware verifies that customers can only view, export, or reply to tickets matching their authenticated email. Cross-tenant ticket queries return `HTTP 404 Ticket not found` to prevent ticket enumeration.
- **Scoped Ticket Listing:** The `/api/v1/customer/my-tickets` endpoint returns only tickets owned by the authenticated customer.

---

## Project Structure

```text
frontdesk/
├── api/
│   └── index.ts                 # Serverless function entrypoint for Vercel
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts         # PostgreSQL pool & in-memory fallback
│   │   │   ├── schema.sql       # Relational database schema
│   │   │   ├── seed.sql         # Seed data (agents, holidays, initial queue)
│   │   │   ├── migrate.ts       # Database migration runner
│   │   │   └── seed.ts          # Database seed runner
│   │   ├── routes/
│   │   │   ├── agentRoutes.ts   # Support agent API endpoints
│   │   │   └── customerRoutes.ts# Customer-facing API endpoints
│   │   ├── services/
│   │   │   ├── slaEngine.ts     # Business hours arithmetic & SLA calculations
│   │   │   ├── ticketService.ts # State transitions, atomic assignment, message handling
│   │   │   └── auditService.ts  # Append-only audit logger
│   │   ├── types/               # TypeScript interfaces and enums
│   │   └── server.ts            # Express server configuration
│   ├── test/
│   │   ├── slaEngine.test.ts    # SLA calculation unit tests
│   │   └── concurrencyAndPrivacy.test.ts # Assignment race condition & privacy tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx       # Navigation, schedule badge, agent identity selector
│   │   │   ├── DashboardMetrics.tsx # Ticket count metrics
│   │   │   ├── TicketTable.tsx  # Filterable ticket queue with SLA countdown badges
│   │   │   ├── TicketDetailModal.tsx # Ticket workspace with dual composer
│   │   │   ├── CustomerPortal.tsx # Customer self-service view
│   │   │   └── NewTicketModal.tsx # Ticket creation form
│   │   ├── services/
│   │   │   └── api.ts           # Frontend API client
│   │   ├── types.ts             # Client data models
│   │   ├── App.tsx              # Main layout and view state
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── vercel.json                  # Vercel monorepo deployment configuration
├── start.js                     # Local concurrent server runner
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)

### Installation
From the root `frontdesk` directory:

```bash
# Install workspace dependencies
npm install
```

### Running the Application Locally
To start both the backend API and frontend development servers concurrently:

```bash
node start.js
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000 (Health check: `http://localhost:5000/api/health`)

Alternatively, run each service in separate terminal sessions:

```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
```

---

## Database Configuration & Migrations

By default, the backend runs with an internal in-memory store pre-seeded with agents, tickets, and holidays for quick local evaluation without setting up a local database daemon.

To connect to a live PostgreSQL database (e.g. Neon, Supabase, or local PostgreSQL):

1. Set the `DATABASE_URL` environment variable in `backend/.env`:
   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/frontdesk?sslmode=disable
   ```
2. Run database migrations and seed data:
   ```bash
   cd backend
   npm run db:migrate
   npm run db:seed
   ```

---

## Running Automated Tests

The test suite covers SLA working-hour arithmetic, weekend/holiday rollovers, timer pauses, assignment concurrency, message privacy, ticket lifecycle, and end-to-end integration workflows.

```bash
cd backend

# Run all test suites (SLA engine + Concurrency & Privacy + Negative Testing + Comprehensive Validation)
npm test

# Run SLA calculation tests
npm run test:sla

# Run concurrency and data isolation tests
npm run test:incidents

# Run negative testing and edge cases (Category 11)
npm run test:negative

# Run customer auth & RBAC security tests
npm run test:auth

# Run comprehensive validation suite (Categories 1 through 10)
npm run test:validation
```

---

## Deployment to Vercel

The application is pre-configured for full-stack deployment on Vercel using `vercel.json` and the serverless API handler in `api/index.ts`.

1. Push this repository to GitHub.
2. In the [Vercel Dashboard](https://vercel.com/new), select **Import Project** and set the root directory to `frontdesk`.
3. Under **Environment Variables**, provide:
   - `DATABASE_URL`: Your managed PostgreSQL connection string (from [Neon](https://neon.tech), Supabase, or Vercel Postgres).
   - `NODE_ENV`: `production`
4. Deploy. Vercel will build the frontend assets to `frontend/dist` and route `/api/*` requests to the serverless Express handler.
5. After first deployment, run `npm run db:migrate` and `npm run db:seed` against your production database to initialize tables.

---

## Design Decisions

1. **Working Hours Arithmetic:** Implemented via date normalization algorithms that skip non-business hours, weekends, and holidays sequentially. This guarantees accurate minute-level tracking without relying on external scheduling libraries.
2. **Atomic Updates over Application Locks:** Concurrency is handled at the database level (`UPDATE ... WHERE assigned_to IS NULL`) rather than relying on in-memory mutexes, ensuring safety across distributed serverless instances.
3. **Identity Simulation:** The UI includes an active agent selector in the header that passes `X-Agent-Id` headers with API calls. This enables multi-agent workflow testing without requiring a full OAuth2/SSO infrastructure.
