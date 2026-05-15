const path = require("path");
const crypto = require("crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");

const cacheDir = path.join(process.cwd(), ".cache");
const cachePath = path.join(cacheDir, "commandHashes.json");

let loaded = false;
let commandHashes = Object.create(null);

function ensureLoaded() {
	if (loaded) return;
	loaded = true;

	if (!existsSync(cachePath)) {
		commandHashes = Object.create(null);
		return;
	}

	try {
		const raw = readFileSync(cachePath, "utf8").trim();
		const parsed = raw ? JSON.parse(raw) : Object.create(null);
		commandHashes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : Object.create(null);
	} catch (error) {
		console.warn(`[cache] Failed to read command hash cache, starting fresh.`, error);
		commandHashes = Object.create(null);
	}
}

function ensureCacheDir() {
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}
}

function toStableValue(value) {
	if (Array.isArray(value)) {
		return value.map((item) => toStableValue(item));
	}

	if (!value || typeof value !== "object") {
		return value;
	}

	const output = {};

	for (const key of Object.keys(value).sort()) {
		output[key] = toStableValue(value[key]);
	}

	return output;
}

function normalizeCommandData(command) {
	if (command && typeof command === "object" && "data" in command) {
		const data = command.data;

		if (!data) return null;

		return typeof data.toJSON === "function" ? data.toJSON() : data;
	}

	if (command && typeof command === "object") {
		return command;
	}

	const data = command?.data;

	if (!data) return null;

	return typeof data.toJSON === "function" ? data.toJSON() : data;
}

function createCommandHash(commandArray) {
	const normalized = (Array.isArray(commandArray) ? commandArray : [])
		.map((command) => {
			const data = normalizeCommandData(command);
			return {
				name: String(data?.name ?? command?.data?.name ?? command?.name ?? ""),
				data: toStableValue(data)
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name))
		.map((command) => command.data);

	return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function writeCache() {
	ensureCacheDir();

	const sortedHashes = Object.keys(commandHashes)
		.sort()
		.reduce((acc, botName) => {
			acc[botName] = commandHashes[botName];
			return acc;
		}, {});

	writeFileSync(cachePath, `${JSON.stringify(sortedHashes, null, 2)}\n`);
}

function getCommandHash(botName) {
	ensureLoaded();
	return commandHashes[botName] ?? null;
}

function setCommandHash(botName, hash) {
	ensureLoaded();
	commandHashes[botName] = hash;
	writeCache();
}

function hasCommandHashChanged(botName, hash) {
	ensureLoaded();
	return getCommandHash(botName) !== hash;
}

module.exports = {
	createCommandHash,
	getCommandHash,
	hasCommandHashChanged,
	setCommandHash
};
