const path = require("path");
const dotenv = require("dotenv");
const { existsSync } = require("fs");

function loadBotEnv(botRoot, envFile = ".env") {
	const envPath = path.join(botRoot, envFile);

	if (!existsSync(envPath)) return {};

	return dotenv.config({ path: envPath, quiet: true }).parsed ?? {};
}

module.exports = {
	loadBotEnv
};
