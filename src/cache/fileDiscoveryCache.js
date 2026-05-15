const path = require("path");
const { existsSync, readdirSync } = require("fs");

const discoveryCache = new Map();

function discoverJsFiles(rootPath) {
	if (!rootPath) return [];

	const resolvedRoot = path.resolve(rootPath);

	if (discoveryCache.has(resolvedRoot)) {
		return discoveryCache.get(resolvedRoot).slice();
	}

	if (!existsSync(resolvedRoot)) {
		discoveryCache.set(resolvedRoot, []);
		return [];
	}

	const files = [];

	for (const entry of readdirSync(resolvedRoot, { withFileTypes: true })) {
		const entryPath = path.join(resolvedRoot, entry.name);

		if (entry.isDirectory()) {
			files.push(...discoverJsFiles(entryPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".js")) {
			files.push(entryPath);
		}
	}

	files.sort((left, right) => left.localeCompare(right));
	discoveryCache.set(resolvedRoot, files);

	return files.slice();
}

function getDiscoveredFiles(rootPath) {
	return discoverJsFiles(rootPath);
}

function getCommandFiles(client) {
	return discoverJsFiles(client?.botPaths?.commands);
}

function getEventFiles(client) {
	return discoverJsFiles(client?.botPaths?.events);
}

function getFunctionFiles(client) {
	return {
		defaultFiles: discoverJsFiles(client?.botPaths?.defaultFunctions),
		botFiles: discoverJsFiles(client?.botPaths?.functions)
	};
}

function getToolFiles(client) {
	return {
		defaultFiles: discoverJsFiles(client?.botPaths?.defaultTools),
		botFiles: discoverJsFiles(client?.botPaths?.tools)
	};
}

module.exports = {
	getDiscoveredFiles,
	getCommandFiles,
	getEventFiles,
	getFunctionFiles,
	getToolFiles
};
