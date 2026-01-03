# PlagLens Frontend

Vite + React 18 + TypeScript SPA for PlagLens. Built on Mantine UI v7,
TanStack Query v5, React Router v6 and axios.

## Quick start

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.example .env
npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`
(the API gateway). To override, set `VITE_API_PROXY_TARGET`.

## Scripts

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `npm run dev`     | Start Vite dev server (port 5173)        |
| `npm run build`   | Type-check + production bundle to `dist` |
| `npm run preview` | Serve `dist` locally                     |
| `npm run lint`    | ESLint over `src` and `tests`            |
| `npm run test`    | Run vitest once                          |
| `npm run test:watch` | Vitest in watch mode                  |

## Project structure

```
src/
  api/           HTTP client + RFC 7807 + endpoint wrappers
  auth/          AuthProvider, useAuth, ProtectedRoute, RoleGuard
  layout/        AppShell, Header, Navbar, Footer, Breadcrumbs
  components/    forms/* and common/* (ProblemAlert, EmptyState, ...)
  pages/         auth/* (Login, Register, …) + app/* (placeholders)
  routes/        Route definitions
  hooks/         Reusable React hooks
  utils/         formatters, validators
  i18n/          ru / en dictionaries
  theme.ts       Mantine theme (PlagLens brand purple, dark default)
```

## API conventions

* Base URL: `VITE_API_BASE_URL` (default `/api/v1`).
* Auth: short-lived access JWT in memory + refresh token in `__Host-refresh`
  HttpOnly cookie. Client refreshes once on `401 + TOKEN_EXPIRED`.
* Errors: parsed as RFC 7807 `Problem` (see `src/api/problem.ts`).
* Pagination: cursor-based. Use `<CursorPaginated>` helper.
* Async ops: poll `GET /v1/operations/{id}` via `useOperation()`.

## Roles & navigation

The sidebar (`src/layout/Navbar.tsx`) is filtered by `global_role`
and the user's course-role memberships. `super_admin` sees every
section.

## Adding a new page

1. Create the page in `src/pages/...`.
2. Register a route in `src/routes/index.tsx` (replace the
   `<PlaceholderPage />` if extending the existing skeleton).
3. Add a nav entry in `src/layout/Navbar.tsx` if appropriate.
4. Wrap admin/teacher-only blocks with `<RoleGuard global={[...]}>`.

## Demo login

Open `/demo` for one-click login as `admin@demo.local`,
`teacher@demo.local`, `assistant@demo.local`, or `student1..4@demo.local`.
Seed scripts in `tools/scripts/seed-demo-data.py` create those accounts.

## Docker

```bash
docker build -f frontend/Dockerfile -t plaglens/frontend:dev .
docker run --rm -p 5173:80 plaglens/frontend:dev
```

In compose, the `frontend` service publishes `5173:80` and proxies
`/api/*` to the `gateway` service via `nginx.conf`.
