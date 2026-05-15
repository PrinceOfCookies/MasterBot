const chalk = require("chalk");
const { findBotByName, startBot } = require("../core/botLoader");

let activeClient = null;
let shuttingDown = false;

function getBotName() {
	const botName = process.env.BOT_NAME;

	if (!botName) {
		throw new Error("BOT_NAME is required for botWorker.js");
	}

	return botName;
}

async function shutdown(code = 0) {
	if (shuttingDown) return;
	shuttingDown = true;

	const botName = process.env.BOT_NAME ?? "unknown";
	console.log(chalk.yellow(`[${botName}] Worker shutting down`));

	try {
		if (typeof activeClient?.destroy === "function") {
			await activeClient.destroy();
		}
	} catch (error) {
		console.error(chalk.red(`[${botName}] Failed to destroy Discord client`), error);
	}

	try {
		if (activeClient?.sql && typeof activeClient.sql.end === "function") {
			await new Promise((resolve) => {
				activeClient.sql.end(() => resolve());
			});
		}
	} catch (error) {
		console.error(chalk.red(`[${botName}] Failed to close SQL pool`), error);
	}

	process.exit(code);
}

function handleFatal(error) {
	const botName = process.env.BOT_NAME ?? "unknown";
	console.error(chalk.red(`[${botName}] Worker fatal error`), error);
	process.exit(1);
}

process.once("SIGINT", () => {
	void shutdown(0);
});

process.once("SIGTERM", () => {
	void shutdown(0);
});

process.once("uncaughtException", handleFatal);
process.once("unhandledRejection", handleFatal);

async function main() {
	const botName = getBotName();
	console.log(chalk.blue(`[${botName}] Worker starting`));

	const bot = findBotByName(botName);

	if (!bot) {
		throw new Error(`Bot not found: ${botName}`);
	}

	activeClient = await startBot(bot);
	console.log(chalk.green(`[${botName}] Worker ready`));
}

main().catch(handleFatal);
