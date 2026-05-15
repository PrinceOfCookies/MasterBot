# MasterBot

MasterBot is the host repo. It discovers bots under `bots/<botName>/`, loads each bot config and `.env`, and can start them either in shared host mode or as one PM2-managed worker per bot.
It also generates PM2 config for a separate optional Rust watchdog process that reads PM2 status and reports guardrail allocation.

## What it does

- Loads bot configs from `bots/<botName>/index.js`
- Loads bot env files from `bots/<botName>/.env`
- Builds one Discord client per bot
- Loads shared tools from `src/functions/tools`
- Loads shared functions from `src/functions/handlers`
- Loads shared events from `src/events`
- Lets bots override paths, tools, functions, and events through their own config
- Generates `ecosystem.config.js` from the `bots/` folder and includes the PM2 health monitor process
- Adds `masterbot-watchdog` to PM2 only when the release binary exists

## Layout

- `index.js` - entrypoint
- `src/core/` - bot discovery, client setup, loaders, and database bootstrapping
- `src/worker/` - single-bot worker entry used by PM2
- `src/pm2/` - PM2 client helpers, health monitor, alert sink, and allocation logic
- `src/functions/` - shared tools and handlers
- `src/events/` - shared events
- `bots/<botName>/` - bot-specific config, env, commands, events, and tools
- `ecosystem.config.js` - generated PM2 app list
- `rust/masterbot-watchdog/` - optional Rust watchdog binary and workspace files

## Bot conventions

- `botConfig.enabled === false` prevents that bot from starting
- `bot.env.TOKEN` or `botConfig.token` supplies the login token
- `bot.env.CLIENT_ID` or `botConfig.clientId` supplies the slash command application id
- `botPaths.commands` points at the bot command root
- `client.handleCommands()` is owned by the host and registers slash commands for the bot
- `BOT_NAME` is set per PM2 worker so `src/worker/botWorker.js` can start exactly one bot
- The Rust watchdog is optional and only added to PM2 when `rust/masterbot-watchdog/target/release/masterbot-watchdog` exists

## Running

- `npm start` - rebuilds `ecosystem.config.js` and runs `pm2-runtime`
- `npm run build:ecosystem` - rebuilds the generated PM2 config without starting bots
- `npm run watchdog:build` - builds the Rust watchdog release binary
- `npm run watchdog` - runs the built watchdog in watch mode
- `npm run pm2:start` - rebuilds the generated PM2 config and starts PM2 in the background
- `npm run pm2:list`, `npm run pm2:logs`, `npm run pm2:monit`
- `node index.js` - shared host mode, starts all bots in one Node process
- `./masterbot-linux.sh` - installs npm deps, builds the watchdog, regenerates PM2, and starts PM2

## Linux Helper

If you want one command to bring the stack up on Linux, use:

```bash
./masterbot-linux.sh
```

It does this in order:

1. `npm install --no-audit --no-fund`
2. `cargo build --release --manifest-path rust/masterbot-watchdog/Cargo.toml`
3. `npm run build:ecosystem`
4. `npm run pm2:start`

The watchdog stays optional. If the release binary is not present, ecosystem generation skips the watchdog app and the rest of PM2 still works.

## Watchdog Build/Test

Run these in order when you want to verify the hybrid setup:

```bash
cargo check --manifest-path rust/masterbot-watchdog/Cargo.toml
cargo build --release --manifest-path rust/masterbot-watchdog/Cargo.toml
./rust/masterbot-watchdog/target/release/masterbot-watchdog --json
npm run build:ecosystem
```

If you want to exercise the watchdog against a live PM2 daemon, run:

```bash
npm run watchdog
```

If the release binary does not exist, `npm run build:ecosystem` will skip the watchdog app and keep the rest of PM2 generation working.

## Notes

- PM2 here is process control and restart/memory guardrails, not a hard CPU or cgroup limiter.
- Each worker uses `instances: 1`, `autorestart: true`, per-bot `NODE_OPTIONS`, and per-bot `max_memory_restart`.
- The Rust watchdog uses PM2 status as input and reports guardrail allocation for bots only. It is not a hard resource cap.
- The generated ecosystem file is only rewritten when the content changes.
- The host currently supports shared command loading, shared query helpers, and per-bot overrides.
- Bot-specific code should stay inside the bot folder unless it is meant to be shared across every bot.
