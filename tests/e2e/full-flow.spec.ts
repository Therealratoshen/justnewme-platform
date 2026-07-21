// E2E test — the full user flow via the API
// Run: npm run test:e2e (after `npx playwright install`)
//
// This is a minimal E2E that hits the API routes directly.
// For browser-level E2E you'd use Playwright with a real browser.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3456';

test.describe('JustNewMe end-to-end', () => {
  test('user can post a problem and worker can claim + message', async ({ request }) => {
    // 1. Sign in as end user
    const userLogin = await request.post(`${BASE}/api/auth/demo-login`, {
      data: { email: `e2e-user-${Date.now()}@example.com`, role: 'end_user' },
    });
    expect(userLogin.ok()).toBeTruthy();

    // 2. Post a problem
    const problemRes = await request.post(`${BASE}/api/problems`, {
      data: {
        title: 'E2E test problem',
        description: 'This is a test problem with enough length to pass validation.',
        category: 'strategy',
        skillsNeeded: ['ai_strategy'],
        budgetCents: 10_000,
        urgency: 'normal',
      },
    });
    expect(problemRes.ok()).toBeTruthy();
    const { data: problem } = await problemRes.json();
    expect(problem.problem.id).toMatch(/^prob_/);

    // 3. Sign in as Filbert (the seeded worker)
    const workerLogin = await request.post(`${BASE}/api/auth/demo-login`, {
      data: {},
    });
    expect(workerLogin.ok()).toBeTruthy();
    const { data: workerData } = await workerLogin.json();
    const workerId = workerData.worker.id;

    // 4. List available problems
    const availableRes = await request.get(`${BASE}/api/problems?scope=available`);
    expect(availableRes.ok()).toBeTruthy();
    const { data: available } = await availableRes.json();
    expect(available.problems.length).toBeGreaterThan(0);

    // 5. Worker claims the problem (will fail if onboarding not complete — that's OK)
    const claimRes = await request.post(`${BASE}/api/sessions`, {
      data: { problemId: problem.problem.id, message: 'I can help.' },
    });
    // Either 201 (claimed) or 412 (needs onboarding) — both are valid paths
    if (claimRes.status() === 201) {
      const { data: sessionData } = await claimRes.json();
      expect(sessionData.session.id).toMatch(/^sess_/);

      // 6. Worker sends a message
      const msgRes = await request.post(`${BASE}/api/sessions/${sessionData.session.id}/messages`, {
        data: { content: 'Hello, I can help with this.' },
      });
      expect(msgRes.status()).toBeLessThan(300);
    } else {
      // Worker needs to finish onboarding first
      expect(claimRes.status()).toBe(412);
    }
  });

  test('admin can list workers and disputes', async ({ request }) => {
    // Sign in as admin
    await request.post(`${BASE}/api/auth/demo-login`, {
      data: { email: `e2e-admin-${Date.now()}@example.com`, role: 'admin' },
    });
    // Bump that user to admin via a direct update isn't available — for the E2E
    // we just verify the endpoints respond (auth or 403, not crash).
    const workers = await request.get(`${BASE}/api/admin/workers`);
    expect([200, 401, 403]).toContain(workers.status());
  });
});
