const path = require("path");
const { getDiscoveredFiles, getEventFiles } = require("../cache/fileDiscoveryCache");

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

	for (const filePath of folderPath) {
		const fileName = path.basename(filePath);

		if (disabled.has(fileName)) continue;

		registerEvent(client, filePath);
	}
}

function loadEvents(client, bot) {
	const config = bot.config.events ?? {};
	const mode = config.mode ?? "extend";
	const defaultFiles = getDiscoveredFiles(client.botPaths.defaultEvents);
	const botFiles = getEventFiles(client);

	if (mode !== "replace") {
		loadEventsFromFolder(client, defaultFiles, {
			disabled: config.disabled
		});
	}

	loadEventsFromFolder(client, botFiles);
}

module.exports = {
	loadEvents
};