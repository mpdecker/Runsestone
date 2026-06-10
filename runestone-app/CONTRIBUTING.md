# Contributing

## Setup

1. Copy `.env.example` to `.env`
2. Start databases: `docker compose up -d`
3. Install deps: `pnpm install`
4. Run desktop app: `pnpm tauri dev`

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Or run everything: `pnpm test:all`

## Pull requests

- Keep changes focused
- Ensure CI passes
- Do not commit `.env` files
