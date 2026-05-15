const chalk = require("chalk");
const { findBots, findBotByName } = require("./botDiscovery");
const { createClient } = require("./clientfactory");
const { createBotDatabase } = require("./database");
const { loadTools, loadFunctions } = require("./functionloader");
const { loadEvents } = require("./eventloader");
const { createStartupProfiler } = require("./startupProfiler");

function getBotToken(bot) {
	if (bot.config.token) return bot.config.token;
	if (bot.config.tokenEnv) return bot.env[bot.config.tokenEnv] ?? process.env[bot.config.tokenEnv];

	return bot.env.TOKEN ?? process.env.TOKEN;
}

async function startBot(bot) {
	if (bot.config.enabled === false) {
		console.log(chalk.yellow(`[${bot.name}] Disabled in bot config, skipping.`));
		return null;
	}

	const token = getBotToken(bot);

	if (!token) {
		console.log(chalk.red(`[${bot.name}] Missing bot token`));
		return null;
	}

	const profiler = createStartupProfiler(bot.name);
	bot.startupProfiler = profiler;
	const client = createClient(bot);
	client.startupProfiler = profiler;

	try {
		profiler.mark("createClient");

		client.db = await createBotDatabase(bot);
		client.sql = client.db;
		client.connection = client.db;

		loadTools(client, bot);
		profiler.mark("loadTools");
		loadFunctions(client, bot);
		profiler.mark("loadFunctions");

		if (typeof bot.config.setup === "function") {
			await bot.config.setup(client, bot);
		}

		if (bot.config.autoHandleCommands !== false && typeof client.handleCommands === "function") {
			await client.handleCommands();
		}

		loadEvents(client, bot);
		profiler.mark("loadEvents");

		if (bot.config.autoHandleEvents !== false && typeof client.handleEvents === "function") {
			await client.handleEvents();
		}

		await client.login(token);
		profiler.mark("login");

		if (typeof bot.config.afterLogin === "function") {
			await bot.config.afterLogin(client, bot);
			profiler.mark("afterLogin");
		}

		console.log(chalk.green(`[${bot.name}] Logged in as ${client.user.tag}`));

		return client;
	} finally {
		profiler.end();
	}
}

async function startAllBots() {
	const bots = findBots();

	if (bots.length === 0) {
		console.log(chalk.red("No bots found in ./bots"));
		return;
	}

	await Promise.all(
		bots.map((bot) =>
			startBot(bot).catch((err) => {
				console.error(chalk.red(`[${bot.name}] Failed to start`), err);
			})
		)
	);
}

module.exports = {
	findBotByName,
	startAllBots,
	startBot
};
