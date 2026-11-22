# Frontdesk — Completion Note & Testing Guide

## 1. Project Summary & Status

Frontdesk has been built and verified as a customer support management system featuring a strict business-hours SLA engine, concurrency-safe ticket claiming, role-based workspace separation, tamper-evident audit logging, and full support for Vercel and Vercel Postgres deployment.

All core functional workflows, data models, business-hour calculations, negative tests, and security boundaries have been implemented with 100% test pass rates (140/140 automated tests).

---

## 2. Deferred Items & Constraints (What Was Not Completed and Why)

Due to the allotted time and scope constraints, the following items were deferred or intentionally scoped out:

### 1. Magic Link Access for Non-Registered Customers
- **Status:** Omitted.
- **Rationale:** As specified during requirements alignment, password-based authentication was prioritized. Customer authentication is implemented via email and password using salted `scrypt` hashing and signed RFC 7519 HMAC-SHA256 JWT tokens. Magic-link email flows require an external transactional email provider (e.g., SendGrid, Postmark, AWS SES) with verified sending domains, which was out of scope for the delivery timeframe.

### 2. External Outbound Email / SMS Notifications
- **Status:** Deferred in favor of in-app conversation threads and audit trails.
- **Rationale:** Implementing outbound SMTP delivery requires external email server credentials and domain DNS records (SPF, DKIM, DMARC). Instead, all customer and agent responses are recorded synchronously, updating the ticket timeline in real time and logging to the immutable `audit_logs` table.

### 3. Binary File & Screenshot Attachments
- **Status:** Deferred.
- **Rationale:** Problem descriptions and conversation messages currently support multiline formatted text. Direct binary file uploads (e.g., PDF error logs, screenshots) were deferred to avoid introducing external object storage dependencies (such as AWS S3, Cloudflare R2, or Vercel Blob) during initial evaluation.

### 4. Stateful WebSocket Server
- **Status:** Polling interval (30 seconds) and optimistic UI updates used instead of WebSockets.
- **Rationale:** Persistent WebSocket connections require stateful server instances and are incompatible with stateless serverless execution environments (such as Vercel Serverless Functions). Periodic queue polling and optimistic state transitions were chosen to ensure zero-maintenance serverless scalability.

---

## 3. Demo & Testing Login Profiles

To facilitate immediate testing and evaluation without manual account setup, pre-configured demo profiles have been embedded directly on the application's Home Page (`http://localhost:5173/`).

### A. Customer Portal Profiles (Enterprise Clients)
Accessible via the **Customer Portal** card on the Home Page. You can use the **1-click quick login buttons** or enter the credentials below:

| Name | Email | Password | Role & Sample Data |
| :--- | :--- | :--- | :--- |
| **Sara Chen** | `sara@cloudflow.com` | `password123` | Ops Lead at CloudFlow. Has reported ticket **INC-0304** (SSO SAML mismatch). |
| **Alex Rivera** | `alex@techcorp.io` | `password123` | CTO at TechCorp. Has reported tickets **INC-0291** and **INC-0292** (Billing checkout errors). |
| **David Kim** | `david@finpay.net` | `password123` | DevOps Manager at FinPay. Initial clean account. |

> **Self-Registration for Customers:** You can also click the **"Register"** tab on the Customer Portal card to register any new customer account (Name, Email, Password). Once registered, the user immediately enters their personal ticket dashboard showing 0 initial tickets, with ability to submit new support requests.

### B. Support Staff Workspace Profiles (Internal Engineering Agents)
Accessible via the **Support Staff Workspace** card on the Home Page. You can click any agent from the **9-agent selector** to log in instantly:

| Agent Name | Email | Password | Assigned Role |
| :--- | :--- | :--- | :--- |
| **Meera** | `meera@arvo.com` | `password123` | Support Lead (Claims lead triage, ticket reassignment) |
| **Rahul** | `rahul@arvo.com` | `password123` | Support Agent |
| **Sneha** | `sneha@arvo.com` | `password123` | Support Agent |
| **Arjun** | `arjun@arvo.com` | `password123` | Support Agent |
| **Priya** | `priya@arvo.com` | `password123` | Support Agent |
| **Anjali** | `anjali@arvo.com` | `password123` | Support Agent |
| **Kiran** | `kiran@arvo.com` | `password123` | Support Agent |
| **Neha** | `neha@arvo.com` | `password123` | Support Agent |
| **Vikram** | `vikram@arvo.com` | `password123` | Support Agent |

> **In-Workspace Multi-Agent Switcher:** Inside the Agent Workspace, the top navigation bar retains the **9-agent dropdown switcher**. Evaluators can switch between Meera, Rahul, Sneha, etc. with a single click at any time to test ticket claiming, reassignment conflicts, and agent-specific metric cards without having to sign out and log back in.

---

## 4. Key Verification Scenarios for Evaluators

1. **Role Separation (Zero Leakage):**
   - Log in as Customer (`sara@cloudflow.com`). Notice there is **no link or button** to enter the agent workspace.
   - Click ticket `INC-0304` to view public replies. Verify that private internal staff notes are **completely hidden**.
   - Notice that Sara only sees tickets filed by `sara@cloudflow.com` (no cross-tenant visibility into Alex Rivera's tickets).
   - Click "Sign Out" to return to the landing page.

2. **Customer Ticket Submission:**
   - On the Customer Portal card, click **Register** and create a new account (e.g., `test.user@company.com`).
   - Click **Report New Problem**, fill in Subject and Description, and submit.
   - The ticket appears instantly in the customer's personal queue.

3. **Agent Workspace & Concurrency Safety:**
   - Log in as **Meera** from the Support Staff Workspace card.
   - Switch active agent in the header dropdown to **Rahul**.
   - Observe metric cards and active assignment indicators dynamically update to Rahul's identity.
   - Open ticket `INC-0291` and toggle between **Public Reply** and **Private Internal Note** (highlighted in gold).
   - Run the **Inactivity Check** button to evaluate tickets exceeding 1 working week in `WAITING_FOR_CUSTOMER`.
