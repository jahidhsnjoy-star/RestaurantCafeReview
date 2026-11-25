# Restaurant & Cafe Review App

## Backend with Docker

The backend runs on port `5000` and connects to MySQL. Docker Compose starts the
backend and a MySQL 8.0 database; MySQL data is kept in the named `mysql_data`
volume when containers are recreated.

1. Install Docker Engine and the Docker Compose plugin.
2. Create the local environment file and replace the example database passwords
   and JWT secret with unique values:

   ```sh
   cp .env.example .env
   ```

   Add valid API credentials to `.env` only for features that need Gemini,
   Resend, or Cloudinary. Do not commit `.env`.
3. Build and start the services:

   ```sh
   docker compose up --build -d
   ```
4. Check service status and backend logs:

   ```sh
   docker compose ps
   docker compose logs -f backend
   ```
5. Check the API responds:

   ```sh
   curl http://localhost:5000/
   ```

Stop the containers without deleting the database volume with
`docker compose down`. **Do not use `docker compose down -v`** unless you
intentionally want to delete the persisted MySQL data.

### Database schema and migrations

The repository's SQL files in `server/migrations/` are incremental migrations;
they depend on the app's original `users`, `restaurants`, and other tables,
whose baseline schema is not included here. A new Compose database therefore
starts empty and needs a trusted baseline schema/data backup before the API's
database-backed routes can work.

Migrations are deliberately **not** run automatically by Docker. Several are
not idempotent, and migration `004` updates existing user rows. Before using an
existing database with this setup:

1. Back up the database and verify that the backup can be restored.
2. Review the current schema and determine which migrations have already been
   applied; do not infer this only from the file sequence.
3. Apply only missing migrations, one at a time and in order, using a MySQL
   client connected to the intended database. Check each result before
   continuing. Do not rerun an already-applied migration.
4. Keep the backup until the app has been checked against the migrated schema.

The MySQL health check only confirms that the database server accepts
connections. Compose waits for that check before starting the backend; it does
not create the app's baseline tables or run migrations.

## Backend CI

GitHub Actions runs on every push and pull request. The workflow installs
backend dependencies with `npm ci`, prepares a disposable MySQL service for the
database-backed email-verification test, applies the required test migrations
to that empty CI database, and runs `npm test`. No external deployment is
configured and no GitHub Secrets are required by the workflow.

To check a run, open the repository on GitHub, select **Actions**, and open the
**Backend CI** run for the relevant commit or pull request. Each step's logs,
including failed test output, are available there.
