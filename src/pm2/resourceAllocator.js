const os = require("os");

function getSystemResources() {
	const totalMemoryMb = Math.floor(os.totalmem() / 1024 / 1024);
	const cpuBudgetPercent = 95;
	const memoryBudgetMb = Math.floor(totalMemoryMb * 0.95);

	return {
		totalMemoryMb,
		cpuBudgetPercent,
		memoryBudgetMb
	};
}

function getBotGuardrails(bot) {
	return bot?.config?.guardrails ?? {};
}

function isOverrideValue(value) {
	return value !== undefined && value !== null;
}

function calculateBotAllocations(bots) {
	const sortedBots = Array.isArray(bots)
		? [...bots].sort((left, right) => left.name.localeCompare(right.name))
		: [];
	const botCount = sortedBots.length;
	const resources = getSystemResources();
	const defaultCpuPercent = botCount > 0 ? resources.cpuBudgetPercent / botCount : 0;
	const defaultMemoryMb = botCount > 0 ? Math.floor(resources.memoryBudgetMb / botCount) : 0;
	const allocations = new Map();

	for (const bot of sortedBots) {
		const guardrails = getBotGuardrails(bot);
		const hasCpuOverride = isOverrideValue(guardrails.cpuPercent);
		const hasMemoryOverride = isOverrideValue(guardrails.memoryMb);
		const cpuPercent = hasCpuOverride ? Number(guardrails.cpuPercent) : defaultCpuPercent;
		const memoryMb = hasMemoryOverride ? Number(guardrails.memoryMb) : defaultMemoryMb;

		allocations.set(bot.name, {
			botName: bot.name,
			cpuPercent,
			memoryMb,
			isCpuTooLow: !hasCpuOverride && cpuPercent < 30,
			isMemoryTooLow: !hasMemoryOverride && memoryMb <= 350,
			source: {
				cpuPercent: hasCpuOverride ? "override" : "auto",
				memoryMb: hasMemoryOverride ? "override" : "auto"
			}
		});
	}

	return allocations;
}

module.exports = {
	calculateBotAllocations,
	getSystemResources
};
