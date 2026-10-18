# Property Portal API

The API powers the Property Portal marketplace. It provides accounts, property listings, saved listings, inquiries, and listing administration to client applications. Its JSON endpoints are versioned under `/api/v1`.

## Requirements

- Node.js and npm
- SQLite for local development

## Local development

From this directory:

```sh
npm install
cp .env.example .env
npm run prisma:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

The development server listens on `http://localhost:4000` by default. Before starting it, replace `JWT_SECRET` in `.env` with a value unique to this machine. The process exits when that variable is missing or still the example placeholder `replace-this-in-development`. Generate one with:

```sh
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url') + '\n')"
```

Seed accounts and credentials are for local development only; never reuse them in a deployed environment.

The API health check is available at `http://localhost:4000/health`. The web client uses `http://localhost:4000/api/v1` by default. Set `WEB_ORIGIN` if the browser client runs from a different origin, and `PORT` to change the server port.

The seed creates administrator, owner, agent, and buyer/renter demo accounts:

| Role | Email |
| --- | --- |
| Administrator | `admin@property.local` |
| Owner | `owner@property.local` |
| Agent | `agent@property.local` |
| Buyer / renter | `customer@property.local` |

All seeded accounts use the local-only password `demo-password-123`.

## Available commands

- `npm run dev` — start the API with reload on changes.
- `npm run build` — compile TypeScript into `dist/`.
- `npm run typecheck` — check TypeScript without emitting files.
- `npm run prisma:generate` — generate the Prisma client.
- `npm run db:migrate` — apply a local development migration.
- `npm run db:seed` — load the development sample data.

The API is a standalone project with its own dependencies and Git history. When working in the full Property Portal workspace, the coordination root's `SPEC.md` describes the shared product behavior. Setup and run commands in this README are sufficient to run the API locally.
