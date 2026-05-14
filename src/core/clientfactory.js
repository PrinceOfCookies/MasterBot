const path = require("path");
const { Client, Collection } = require("discord.js");
const { defaultClientOptions, defaultPaths } = require("../config/defaults");

function mergeClientOptions(options = {}) {
	return {
		...defaultClientOptions,
		...options,

		presence: {
			...defaultClientOptions.presence,
			...(options.presence ?? {})
		},

		allowedMentions: {
			...defaultClientOptions.allowedMentions,
			...(options.allowedMentions ?? {})
		},

		intents: options.intents ?? defaultClientOptions.intents
	};
}

function createClient(bot) {
	const client = new Client(mergeClientOptions(bot.config.clientOptions));

	client.botName = bot.name;
	client.botRoot = bot.root;
	client.botEnv = bot.env;
	client.botConfig = bot.config;

	client.commands = new Collection();
	client.cooldowns = new Collection();
	client.buttons = new Collection();
	client.commandArray = [];

	client.botPaths = {
		tools: path.join(bot.root, bot.config.paths?.tools ?? defaultPaths.tools),
		functions: path.join(bot.root, bot.config.paths?.functions ?? defaultPaths.functions),
		events: path.join(bot.root, bot.config.paths?.events ?? defaultPaths.events),
		commands: path.join(bot.root, bot.config.paths?.commands ?? defaultPaths.commands),
	
		defaultTools: path.join(process.cwd(), defaultPaths.tools),
		defaultFunctions: path.join(process.cwd(), defaultPaths.functions),
		defaultEvents: path.join(process.cwd(), defaultPaths.events),
		defaultCommands: path.join(process.cwd(), defaultPaths.commands)
	};

	client.resolveBotPath = (...parts) => path.join(bot.root, ...parts);
	client.resolveRootPath = (...parts) => path.join(process.cwd(), ...parts);

	return client;
}

module.exports = {
	createClient
};