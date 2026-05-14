# MasterBot

MasterBot is the host that discovers bots under `bots/<botName>/`, loads their config and `.env`, and starts them from one shared runtime.

## What it does

- Loads bot configs from `bots/<botName>/index.js`
- Loads bot env files from `bots/<botName>/.env`
- Builds one Discord client per bot
- Loads shared tools from `src/functions/tools`
- Loads shared functions from `src/functions/handlers`
- Loads shared events from `src/events`
- Lets bots override paths, tools, functions, and events through their own config

## Layout

- `index.js` - entrypoint
- `src/core/` - bot discovery, client setup, loaders, and database bootstrapping
- `src/functions/` - shared tools and handlers
- `src/events/` - shared events
- `bots/<botName>/` - bot-specific config, env, commands, events, and tools

## Bot conventions

- `bot.env.TOKEN` or `botConfig.token` supplies the login token
- `bot.env.CLIENT_ID` or `botConfig.clientId` supplies the slash command application id
- `botPaths.commands` points at the bot command root
- `client.handleCommands()` is owned by the host and registers slash commands for the bot

## Running

- `npm start`
- or `node index.js`

## Notes

- The host currently supports shared command loading, shared query helpers, and per-bot overrides.
- Bot-specific code should stay inside the bot folder unless it is meant to be shared across every bot.
