const chalk = require("chalk");
const { findBots } = require("./botdiscovery");
const { createClient } = require("./clientfactory");
const { createBotDatabase } = require("./database");
const { loadTools, loadFunctions } = require("./functionloader");
const { loadEvents } = require("./eventloader");

function getBotToken(bot) {
	if (bot.config.token) return bot.config.token;
	if (bot.config.tokenEnv) return bot.env[bot.config.tokenEnv] ?? process.env[bot.config.tokenEnv];

	return bot.env.TOKEN ?? process.env.TOKEN;
}

async function startBot(bot) {
	const token = getBotToken(bot);

	if (!token) {
		console.log(chalk.red(`[${bot.name}] Missing bot token`));
		return;
	}

	const client = createClient(bot);

	client.db = await createBotDatabase(bot);
	client.sql = client.db;

	loadTools(client, bot);
	loadFunctions(client, bot);

	if (typeof bot.config.setup === "function") {
		await bot.config.setup(client, bot);
	}

	if (bot.config.autoHandleCommands !== false && typeof client.handleCommands === "function") {
		await client.handleCommands();
	}

	loadEvents(client, bot);

	if (bot.config.autoHandleEvents !== false && typeof client.handleEvents === "function") {
		await client.handleEvents();
	}

	await client.login(token);

	if (typeof bot.config.afterLogin === "function") {
		await bot.config.afterLogin(client, bot);
	}

	console.log(chalk.green(`[${bot.name}] Logged in as ${client.user.tag}`));
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
	startAllBots
};