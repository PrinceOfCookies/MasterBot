const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEFAULT_INTERVAL_MS = 5_000;
const MAX_BUFFER = 10 * 1024 * 1024;

let cachedProcesses = [];
let lastRefresh = null;
let started = false;
let startPromise = null;
let intervalId = null;

async function runPm2(args) {
	const result = await execFileAsync("npx", ["--no-install", "pm2", ...args], {
		cwd: process.cwd(),
		env: process.env,
		encoding: "utf8",
		maxBuffer: MAX_BUFFER
	});

	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? ""
	};
}

async function refreshPm2Cache() {
	try {
		const { stdout } = await runPm2(["jlist"]);
		const trimmed = stdout.trim();

		if (!trimmed) {
			cachedProcesses = [];
			lastRefresh = Date.now();
			return;
		}

		const parsed = JSON.parse(trimmed);
		cachedProcesses = Array.isArray(parsed) ? parsed : [];
		lastRefresh = Date.now();
	} catch (error) {
		console.warn("[pm2] Failed to refresh PM2 cache, keeping previous data.", error);
	}
}

function getCachedProcesses() {
	return cachedProcesses.slice();
}

function getCachedProcess(name) {
	return cachedProcesses.find((process) => process?.name === name) ?? null;
}

function getLastRefresh() {
	return lastRefresh;
}

async function startPm2Cache(options = {}) {
	if (started) {
		return startPromise ?? Promise.resolve();
	}

	started = true;
	const intervalMs = Number.isFinite(Number(options.intervalMs))
		? Math.max(1000, Number(options.intervalMs))
		: DEFAULT_INTERVAL_MS;

	startPromise = (async () => {
		await refreshPm2Cache();

		intervalId = setInterval(() => {
			void refreshPm2Cache();
		}, intervalMs);

		if (typeof intervalId.unref === "function") {
			intervalId.unref();
		}
	})();

	return startPromise;
}

module.exports = {
	getCachedProcess,
	getCachedProcesses,
	getLastRefresh,
	startPm2Cache
};
