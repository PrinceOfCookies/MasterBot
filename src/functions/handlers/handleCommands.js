const path = require("path");
const { existsSync, readdirSync, statSync } = require("fs");

function collectCommandFiles(folderPath) {
	if (!existsSync(folderPath)) return [];

	const files = [];

	for (const item of readdirSync(folderPath)) {
		const itemPath = path.join(folderPath, item);

		if (statSync(itemPath).isDirectory()) {
			files.push(...collectCommandFiles(itemPath));
			continue;
		}

		if (item.endsWith(".js")) {
			files.push(itemPath);
		}
	}

	return files;
}

module.exports = (client) => {
	client.handleCommands = async () => {
		const commandFiles = collectCommandFiles(client.botPaths.commands);

		for (const filePath of commandFiles) {
			const command = require(filePath);

			if (!command?.data?.name || typeof command.execute !== "function") continue;

			client.commands.set(command.data.name, command);
			client.commandArray.push(command.data.toJSON());
		}
	};
};