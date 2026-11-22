import assert from 'assert';
import { inMemoryStore, initDatabase } from '../src/db';
import {
  registerCustomer,
  loginCustomer,
  verifyToken,
  hashPassword,
  verifyPassword,
} from '../src/services/authService';
import { createTicket, listTickets, getTicketById } from '../src/services/ticketService';
import app from '../src/server';

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => Promise<void> | void) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  [PASS] ${desc}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  [FAIL] ${desc}:`, err.message);
        });
    } else {
      passed++;
      console.log(`  [PASS] ${desc}`);
    }
  } catch (err: any) {
    failed++;
    console.error(`  [FAIL] ${desc}:`, err.message);
  }
}

async function runAuthTests() {
  console.log('====================================================');
  console.log('Running Customer Auth & RBAC Security Test Suite');
  console.log('====================================================\n');

  await initDatabase();

  let customerAToken = '';
  let customerBToken = '';
  const customerAEmail = 'customer.alpha@test.com';
  const customerBEmail = 'customer.beta@test.com';

  // 1. Password Hashing & Verification
  await it('AUTH-01: Password hash generates salt:hash and verifies correctly', () => {
    const password = 'securePassword123!';
    const hashed = hashPassword(password);
    assert.ok(hashed.includes(':'), 'Hash format should be salt:hash');
    assert.strictEqual(verifyPassword(password, hashed), true, 'Password verification succeeds');
    assert.strictEqual(verifyPassword('wrongPassword', hashed), false, 'Wrong password rejected');
  });

  // 2. Customer Registration
  await it('AUTH-02: Register new customer returns user details and signed JWT', async () => {
    const result = await registerCustomer({
      name: 'Customer Alpha',
      email: customerAEmail,
      password: 'passwordAlpha123',
    });

    assert.ok(result.user.id > 0);
    assert.strictEqual(result.user.email, customerAEmail);
    assert.strictEqual(result.user.role, 'CUSTOMER');
    assert.strictEqual((result.user as any).password_hash, undefined, 'Password hash stripped from payload');
    assert.ok(result.token.length > 20, 'JWT token returned');

    customerAToken = result.token;
    const payload = verifyToken(customerAToken);
    assert.ok(payload !== null);
    assert.strictEqual(payload?.email, customerAEmail);
    assert.strictEqual(payload?.role, 'CUSTOMER');
  });

  // 3. Validation on Registration
  await it('AUTH-03: Register with short password (<6 chars) rejected (400)', async () => {
    let errorCaught = false;
    try {
      await registerCustomer({
        name: 'Short Pass User',
        email: 'short@test.com',
        password: '123',
      });
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(err.status, 400);
      assert.ok(err.message.includes('at least 6 characters'));
    }
    assert.ok(errorCaught);
  });

  await it('AUTH-04: Register with invalid email format rejected (400)', async () => {
    let errorCaught = false;
    try {
      await registerCustomer({
        name: 'Invalid Email User',
        email: 'not-an-email',
        password: 'password123',
      });
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(err.status, 400);
    }
    assert.ok(errorCaught);
  });

  await it('AUTH-05: Register with existing email rejected (409 Conflict)', async () => {
    let duplicateCaught = false;
    try {
      await registerCustomer({
        name: 'Duplicate Alpha',
        email: customerAEmail,
        password: 'anotherPassword123',
      });
    } catch (err: any) {
      duplicateCaught = true;
      assert.strictEqual(err.status, 409);
      assert.ok(err.message.includes('already exists'));
    }
    assert.ok(duplicateCaught);
  });

  // 4. Customer Login
  await it('AUTH-06: Customer login with correct credentials succeeds', async () => {
    const result = await loginCustomer({
      email: customerAEmail,
      password: 'passwordAlpha123',
    });

    assert.strictEqual(result.user.email, customerAEmail);
    assert.ok(result.token.length > 20);
  });

  await it('AUTH-07: Customer login with incorrect password rejected (401)', async () => {
    let errorCaught = false;
    try {
      await loginCustomer({
        email: customerAEmail,
        password: 'incorrectPassword',
      });
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(err.status, 401);
      assert.ok(err.message.includes('Invalid email or password'));
    }
    assert.ok(errorCaught);
  });

  await it('AUTH-08: Customer login with non-existent email rejected (401)', async () => {
    let errorCaught = false;
    try {
      await loginCustomer({
        email: 'nonexistent@nowhere.com',
        password: 'password123',
      });
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(err.status, 401);
    }
    assert.ok(errorCaught);
  });

  // Register Customer B for cross-tenant isolation testing
  await it('AUTH-09: Register Customer Beta for isolation testing', async () => {
    const result = await registerCustomer({
      name: 'Customer Beta',
      email: customerBEmail,
      password: 'passwordBeta123',
    });
    customerBToken = result.token;
    assert.strictEqual(result.user.email, customerBEmail);
  });

  // 5. RBAC Enforcement: Customer token on Agent Endpoints
  await it('RBAC-01: Customer token sent to agent endpoint is rejected with 403 Forbidden', async () => {
    // Simulate HTTP request to /api/v1/agent/tickets with Customer Bearer token
    let statusCode = 0;
    let responseBody: any = null;

    const mockReq: any = {
      headers: {
        authorization: `Bearer ${customerAToken}`,
      },
      user: verifyToken(customerAToken),
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    };

    const { requireAgent } = await import('../src/middleware/auth');
    requireAgent(mockReq, mockRes, () => {});

    assert.strictEqual(statusCode, 403, 'Customer role blocked from agent routes');
    assert.ok(responseBody.error.includes('Support agent access required'));
  });

  // 6. IDOR Protection: Customer A accessing Customer B's ticket
  await it('RBAC-02: Customer A cannot access Customer B ticket (IDOR protected -> 404)', async () => {
    // Create ticket owned by Customer B
    const ticketB = await createTicket({
      customerName: 'Customer Beta',
      customerEmail: customerBEmail,
      subject: 'Beta Confidential Ticket',
      description: 'Private billing data of Customer Beta',
      priority: 'MEDIUM',
    });

    let statusCode = 0;
    const mockReq: any = {
      params: { ticketNumber: ticketB.ticket_number },
      user: verifyToken(customerAToken), // Logged in as Customer A
    };
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: () => {},
        };
      },
    };

    const { requireCustomerOwnership } = await import('../src/middleware/auth');
    await requireCustomerOwnership(mockReq, mockRes, () => {});

    assert.strictEqual(statusCode, 404, 'Accessing another customer ticket returns 404');
  });

  await it('RBAC-03: Customer B can access their own ticket successfully', async () => {
    const tickets = await listTickets({ customerEmail: customerBEmail });
    assert.ok(tickets.length > 0);
    const myTicket = tickets[0];

    let nextCalled = false;
    const mockReq: any = {
      params: { ticketNumber: myTicket.ticket_number },
      user: verifyToken(customerBToken), // Logged in as Customer B
    };
    const mockRes: any = {
      status: () => ({ json: () => {} }),
    };

    const { requireCustomerOwnership } = await import('../src/middleware/auth');
    await requireCustomerOwnership(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Customer B permitted to access their own ticket');
  });

  // 7. Scoped Ticket Listing for Logged-In Customer
  await it('RBAC-04: listTickets scoped by customer email only returns their own tickets', async () => {
    // Create ticket for Customer A
    await createTicket({
      customerName: 'Customer Alpha',
      customerEmail: customerAEmail,
      subject: 'Alpha Order Support',
      description: 'Alpha ticket description',
      priority: 'LOW',
    });

    const alphaTickets = await listTickets({ customerEmail: customerAEmail });
    assert.ok(alphaTickets.length >= 1);
    for (const t of alphaTickets) {
      assert.strictEqual(t.customer_email.toLowerCase(), customerAEmail.toLowerCase());
    }

    const betaTickets = await listTickets({ customerEmail: customerBEmail });
    assert.ok(betaTickets.length >= 1);
    for (const t of betaTickets) {
      assert.strictEqual(t.customer_email.toLowerCase(), customerBEmail.toLowerCase());
    }
  });

  console.log('\n====================================================');
  console.log(`Auth & RBAC Test Summary: ${passed} passed, ${failed} failed.`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
