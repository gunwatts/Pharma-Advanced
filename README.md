# Pharma QA Reminder System: Frontend (V1)

This is the React + TypeScript (Vite) single-page app for the Pharma QA Reminder System. It talks to the Django API in
the [`Pharma-advanced-backend`](https://github.com/gunwatts/Pharma-advanced-backend) repository.

- **Quick Start wizard** (admins), 8 steps: email sender → data source → units, departments and recipients → Excel
  mappings → reminder rules → email template → dry run and test email → activation. Every step is checked against the
  live backend, and progress is saved so you can resume later.
- **Advanced Setup**: categories, fields, statuses, relationships, units, departments, recipients, sources, mappings,
  senders, rules, templates, schedules, alerts, system settings, users, roles, data scopes and the dashboard builder.
  Before a destructive change, you see what it would affect and must confirm.
- **Dashboards**: KPI, donut, pie, bar, line, area, table, upcoming-deadline and overdue widgets. Click through to the
  filtered records, switch any chart to a table view, and use light or dark mode.
- **Records**: filters, search, detail with parent and child items in your scope, and CSV export (with permission).
- **Operations**: run history, the delivery ledger (retry and reconcile uncertain deliveries), sync logs and the
  audit trail.
- Every screen has loading, empty, error and permission-denied states. Permissions are also enforced by the API;
  hiding parts of the UI is not the security boundary.

## Development

```bash
npm ci
cp .env.example .env.local      # VITE_API_BASE_URL=http://localhost:8000/api, VITE_BASE=/
npm run dev                     # http://localhost:5173  (add it to the backend's CORS_ALLOWED_ORIGINS)
```

| Task | Command |
|---|---|
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Unit tests | `npm test` |
| Production build | `npm run build` (output in `dist/`) |

## Deploying to GitHub Pages

1. Go to **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. Optional: the build defaults to `https://ayudhas.pythonanywhere.com/api`. To use another API, add the Actions
   variable `VITE_API_BASE_URL` (**Settings → Secrets and variables → Actions → Variables**).
3. Push to `main` (or the configured branch), or run **Build and deploy to GitHub Pages** manually.
4. On the backend, set `CORS_ALLOWED_ORIGINS=https://<github-user>.github.io`.

The app uses hash routing (`#/records`) because GitHub Pages has no server-side routing. The production build adds a
Content-Security-Policy that allows API calls only to the configured API origin.

For an internal server hosting both frontend and API on the same origin, build with `VITE_BASE=/` and
`VITE_API_BASE_URL=/api`, then serve `dist/`.

## Security notes

- No secrets live in the frontend. Provider credentials stay in server environment variables, and the UI only shows
  whether each one is set.
- The session token is held in `sessionStorage` (cleared when the tab closes), expires on the server and is revoked
  on logout. See the backend's `docs/SECURITY.md` for the trade-off.
- Email previews are rendered in a fully sandboxed `<iframe sandbox="">`.
