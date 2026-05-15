const path = require("path");
const { getFunctionFiles, getToolFiles } = require("../cache/fileDiscoveryCache");

function loadFile(filePath, client) {
	const loaded = require(filePath);

	if (typeof loaded === "function") {
		return loaded(client);
	}

	return loaded;
}

function createLazyLoader(client, filePath) {
	let loaded = false;
	let cachedValue;

	return function lazyLoader() {
		if (loaded) {
			return cachedValue ?? client;
		}

		delete require.cache[require.resolve(filePath)];
		const moduleExport = require(filePath);
		cachedValue = typeof moduleExport === "function" ? moduleExport(client) : moduleExport;
		loaded = true;
		console.log(chalk.blue(`[${client.botName}] Lazy-loaded function ${path.basename(filePath)}`));

		return cachedValue ?? client;
	};
}

function getFunctionConfigSet(values = []) {
	return new Set((Array.isArray(values) ? values : []).map((value) => path.basename(String(value))));
}

function loadFolder(filePaths, client, options = {}) {
	const excluded = new Set(options.exclude ?? []);
	const manual = new Set(options.manual ?? []);
	const lazy = new Set(options.lazy ?? []);

	for (const filePath of filePaths) {
		const fileName = path.basename(filePath);

		if (excluded.has(fileName)) continue;
		if (manual.has(fileName)) continue;
		if (lazy.has(fileName)) continue;

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
	const { defaultFiles: defaultToolFiles, botFiles: botToolFiles } = getToolFiles(client);

	if (mode !== "replace") {
		loadFolder(defaultToolFiles, client, {
			exclude: config.disabled
		});
	}

	loadFolder(botToolFiles, client, {
		exclude: config.exclude
	});
}

function loadFunctions(client, bot) {
	const config = bot.config.functions ?? {};
	const mode = config.mode ?? "extend";
	const { defaultFiles, botFiles } = getFunctionFiles(client);
	const manual = getFunctionConfigSet(config.manual);
	const lazy = getFunctionConfigSet(config.lazy);
	const discoveredFunctionFiles = new Map();
	const lazyTargets = new Map();

	client.loadFunction = (filePath) => loadManualFunction(client, filePath);
	client.lazyFunctions = Object.create(null);

	for (const filePath of [...defaultFiles, ...botFiles]) {
		discoveredFunctionFiles.set(path.basename(filePath), filePath);
	}

	if (mode !== "replace") {
		loadFolder(defaultFiles, client, {
			exclude: config.disabled,
			manual: config.manual,
			lazy: config.lazy
		});
	}

	loadFolder(botFiles, client, {
		exclude: config.exclude,
		manual: config.manual,
		lazy: config.lazy
	});

	for (const configuredName of Array.isArray(config.lazy) ? config.lazy : []) {
		const fileName = path.basename(String(configuredName));

		if (manual.has(fileName)) continue;

		const resolvedPath = path.isAbsolute(String(configuredName))
			? String(configuredName)
			: discoveredFunctionFiles.get(fileName) ??
				path.join(client.botPaths.functions, fileName.endsWith(".js") ? fileName : `${fileName}.js`);

		lazyTargets.set(fileName, resolvedPath);
	}

	for (const [fileName, filePath] of lazyTargets.entries()) {
		client.lazyFunctions[fileName.replace(/\.js$/i, "")] = createLazyLoader(client, filePath);
	}
}

module.exports = {
	loadTools,
	loadFunctions
};