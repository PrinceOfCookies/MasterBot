const path = require("path");
const { existsSync, readdirSync, statSync } = require("fs");
const { loadBotEnv } = require("./botEnv");

function findBots() {
	const botsRoot = path.join(process.cwd(), "bots");

	if (!existsSync(botsRoot)) return [];

	return readdirSync(botsRoot)
		.map((folderName) => {
			const botRoot = path.join(botsRoot, folderName);
			const configPath = path.join(botRoot, "index.js");

			if (!statSync(botRoot).isDirectory()) return null;
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
		})
		.filter(Boolean);
}

module.exports = {
	findBots
};