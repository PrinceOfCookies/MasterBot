const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const { findBots } = require("../core/botDiscovery");
const { getCachedProcess, getCachedProcesses } = require("./pm2Cache");

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

function getKnownBotNames() {
	return new Set(findBots().map((bot) => bot.name));
}

function assertKnownBotName(name) {
	if (typeof name !== "string" || !name.trim()) {
		throw new Error("A bot name is required.");
	}

	const knownBotNames = getKnownBotNames();

	if (!knownBotNames.has(name)) {
		throw new Error(`Unknown bot: ${name}`);
	}
}

async function runPm2(args) {
	try {
		const result = await execFileAsync("npx", ["pm2", ...args], {
			cwd: process.cwd(),
			env: process.env,
			encoding: "utf8",
			maxBuffer: MAX_BUFFER
		});

		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? ""
		};
	} catch (error) {
		const stdout = error.stdout ?? "";
		const stderr = error.stderr ?? "";
		const reason = stderr || stdout || error.message;
		const message = `[pm2] command failed: npx pm2 ${args.join(" ")}`;
		const wrapped = new Error(reason ? `${message}\n${reason}` : message);
		wrapped.cause = error;
		wrapped.stdout = stdout;
		wrapped.stderr = stderr;
		throw wrapped;
	}
}

async function getProcessList() {
	return getCachedProcesses();
}

async function getProcessByName(name) {
	return getCachedProcess(name) ?? null;
}

async function restartProcess(name) {
	assertKnownBotName(name);
	return runPm2(["restart", name, "--update-env"]);
}

async function stopProcess(name) {
	assertKnownBotName(name);
	return runPm2(["stop", name]);
}

async function startProcess(name) {
	assertKnownBotName(name);
	return runPm2(["start", path.join(process.cwd(), "ecosystem.config.js"), "--only", name, "--update-env"]);
}

async function getLogs(name, lines = 50) {
	assertKnownBotName(name);
	const safeLines = Number.isFinite(Number(lines)) ? Math.max(1, Math.floor(Number(lines))) : 50;
	const { stdout, stderr } = await runPm2(["logs", name, "--lines", String(safeLines), "--nostream"]);
	return `${stdout}${stderr}`;
}

module.exports = {
	getLogs,
	getProcessByName,
	getProcessList,
	restartProcess,
	startProcess,
	stopProcess
};
