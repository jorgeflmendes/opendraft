# Engineering Quality Bar

Every change that lands on `main` must pass:

```sh
npm run quality
```

That command runs:

| Stage               | Command                  |
| ------------------- | ------------------------ |
| Strict typecheck    | `npm run typecheck`      |
| Lint, zero warnings | `npm run lint`           |
| Formatting check    | `npm run format:check`   |
| Repository hygiene  | `npm run hygiene`        |
| Dependency audit    | `npm run security:audit` |
| Tests with coverage | `npm run test:coverage`  |
| Production build    | `npm run build`          |

Playwright smoke tests are intentionally separate because they build the
app, start the preview server, boot browser workers, compile a document,
and verify that PDF canvas output is non-blank:

```sh
npm run test:e2e
```

## Local Hygiene

- No unused files, dead code, or commented-out implementation blocks.
- No console noise in production code.
- No generated attribution, assistant footers, or tool-specific credits.
- No misleading product claims. Public UI text must describe shipped
  behavior or clearly label optional setup.
- No fixture names in user-facing copy. Seed data is allowed for the
  default local catalogue, but it should be treated as sample content,
  not as a mock dependency leaking through product surfaces.
- GitHub integration must stay optional. Local editing, saving, export,
  and compile flows must work without a token or network access.

## Coverage

Global Vitest thresholds are enforced in `vitest.config.ts`:

| Metric     | Threshold |
| ---------- | --------- |
| lines      | 90%       |
| functions  | 87%       |
| branches   | 79%       |
| statements | 88%       |

Coverage exclusions are limited to entry points, barrels, type-only
modules, test fixtures, and adapters that cannot execute in jsdom.

## Tests

- Unit tests cover stores, utilities, services, and pure transforms.
- Component tests use Testing Library queries by role/name where possible.
- Integration tests cover app boot, navigation, persistence, compile,
  preview, and sync behavior.
- Browser smoke tests cover the real production bundle and the PDF render
  path that jsdom cannot exercise.

Async UI tests should wait for the visible state users observe. React
`act(...)` warnings are treated as test debt, even when assertions pass.

## Continuous Integration

`.github/workflows/ci.yml` runs the merge gate and Chromium browser tests
on every push and pull request with Node 22. CI provisions the compact
SwiftLaTeX runtime; the large BusyTeX stress suite remains available locally
through the unfiltered `npm run test:e2e` command.

## Commits

Use Conventional Commits:

```txt
type(scope): subject
```

Keep commits focused, explain why in the body when needed, and avoid
metadata that attributes authorship to automation.
