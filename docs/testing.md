# Testing and the coverage ratchet

The suite has three layers, each answering a different question:

| Layer           | Where                                                   | Question it answers                                     |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Unit tests      | `backend/src/**/__tests__`, `frontend/src/**/*.test.ts` | Does this function do the arithmetic of RouterOS right? |
| Component tests | `frontend/src/**/*.dom.test.tsx`                        | Does this UI do the right thing when a person uses it?  |
| PG-backed e2e   | `backend/src/**/__tests__/*.pg.test.ts`                 | Does a backup actually restore into a real Postgres?    |

Component tests are new. This page describes how they work and the coverage
ratchet that keeps the number they produce honest.

## Component tests (jsdom + Testing Library)

The default vitest environment is `node`: most of the suite is pure-function
logic and node starts faster. A test that renders UI opts into a DOM with a
one-line docblock, so the environment is an explicit, greppable choice at the
top of every DOM test:

```ts
// @vitest-environment jsdom
```

Conventions:

- **Naming**: component and hook tests end in `.dom.test.tsx` (or `.ts` for a
  store with DOM side effects, like the theme store). Everything else stays
  `.test.ts` and runs in node.
- **Matchers**: `@testing-library/jest-dom/vitest` is loaded by
  `src/test/setup.ts`, along with RTL cleanup after every test. The setup file
  also gives `scrollIntoView` a quiet no-op, because jsdom implements no
  layout; a test that cares about the call can spy on the prototype.
- **Queries**: prefer `getByRole` with an accessible name over class or text
  selectors — a role query doubles as an accessibility audit, and it fails
  loudly when a rename breaks the test.
- **API mocks**: components talk to `services/api`, which returns axios
  responses. Mock the module (`vi.mock('../../services/api', ...)`) and wrap
  resolved values with the `ok()` helper from `src/test/axiosResponse.ts`,
  which builds a full `AxiosResponse` around your data.
- **State**: zustand stores are plain objects — seed them with
  `useAuthStore.getState().setAuth(...)` inside `act()` and assert with
  `getState()`. Reset stores in `beforeEach`, as the auth and site tests do.

Run them with everything else:

```sh
cd frontend && npm test
```

## The coverage ratchet

Both packages report coverage, and both enforce **floors, not targets**:

- Frontend: `npm run test:coverage` runs vitest with `@vitest/coverage-v8`.
  The floors live in `vitest.config.ts` under `coverage.thresholds`, measured
  across the whole app — pages and components included, not just the well-
  tested utils. An untested page drags the number down, honestly.
- Backend: `npm run test:coverage` is jest with `coverageThreshold` in
  `jest.config.js`. The PG-backed e2e tests run in CI only and cover a
  superset of the local run, so CI sits above floors measured locally.

A floor blocks regressions: a PR that adds untested code and drops coverage
fails CI. A floor is never a target — nobody writes tests to satisfy a number.

### Raising a floor

When coverage improves, move the floor up so the gain is locked in:

```sh
cd frontend
npm run test:coverage
npm run coverage:ratchet          # reports measured vs configured floors
npm run coverage:ratchet -- --write  # raises floors to the measured value
```

The helper reads `coverage/coverage-summary.json` and edits only
`vitest.config.ts`. Floors are the **rounded-down** whole number, so ordinary
fluctuation between runs can't bounce a floor. Backend floors are edited by
hand in `jest.config.js`, the same way: measured, rounded down, committed
with the tests that earned them.

To lower a floor is to lose money from the till. If a floor is genuinely
wrong (say, a file was deleted or moved out of scope), say so in the commit
message that changes it.

## What this doesn't cover

The floors are whole-app, so they are low. That is the honest number: most
pages are exercised by hand and by the flows documented in `docs/`, not by
automated tests yet. The ratchet exists so that every PR which adds tests
moves the floor permanently, and no PR moves it backwards.
