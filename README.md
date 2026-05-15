# MasterBot

MasterBot is the host repo. It discovers bots under `bots/<botName>/`, loads each bot config and `.env`, and can start them either in shared host mode or as one PM2-managed worker per bot.

## What it does

- Loads bot configs from `bots/<botName>/index.js`
- Loads bot env files from `bots/<botName>/.env`
- Builds one Discord client per bot
- Loads shared tools from `src/functions/tools`
- Loads shared functions from `src/functions/handlers`
- Loads shared events from `src/events`
- Lets bots override paths, tools, functions, and events through their own config
- Generates `ecosystem.config.js` from the `bots/` folder for PM2 worker mode

## Layout

- `index.js` - entrypoint
- `src/core/` - bot discovery, client setup, loaders, and database bootstrapping
- `src/worker/` - single-bot worker entry used by PM2
- `src/functions/` - shared tools and handlers
- `src/events/` - shared events
- `bots/<botName>/` - bot-specific config, env, commands, events, and tools
- `ecosystem.config.js` - generated PM2 app list

## Bot conventions

- `botConfig.enabled === false` prevents that bot from starting
- `bot.env.TOKEN` or `botConfig.token` supplies the login token
- `bot.env.CLIENT_ID` or `botConfig.clientId` supplies the slash command application id
- `botPaths.commands` points at the bot command root
- `client.handleCommands()` is owned by the host and registers slash commands for the bot
- `BOT_NAME` is set per PM2 worker so `src/worker/botWorker.js` can start exactly one bot

## Running

- `npm start` - rebuilds `ecosystem.config.js` and runs `pm2-runtime`
- `npm run build:ecosystem` - rebuilds the generated PM2 config without starting bots
- `npm run pm2:start` - rebuilds the generated PM2 config and starts PM2 in the background
- `npm run pm2:list`, `npm run pm2:logs`, `npm run pm2:monit`
- `node index.js` - shared host mode, starts all bots in one Node process

## Notes

- PM2 here is process control and restart/memory guardrails, not a hard CPU or cgroup limiter.
- Each worker uses `instances: 1`, `autorestart: true`, per-bot `NODE_OPTIONS`, and per-bot `max_memory_restart`.
- The generated ecosystem file is only rewritten when the content changes.
- The host currently supports shared command loading, shared query helpers, and per-bot overrides.
- Bot-specific code should stay inside the bot folder unless it is meant to be shared across every bot.
