const path = require("path");
const { existsSync, readdirSync, statSync } = require("fs");
const { loadBotEnv } = require("./botenv");

function loadBotRecord(botRoot, folderName) {
	const configPath = path.join(botRoot, "index.js");

	if (!existsSync(configPath)) return null;

	delete require.cache[require.resolve(configPath)];

	const config = require(configPath);
	const env = loadBotEnv(botRoot, config.envFile ?? ".env");

	return {
		name: folderName,
		root: botRoot,
		config,
		env
	};
}

function findBots() {
	const botsRoot = path.join(process.cwd(), "bots");

	if (!existsSync(botsRoot)) return [];

	return readdirSync(botsRoot)
		.map((folderName) => {
			const botRoot = path.join(botsRoot, folderName);

			if (!statSync(botRoot).isDirectory()) return null;

			return loadBotRecord(botRoot, folderName);
		})
		.filter(Boolean);
}

function findBotByName(botName) {
	const botRoot = path.join(process.cwd(), "bots", botName);

	if (!existsSync(botRoot) || !statSync(botRoot).isDirectory()) return null;

	return loadBotRecord(botRoot, botName);
}

module.exports = {
	findBots,
	findBotByName
};
