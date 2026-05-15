const path = require("path");
const chalk = require("chalk");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { getCommandFiles } = require("../../cache/fileDiscoveryCache");
const { createCommandHash, hasCommandHashChanged, setCommandHash } = require("../../cache/commandHashCache");

function getLog(client) {
	if (typeof client.fastLog === "function") {
		return async (...args) => client.fastLog(...args);
	}

	return async (...args) => console.log(...args);
}

function resetCommandState(client) {
	if (typeof client.commands?.clear === "function") {
		client.commands.clear();
	}

	if (typeof client.cooldowns?.clear === "function") {
		client.cooldowns.clear();
	}

	if (Array.isArray(client.commandArray)) {
		client.commandArray.length = 0;
	} else {
		client.commandArray = [];
	}
}

async function refreshSlashCommands(client, commandArray, commandHash) {
	const clientId = client.botEnv?.CLIENT_ID ?? client.botConfig?.clientId;
	const token = client.botEnv?.TOKEN ?? client.botConfig?.token;

	if (!clientId || !token) {
		if (client.startupProfiler) {
			client.startupProfiler.mark("registerCommands");
		}

		return;
	}

	if (!hasCommandHashChanged(client.botName, commandHash)) {
		console.log(`[${client.botName}] Slash commands unchanged, skipping registration`);

		if (client.startupProfiler) {
			client.startupProfiler.mark("registerCommands");
		}

		return;
	}

	const rest = new REST({ version: "10" }).setToken(token);

	try {
		console.log(chalk.blue(`[${client.botName}] Slash commands changed, refreshing`));
		const start = process.hrtime.bigint();
		await rest.put(Routes.applicationCommands(clientId), { body: commandArray });
		setCommandHash(client.botName, commandHash);
		const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
		console.log(
			chalk.green(`[${client.botName}] Refreshed application (/) commands in `) +
				chalk.yellow(`${durationMs.toFixed(3)}ms`)
		);
		if (client.startupProfiler) {
			client.startupProfiler.mark("registerCommands");
		}
	} catch (error) {
		if (client.startupProfiler) {
			client.startupProfiler.mark("registerCommands");
		}

		console.error(chalk.red(`[${client.botName}] Failed to refresh application commands`), error);
	}
}

module.exports = (client) => {
	client.handleCommands = async () => {
		const commandsRoot = client.botPaths?.commands ? path.resolve(client.botPaths.commands) : null;
		const commandFiles = getCommandFiles(client);
		const log = getLog(client);

		resetCommandState(client);

		for (const filePath of commandFiles) {
			const start = process.hrtime.bigint();

			try {
				delete require.cache[require.resolve(filePath)];
				const command = require(filePath);

				if (!command?.data?.name || typeof command.execute !== "function") {
					console.warn(chalk.yellow(`[${client.botName}] Skipping invalid command file: ${filePath}`));
					continue;
				}

				client.commands.set(command.data.name, command);
				client.cooldowns.set(command.data.name, new Map());
				client.commandArray.push(
					typeof command.data.toJSON === "function" ? command.data.toJSON() : command.data
				);

				const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
				const logLabel = path.relative(commandsRoot, path.dirname(filePath)) || ".";
				const commandColor = command.color ?? "#ffffff";

				await log(`${logLabel} Command`, commandColor, command.data.name, durationMs);
			} catch (error) {
				console.error(chalk.red(`[${client.botName}] Failed to load command: ${filePath}`), error);
			}
		}

		if (client.startupProfiler) {
			client.startupProfiler.mark("loadCommands");
		}

		const commandHash = createCommandHash(client.commandArray);

		await refreshSlashCommands(client, client.commandArray, commandHash);
	};
};
