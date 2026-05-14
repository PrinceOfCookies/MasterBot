const path = require("path");
const { existsSync, readdirSync, statSync } = require("fs");

function collectJsFiles(folderPath) {
	if (!existsSync(folderPath)) return [];

	const files = [];

	for (const item of readdirSync(folderPath)) {
		const itemPath = path.join(folderPath, item);

		if (statSync(itemPath).isDirectory()) {
			files.push(...collectJsFiles(itemPath));
			continue;
		}

		if (item.endsWith(".js")) {
			files.push(itemPath);
		}
	}

	return files;
}

function loadFile(filePath, client) {
	const loaded = require(filePath);

	if (typeof loaded === "function") {
		loaded(client);
	}
}

function loadFolder(folderPath, client, options = {}) {
	const excluded = new Set(options.exclude ?? []);
	const manual = new Set(options.manual ?? []);

	for (const filePath of collectJsFiles(folderPath)) {
		const fileName = path.basename(filePath);

		if (excluded.has(fileName)) continue;
		if (manual.has(fileName)) continue;

		loadFile(filePath, client);
	}
}

function loadManualFunction(client, filePath) {
	const resolvedPath = path.isAbsolute(filePath)
		? filePath
		: path.join(client.botRoot, filePath);

	loadFile(resolvedPath, client);
}

function loadTools(client, bot) {
	const config = bot.config.tools ?? {};
	const mode = config.mode ?? "extend";

	if (mode !== "replace") {
		loadFolder(client.botPaths.defaultTools, client, {
			exclude: config.disabled
		});
	}

	loadFolder(client.botPaths.tools, client, {
		exclude: config.exclude
	});
}

function loadFunctions(client, bot) {
	const config = bot.config.functions ?? {};
	const mode = config.mode ?? "extend";

	client.loadFunction = (filePath) => loadManualFunction(client, filePath);

	if (mode !== "replace") {
		loadFolder(client.botPaths.defaultFunctions, client, {
			exclude: config.disabled,
			manual: config.manual
		});
	}

	loadFolder(client.botPaths.functions, client, {
		exclude: config.exclude,
		manual: config.manual
	});
}

module.exports = {
	loadTools,
	loadFunctions
};