const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");

const { findBots } = require("../core/botDiscovery");

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 20 * 1024 * 1024;
const BOT_NAME_RE = /^[A-Za-z0-9_-]+$/;
const DISCORD_TOKEN_RE = /\b[\w-]{23,}\.[\w-]{5,}\.[\w-]{20,}\b/g;
const ANSI_RE = /\u001b\[[0-9;]*m/g;
const CONTROL_TOKEN = String(process.env.TOKEN ?? "").trim();

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitive(text) {
	if (typeof text !== "string") return "";

	let redacted = text.replace(ANSI_RE, "").replace(DISCORD_TOKEN_RE, "[redacted-discord-token]");

	if (CONTROL_TOKEN) {
		redacted = redacted.replace(new RegExp(escapeRegExp(CONTROL_TOKEN), "g"), "[redacted-token]");
	}

	return redacted;
}

function normalizeBotName(botName) {
	if (typeof botName !== "string") return null;

	const trimmed = botName.trim();

	if (!trimmed || !BOT_NAME_RE.test(trimmed)) return null;

	return trimmed;
}

function getKnownBots() {
	return new Map(findBots().map((bot) => [bot.name, bot]));
}

function assertKnownBotName(botName) {
	const normalized = normalizeBotName(botName);

	if (!normalized) {
		throw new Error("A valid bot name is required.");
	}

	const knownBots = getKnownBots();

	if (!knownBots.has(normalized)) {
		throw new Error(`Unknown bot: ${normalized}`);
	}

	return normalized;
}

async function runExecFile(file, args, options = {}) {
	try {
		const result = await execFileAsync(file, args, {
			cwd: options.cwd ?? process.cwd(),
			env: process.env,
			encoding: "utf8",
			maxBuffer: options.maxBuffer ?? MAX_BUFFER
		});

		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? ""
		};
	} catch (error) {
		const stdout = redactSensitive(error.stdout ?? "");
		const stderr = redactSensitive(error.stderr ?? "");
		const reason = stderr || stdout || redactSensitive(error.message || "Unknown command failure");
		const command = [file, ...(args ?? [])].join(" ");
		const wrapped = new Error(`Command failed: ${command}\n${reason}`.trim());
		wrapped.cause = error;
		wrapped.stdout = stdout;
		wrapped.stderr = stderr;
		throw wrapped;
	}
}

async function runPm2(args, options = {}) {
	return runExecFile("npx", ["--no-install", "pm2", ...args], options);
}

async function runGit(args, options = {}) {
	return runExecFile("git", args, options);
}

async function runNpm(args, options = {}) {
	return runExecFile("npm", args, options);
}

function getPm2ProcessMap(processes) {
	return new Map(
		(Array.isArray(processes) ? processes : [])
			.filter((process) => process && typeof process.name === "string")
			.map((process) => [process.name, process])
	);
}

async function getProcessList() {
	const { stdout } = await runPm2(["jlist"]);
	const trimmed = stdout.trim();

	if (!trimmed) return [];

	let parsed;

	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		const wrapped = new Error("Failed to parse PM2 jlist output.");
		wrapped.cause = error;
		wrapped.stdout = redactSensitive(trimmed);
		throw wrapped;
	}

	return Array.isArray(parsed) ? parsed : [];
}

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function formatStatusRecord(botName, process = null) {
	const pm2Env = process?.pm2_env ?? {};
	const monit = process?.monit ?? {};
	const memoryBytes = toNumber(monit.memory);
	const cpuPercent = toNumber(monit.cpu);
	const uptime = toNumber(pm2Env.pm_uptime);
	const status = pm2Env.status ?? process?.status ?? "stopped";

	return {
		name: botName,
		status,
		pid: toNumber(process?.pid ?? pm2Env.pid),
		uptime: uptime != null ? Math.max(0, Date.now() - uptime) : null,
		memoryMb: memoryBytes != null ? Math.floor(memoryBytes / 1024 / 1024) : null,
		cpuPercent,
		restartCount: toNumber(pm2Env.restart_time) ?? 0,
		inPm2: Boolean(process)
	};
}

async function listBots() {
	const bots = findBots().sort((left, right) => left.name.localeCompare(right.name));
	const processes = getPm2ProcessMap(await getProcessList());

	return bots.map((bot) => formatStatusRecord(bot.name, processes.get(bot.name) ?? null));
}

async function getBotStatus(botName) {
	const normalized = assertKnownBotName(botName);
	const processes = getPm2ProcessMap(await getProcessList());

	return formatStatusRecord(normalized, processes.get(normalized) ?? null);
}

async function restartBot(botName) {
	const normalized = assertKnownBotName(botName);
	return runPm2(["restart", normalized, "--update-env"]);
}

async function stopBot(botName) {
	const normalized = assertKnownBotName(botName);
	return runPm2(["stop", normalized]);
}

async function startBot(botName) {
	const normalized = assertKnownBotName(botName);
	return runPm2(["start", path.join(process.cwd(), "ecosystem.config.js"), "--only", normalized, "--update-env"]);
}

async function getBotLogs(botName, lines = 80) {
	const normalized = assertKnownBotName(botName);
	const parsedLines = Number(lines);
	const safeLines = Number.isFinite(parsedLines) ? Math.max(1, Math.min(500, Math.floor(parsedLines))) : 80;
	const { stdout, stderr } = await runPm2(["logs", normalized, "--lines", String(safeLines), "--nostream"]);

	return redactSensitive(`${stdout}${stderr}`);
}

async function isGitRepo(cwd) {
	try {
		const { stdout } = await runGit(["-C", cwd, "rev-parse", "--is-inside-work-tree"]);
		return stdout.trim() === "true";
	} catch {
		return false;
	}
}

async function isSubmodule(cwd) {
	try {
		const { stdout } = await runGit(["-C", cwd, "rev-parse", "--show-superproject-working-tree"]);
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

async function getGitHead(cwd) {
	const { stdout } = await runGit(["-C", cwd, "rev-parse", "HEAD"]);
	return stdout.trim() || null;
}

async function packageFilesChanged(cwd, oldHead, newHead) {
	if (!oldHead || !newHead || oldHead === newHead) return false;

	const { stdout } = await runGit(
		["-C", cwd, "diff", "--name-only", oldHead, newHead, "--", "package.json", "package-lock.json"]
	);

	return stdout.trim().length > 0;
}

async function updateBot(botName) {
	const normalized = assertKnownBotName(botName);
	const bot = getKnownBots().get(normalized);

	if (!bot) {
		throw new Error(`Unknown bot: ${normalized}`);
	}

	const botRoot = bot.root;
	const repoRoot = process.cwd();

	if (!(await isGitRepo(botRoot))) {
		throw new Error(`Bot folder is not a git repository: ${normalized}`);
	}

	const oldHead = await getGitHead(botRoot);
	const useSubmoduleUpdate = await isSubmodule(botRoot);

	if (useSubmoduleUpdate) {
		await runGit(["submodule", "update", "--remote", "--", `bots/${normalized}`], { cwd: repoRoot });
	} else {
		await runGit(["-C", botRoot, "pull", "--ff-only"]);
	}

	const newHead = await getGitHead(botRoot);
	const shouldInstall = await packageFilesChanged(botRoot, oldHead, newHead);

	if (shouldInstall) {
		await runNpm(["install"], { cwd: botRoot });
	}

	await runNpm(["run", "build:ecosystem"], { cwd: repoRoot });
	await restartBot(normalized);

	return {
		botName: normalized,
		oldHead,
		newHead,
		usedSubmoduleUpdate: useSubmoduleUpdate,
		ranInstall: shouldInstall
	};
}

module.exports = {
	getBotLogs,
	getBotStatus,
	listBots,
	redactSensitive,
	restartBot,
	startBot,
	stopBot,
	updateBot
};
