# Remote Mode (Deferred)

Mobile builds (iOS/Android) use `ConnectionMode::Remote` when local PostgreSQL and Neo4j are unavailable. The client includes an HTTP bridge in `src-tauri/src/remote_api.rs`, but **no Runestone API server is shipped in this repository yet**.

## Current behavior

- Desktop: connects directly to PostgreSQL + Neo4j (local mode).
- Mobile / DB-unavailable desktop: falls back to remote mode UI (`ConnectionScreen`).
- All Tauri commands still require local database pools today; remote routing is not wired.

## Planned server

A future Axum-based headless server would expose the same REST surface expected by `remote_api.rs` and be deployable via Docker. Until then, treat mobile remote connection as **preview UI only**.

## Workaround

Use the desktop app with Docker Compose databases for full functionality.
