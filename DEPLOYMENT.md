# Classroom deployment

Pushes to `main` run the **Deploy API** GitHub Action. It uploads the committed source to the Singapore demo server, installs dependencies, generates Prisma, builds TypeScript, applies migrations, activates the new release, and restarts `property-portal-api`. The Actions page also supports **Run workflow**.

Repository configuration:
- Variable `DEPLOY_HOST`: demo Droplet IPv4.
- Variable `DEPLOY_KNOWN_HOSTS`: the verified server SSH host-key entry.
- Secret `DEPLOY_SSH_KEY`: a dedicated SSH private key for the server's `deploy` user.

The deploy user needs write access to `/opt/property-portal` and passwordless sudo only for `/usr/bin/systemctl restart property-portal-api`. SSH uses key authentication and pinned host-key verification.

The stable SQLite database stays at `/var/lib/property-portal/property.db`. Runtime configuration stays at `/etc/property-portal/api.env`. Deployment does not seed the database or replace runtime secrets. Releases live in `/opt/property-portal/releases`; `/opt/property-portal/api` points at the active API release.
