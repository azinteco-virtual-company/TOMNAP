# Isolated browser acceptance tests

Use Node 22 and the lockfile-pinned Playwright/Chromium version:

```sh
npm ci
npm run test:e2e:install
npm run build
npm run test:e2e
```

Linux CI installs Chromium system dependencies with `npm run test:e2e:install -- --with-deps`.
Browser binaries live in ignored `node_modules/.cache/ms-playwright`. The runner allocates a fresh temporary data directory and loopback port, never reuses an existing server, and removes its fixture after completion. Tests are `.spec.ts`, so Vitest's `.test.ts` glob does not pick them up. Failure traces/screenshots contain synthetic fixtures only and are retained as CI artifacts for seven days.

The fixture serves the production `dist/` UI using the real Express `createApp`, session, CSRF, role, tenant, rate-limit, image and cargo routes. It seeds two synthetic active boutiques, their owners, a courier account, orders and private images. It never mocks an application API or fabricates a session cookie. Browser requests are restricted to the fixture origin, service workers and websockets are blocked, browser background requests use a dead local proxy, and the fixture blocks outgoing fetch, sockets and DNS. No database, email, AI or provider keys are inherited. `dotenv` cannot read the developer checkout because the server changes into the fresh fixture directory before importing application code.

This is a **local persistence acceptance test**, with `NODE_ENV=test` and `UPLOAD_STORAGE_BACKEND=local`. Production intentionally refuses local session storage. Therefore this suite does not claim to verify Supabase transport/RLS, the cloud upload adapter, deployment HTTPS/Secure-cookie behavior, service-worker offline behavior or real carrier/email services. SQL/concurrency and storage-adapter tests cover their separate boundaries; deployment acceptance remains required before release.

Covered browser flows: real owner login; explicit courier create/bind/assignment and refreshed counters; courier-only requests and delivery without financial edits; two cargo saves using server revisions and masked passwords; tenant data/image denial; CSRF rejection; logout revocation; document packages deferred until explicit workbook/PDF downloads; a blocked document chunk producing a visible error, unlocking the button and recovering after connectivity returns and the page reloads; and an order-detail refresh conflict keeping its error visible until a successful retry.

Primary API references: [Playwright webServer configuration](https://playwright.dev/docs/test-webserver), [network routing and service-worker limitations](https://playwright.dev/docs/network), and [CI setup](https://playwright.dev/docs/ci-intro).
