const path = require("path");
const { existsSync, readFileSync, renameSync, writeFileSync } = require("fs");
const { findBots } = require("../src/core/botDiscovery");

function toSortedObject(source = {}) {
	return Object.keys(source)
		.sort()
		.reduce((acc, key) => {
			acc[key] = source[key];
			return acc;
		}, {});
}

function getNodeOptions(pm2 = {}) {
	if (typeof pm2.nodeOptions === "string" && pm2.nodeOptions.trim()) {
		return pm2.nodeOptions;
	}

	if (pm2.maxOldSpaceSize != null) {
		return `--max-old-space-size=${pm2.maxOldSpaceSize}`;
	}

	return "--max-old-space-size=384";
}

function buildApp(bot, cwd) {
	const pm2 = bot.config.pm2 ?? {};
	const env = {
		BOT_NAME: bot.name,
		NODE_ENV: process.env.NODE_ENV ?? "production",
		NODE_OPTIONS: getNodeOptions(pm2)
	};

	for (const [key, value] of Object.entries(toSortedObject(pm2.env ?? {}))) {
		env[key] = value;
	}

	env.BOT_NAME = bot.name;
	env.NODE_ENV = process.env.NODE_ENV ?? "production";
	env.NODE_OPTIONS = getNodeOptions(pm2);

	return {
		name: bot.name,
		script: "src/worker/botWorker.js",
		cwd,
		instances: 1,
		autorestart: true,
		watch: false,
		max_memory_restart: pm2.maxMemoryRestart ?? "512M",
		min_uptime: pm2.minUptime ?? "10s",
		max_restarts: pm2.maxRestarts ?? 10,
		restart_delay: pm2.restartDelay ?? 5000,
		env
	};
}

function buildMonitorApp(cwd) {
	return {
		name: "masterbot-monitor",
		script: "scripts/monitorPm2.js",
		cwd,
		instances: 1,
		autorestart: true,
		watch: false,
		max_memory_restart: "256M",
		min_uptime: "10s",
		max_restarts: 10,
		restart_delay: 5000,
		env: {
			MASTER_HEALTH_MONITOR: "true",
			NODE_ENV: process.env.NODE_ENV ?? "production"
		}
	};
}

function buildWatchdogApp(cwd) {
	return {
		name: "masterbot-watchdog",
		script: "rust/masterbot-watchdog/target/release/masterbot-watchdog",
		args: "--watch --interval 10",
		cwd,
		instances: 1,
		autorestart: true,
		watch: false,
		env: {
			NODE_ENV: process.env.NODE_ENV ?? "production",
			MASTERBOT_WATCHDOG: "1"
		}
	};
}

function buildEcosystemContent(apps) {
	const appsJsonLines = JSON.stringify(apps, null, 2).split("\n");
	const appsJson = [appsJsonLines[0], ...appsJsonLines.slice(1).map((line) => `  ${line}`)].join("\n");

	return `module.exports = {\n  apps: ${appsJson}\n};\n`;
}

function main() {
	const cwd = process.cwd();
	const ecosystemPath = path.join(cwd, "ecosystem.config.js");
	const watchdogBinaryPath = path.join(cwd, "rust/masterbot-watchdog/target/release/masterbot-watchdog");
	const bots = findBots().sort((left, right) => left.name.localeCompare(right.name));
	const apps = [...bots.map((bot) => buildApp(bot, cwd)), buildMonitorApp(cwd)];

	if (existsSync(watchdogBinaryPath)) {
		apps.push(buildWatchdogApp(cwd));
	} else {
		console.log("Skipping masterbot-watchdog PM2 app because release binary was not found.");
	}

	const nextContent = buildEcosystemContent(apps);
	const tempPath = path.join(
		cwd,
		`.ecosystem.config.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
	);

	try {
		const currentContent = readFileSync(ecosystemPath, "utf8");

		if (currentContent === nextContent) {
			console.log("ecosystem.config.js unchanged");
			return;
		}
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}

	writeFileSync(tempPath, nextContent);
	renameSync(tempPath, ecosystemPath);
	console.log(`Built ecosystem.config.js with ${bots.length} bot(s), 1 monitor, and ${existsSync(watchdogBinaryPath) ? "1 watchdog" : "0 watchdog"}.`);
}

main();
