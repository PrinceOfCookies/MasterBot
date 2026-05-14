const path = require("path");
const { existsSync, readdirSync, statSync } = require("fs");

function collectEventFiles(folderPath) {
	if (!existsSync(folderPath)) return [];

	const files = [];

	for (const item of readdirSync(folderPath)) {
		const itemPath = path.join(folderPath, item);

		if (statSync(itemPath).isDirectory()) {
			files.push(...collectEventFiles(itemPath));
			continue;
		}

		if (item.endsWith(".js")) {
			files.push(itemPath);
		}
	}

	return files;
}

function registerEvent(client, filePath) {
	const event = require(filePath);

	if (!event?.name || typeof event.execute !== "function") return;

	const runner = (...args) => event.execute(...args, client);

	if (event.once) {
		client.once(event.name, runner);
	} else {
		client.on(event.name, runner);
	}
}

function loadEventsFromFolder(client, folderPath, options = {}) {
	const disabled = new Set(options.disabled ?? []);

	for (const filePath of collectEventFiles(folderPath)) {
		const fileName = path.basename(filePath);

		if (disabled.has(fileName)) continue;

		registerEvent(client, filePath);
	}
}

function loadEvents(client, bot) {
	const config = bot.config.events ?? {};
	const mode = config.mode ?? "extend";

	if (mode !== "replace") {
		loadEventsFromFolder(client, client.botPaths.defaultEvents, {
			disabled: config.disabled
		});
	}

	loadEventsFromFolder(client, client.botPaths.events);
}

module.exports = {
	loadEvents
};