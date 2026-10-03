# API repository guidance

The API owns identity, boundary validation, authorization, listing lifecycle,
persistence, and the versioned HTTP contract. Keep web and mobile presentation
out of this service. Clients must treat API responses as authoritative.

This independent repository uses TypeScript, Express 5, Prisma 7, SQLite,
Zod, and JWT sessions. Keep migrations reproducible, keep secrets in local
environment configuration, and never return password hashes, tokens, or
internal moderation notes. Enforce owner access on every listing mutation and
administrator access on moderation routes.

Read `../SPEC.md` for product behavior and `README.md` for local setup.
