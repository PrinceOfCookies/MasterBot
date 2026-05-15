const path = require("path");
const { existsSync, readFileSync, writeFileSync } = require("fs");
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

function buildEcosystemContent(apps) {
	const appsJsonLines = JSON.stringify(apps, null, 2).split("\n");
	const appsJson = [appsJsonLines[0], ...appsJsonLines.slice(1).map((line) => `  ${line}`)].join("\n");

	return `module.exports = {\n  apps: ${appsJson}\n};\n`;
}

function main() {
	const cwd = process.cwd();
	const ecosystemPath = path.join(cwd, "ecosystem.config.js");
	const bots = findBots().sort((left, right) => left.name.localeCompare(right.name));
	const apps = bots.map((bot) => buildApp(bot, cwd));
	const nextContent = buildEcosystemContent(apps);

	if (existsSync(ecosystemPath)) {
		const currentContent = readFileSync(ecosystemPath, "utf8");

		if (currentContent === nextContent) {
			console.log("ecosystem.config.js unchanged");
			return;
		}
	}

	writeFileSync(ecosystemPath, nextContent);
	console.log(`Built ecosystem.config.js with ${apps.length} bot(s).`);
}

main();
