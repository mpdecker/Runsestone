## Learned User Preferences

- Prefer full remote routing: wire Tauri commands through local DB pools or remote HTTP to `runestone-server`, not a desktop-only or MVP server scope.
- Prefer Tauri WebDriver for desktop E2E over Playwright-only web shell tests.
- Defer multi-user auth; keep single `RUNESTONE_API_TOKEN` and prioritize product quality (vault sync, AI, search) before tenancy.
- Use the `cursor/` branch prefix for agent-created feature branches.
- Exclude `.env`, `.cursor/`, and other unrelated local changes from git commits.

## Learned Workspace Facts

- Runestone is a personal knowledge graph app built with Tauri 2, React 19, PostgreSQL/pgvector, and Neo4j.
- Application code lives under `runestone-app/`; CI workflows are at repo-root `.github/` with `working-directory: runestone-app`.
- Rust Cargo workspace members: `crates/runestone-core`, `crates/runestone-server`, and `src-tauri`.
- Canonical SQLx migrations are in `runestone-app/crates/runestone-core/migrations/`.
- Dual-database architecture: PostgreSQL for relational/vector data, Neo4j for the graph; `graph_sync` centralizes Neo4j writes with PG rollback.
- Remote mode dispatches via Tauri router to local pools or HTTP to the Axum `runestone-server` (`/api/health`, `/api/invoke/{command}`).
- Default docker-compose ports: PostgreSQL 5442, Neo4j Bolt 7688.
- CI runs on pushes to `main`/`master` and `cursor/**` branches.
