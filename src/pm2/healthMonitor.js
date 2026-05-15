const { findBots } = require("../core/botDiscovery");
const { getProcessList, restartProcess, stopProcess } = require("./pm2Client");
const { sendAlert } = require("./alertSink");
const { formatBotStatus } = require("./statusFormatter");
const { calculateBotAllocations, getSystemResources } = require("./resourceAllocator");

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_ALERT_COOLDOWN_MS = 60_000;

const stateByBot = new Map();
let allocationSignature = null;
let allocationMap = new Map();
let allocationResources = null;

function getEnabledBots() {
	return findBots()
		.filter((bot) => bot?.config?.enabled !== false)
		.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeGuardrails(guardrails = {}, allocation = null) {
	return {
		memoryMb: guardrails.memoryMb ?? allocation?.memoryMb ?? null,
		cpuPercent: guardrails.cpuPercent ?? allocation?.cpuPercent ?? null,
		cpuSamples: Number.isFinite(Number(guardrails.cpuSamples)) ? Math.max(1, Math.floor(Number(guardrails.cpuSamples))) : 3,
		action: guardrails.action ?? "alert",
		alertCooldownMs: Number.isFinite(Number(guardrails.alertCooldownMs))
			? Math.max(0, Number(guardrails.alertCooldownMs))
			: DEFAULT_ALERT_COOLDOWN_MS
	};
}

function getBotState(botName) {
	if (!stateByBot.has(botName)) {
		stateByBot.set(botName, {
			botName,
			pm2Status: null,
			pid: null,
			uptime: null,
			memoryBytes: null,
			memoryMb: null,
			cpuPercent: null,
			restartCount: 0,
			unstableRestarts: 0,
			lastSeenAt: null,
			lastAlertAt: 0,
			lastAllocationAlertAtByType: {
				low_cpu_allocation: 0,
				low_memory_allocation: 0
			},
			_cpuOverSamples: 0,
			_suppressNextRestartCountAlert: false
		});
	}

	return stateByBot.get(botName);
}

function isAlertAllowed(state, alertCooldownMs, now) {
	return !state.lastAlertAt || now - state.lastAlertAt >= alertCooldownMs;
}

function isAllocationAlertAllowed(state, eventType, cooldownMs, now) {
	const lastAlertAt = state.lastAllocationAlertAtByType[eventType] ?? 0;

	return !lastAlertAt || now - lastAlertAt >= cooldownMs;
}

function recordAllocationAlert(state, eventType, now) {
	state.lastAllocationAlertAtByType[eventType] = now;
}

function withAllocation(alert, allocation) {
	if (!allocation) return alert;

	return {
		...alert,
		allocationCpuPercent: allocation.cpuPercent,
		allocationMemoryMb: allocation.memoryMb,
		allocationSource: allocation.source
	};
}

function buildMissingAlert(botName, previousState, allocation) {
	return withAllocation(
		{
			botName,
			eventType: "process_missing",
			oldStatus: previousState.pm2Status,
			newStatus: "missing",
			pid: previousState.pid,
			uptimeMs: previousState.uptime,
			memoryMb: previousState.memoryMb,
			cpuPercent: previousState.cpuPercent,
			restartCount: previousState.restartCount,
			actionTaken: "none",
			details: "Process is not present in PM2."
		},
		allocation
	);
}

function buildStatusChangeAlert(botName, previousState, currentStatus, allocation) {
	return withAllocation(
		{
			botName,
			eventType: "status_change",
			oldStatus: previousState.pm2Status,
			newStatus: currentStatus.status,
			pid: currentStatus.pid,
			uptimeMs: currentStatus.uptime,
			memoryMb: currentStatus.memoryMb,
			cpuPercent: currentStatus.cpuPercent,
			restartCount: currentStatus.restartCount,
			actionTaken: "none",
			details: "PM2 status changed."
		},
		allocation
	);
}

function buildRestartAlert(botName, previousState, currentStatus, allocation) {
	return withAllocation(
		{
			botName,
			eventType: "restart_count_increase",
			oldStatus: previousState.pm2Status,
			newStatus: currentStatus.status,
			pid: currentStatus.pid,
			uptimeMs: currentStatus.uptime,
			memoryMb: currentStatus.memoryMb,
			cpuPercent: currentStatus.cpuPercent,
			restartCount: currentStatus.restartCount,
			actionTaken: "none",
			details: `Restart count increased from ${previousState.restartCount} to ${currentStatus.restartCount}.`
		},
		allocation
	);
}

function buildGuardrailAlert(botName, previousState, currentStatus, issue, actionTaken, allocation) {
	return withAllocation(
		{
			botName,
			eventType: issue.eventType,
			oldStatus: previousState.pm2Status,
			newStatus: currentStatus.status,
			pid: currentStatus.pid,
			uptimeMs: currentStatus.uptime,
			memoryMb: currentStatus.memoryMb,
			cpuPercent: currentStatus.cpuPercent,
			restartCount: currentStatus.restartCount,
			actionTaken,
			details: issue.details
		},
		allocation
	);
}

function buildAllocationAlert(botName, allocation, eventType, details) {
	return withAllocation(
		{
			botName,
			eventType,
			oldStatus: null,
			newStatus: null,
			pid: null,
			uptimeMs: null,
			memoryMb: allocation.memoryMb,
			cpuPercent: allocation.cpuPercent,
			restartCount: 0,
			actionTaken: "alert",
			details
		},
		allocation
	);
}

async function applyGuardrailAction(botName, action) {
	if (action === "restart") {
		console.log(`[pm2] ${botName} restart requested by health monitor`);
		await restartProcess(botName);
		return "restart";
	}

	if (action === "stop") {
		console.log(`[pm2] ${botName} stop requested by health monitor`);
		await stopProcess(botName);
		return "stop";
	}

	return "alert";
}

function getAllocationSignature(bots) {
	return bots
		.map((bot) => {
			const guardrails = bot.config.guardrails ?? {};
			const sortedGuardrails = {};

			for (const key of Object.keys(guardrails).sort()) {
				sortedGuardrails[key] = guardrails[key];
			}

			return `${bot.name}:${JSON.stringify(sortedGuardrails)}`;
		})
		.join("|");
}

function logAllocations(resources, bots, allocations) {
	console.log(`[health] Resource budget: ${resources.memoryBudgetMb} MB memory, ${resources.cpuBudgetPercent}% CPU`);

	for (const bot of bots) {
		const allocation = allocations.get(bot.name);

		if (!allocation) continue;

		console.log(
			`[health] Bot allocation: ${bot.name} cpu=${allocation.cpuPercent.toFixed(2)}% memory=${Math.floor(
				allocation.memoryMb
			)}MB (source cpu=${allocation.source.cpuPercent} memory=${allocation.source.memoryMb})`
		);
	}
}

async function sendAllocationWarnings(bots, allocations, now) {
	for (const bot of bots) {
		const allocation = allocations.get(bot.name);

		if (!allocation) continue;

		const state = getBotState(bot.name);
		const guardrails = normalizeGuardrails(bot.config.guardrails, allocation);

		if (allocation.isCpuTooLow && isAllocationAlertAllowed(state, "low_cpu_allocation", guardrails.alertCooldownMs, now)) {
			recordAllocationAlert(state, "low_cpu_allocation", now);

			await sendAlert(
				buildAllocationAlert(
					bot.name,
					allocation,
					"low_cpu_allocation",
					`Automatic CPU allocation is ${allocation.cpuPercent.toFixed(2)}%, below the 30% minimum warning threshold.`
				)
			);
		}

		if (
			allocation.isMemoryTooLow &&
			isAllocationAlertAllowed(state, "low_memory_allocation", guardrails.alertCooldownMs, now)
		) {
			recordAllocationAlert(state, "low_memory_allocation", now);

			await sendAlert(
				buildAllocationAlert(
					bot.name,
					allocation,
					"low_memory_allocation",
					`Automatic memory allocation is ${Math.floor(allocation.memoryMb)}MB, at or below the 350MB warning threshold.`
				)
			);
		}
	}
}

function refreshAllocationsIfNeeded(bots, now, force = false) {
	const signature = getAllocationSignature(bots);

	if (!force && signature === allocationSignature) {
		return false;
	}

	allocationSignature = signature;
	allocationResources = getSystemResources();
	allocationMap = calculateBotAllocations(bots);

	logAllocations(allocationResources, bots, allocationMap);

	return true;
}

async function pollBot(bot, currentProcess, now) {
	const state = getBotState(bot.name);
	const previousState = {
		pm2Status: state.pm2Status,
		pid: state.pid,
		uptime: state.uptime,
		memoryBytes: state.memoryBytes,
		memoryMb: state.memoryMb,
		cpuPercent: state.cpuPercent,
		restartCount: state.restartCount
	};
	const allocation = allocationMap.get(bot.name) ?? null;
	const guardrails = normalizeGuardrails(bot.config.guardrails, allocation);
	const currentStatus = formatBotStatus(currentProcess);
	const currentMemoryBytes = currentProcess?.monit?.memory != null ? Number(currentProcess.monit.memory) : null;

	if (!currentStatus) {
		const missingAlert = buildMissingAlert(bot.name, previousState, allocation);

		state.pm2Status = "missing";
		state.pid = null;
		state.uptime = null;
		state.memoryBytes = null;
		state.memoryMb = null;
		state.cpuPercent = null;
		state.lastSeenAt = now;
		state._cpuOverSamples = 0;
		state._suppressNextRestartCountAlert = false;

		if (isAlertAllowed(state, guardrails.alertCooldownMs, now)) {
			state.lastAlertAt = now;
			await sendAlert(missingAlert);
		}

		return;
	}

	const issues = [];

	if (previousState.pm2Status && previousState.pm2Status !== currentStatus.status) {
		issues.push(buildStatusChangeAlert(bot.name, previousState, currentStatus, allocation));
	}

	if (!state._suppressNextRestartCountAlert && currentStatus.restartCount > previousState.restartCount) {
		state.unstableRestarts += currentStatus.restartCount - previousState.restartCount;
		issues.push(buildRestartAlert(bot.name, previousState, currentStatus, allocation));
	}

	state._suppressNextRestartCountAlert = false;

	if (guardrails.memoryMb != null && currentStatus.memoryMb != null && currentStatus.memoryMb > guardrails.memoryMb) {
		issues.push({
			botName: bot.name,
			eventType: "memory_guardrail",
			threshold: guardrails.memoryMb,
			details: `Memory ${currentStatus.memoryMb.toFixed(2)}MB exceeded ${guardrails.memoryMb}MB.`
		});
	}

	if (guardrails.cpuPercent != null && currentStatus.cpuPercent != null) {
		if (currentStatus.cpuPercent > guardrails.cpuPercent) {
			state._cpuOverSamples += 1;
		} else {
			state._cpuOverSamples = 0;
		}

		if (state._cpuOverSamples >= guardrails.cpuSamples) {
			issues.push({
				botName: bot.name,
				eventType: "cpu_guardrail",
				threshold: guardrails.cpuPercent,
				details: `CPU ${currentStatus.cpuPercent.toFixed(2)}% exceeded ${guardrails.cpuPercent}% for ${state._cpuOverSamples} checks.`
			});
		}
	} else {
		state._cpuOverSamples = 0;
	}

	state.pm2Status = currentStatus.status;
	state.pid = currentStatus.pid;
	state.uptime = currentStatus.uptime;
	state.memoryBytes = currentMemoryBytes;
	state.memoryMb = currentStatus.memoryMb;
	state.cpuPercent = currentStatus.cpuPercent;
	state.restartCount = currentStatus.restartCount;
	state.lastSeenAt = now;

	if (issues.length === 0) return;

	if (!isAlertAllowed(state, guardrails.alertCooldownMs, now)) return;

	let actionTaken = "none";
	const thresholdIssue = issues.find((issue) => issue.eventType === "memory_guardrail" || issue.eventType === "cpu_guardrail");

	if (thresholdIssue && guardrails.action !== "alert") {
		try {
			actionTaken = await applyGuardrailAction(bot.name, guardrails.action);

			if (actionTaken === "restart") {
				state._suppressNextRestartCountAlert = true;
			}
		} catch (error) {
			actionTaken = `${guardrails.action}_failed`;
			issues.push({
				botName: bot.name,
				eventType: "guardrail_action_failed",
				details: `${guardrails.action} failed: ${error.message}`
			});
			console.warn(`[health] ${bot.name} guardrail action failed`, error);
		}
	}

	state.lastAlertAt = now;

	const primaryIssue = thresholdIssue ?? issues[0];

	await sendAlert(
		buildGuardrailAlert(
			bot.name,
			previousState,
			currentStatus,
			primaryIssue,
			actionTaken,
			allocation
		)
	);
}

async function runHealthCheck() {
	const bots = getEnabledBots();
	const allocationsChanged = refreshAllocationsIfNeeded(bots, Date.now());
	const now = Date.now();

	if (allocationsChanged) {
		await sendAllocationWarnings(bots, allocationMap, now);
	}

	let processes;

	try {
		processes = await getProcessList();
	} catch (error) {
		console.warn(`[pm2] failed to read process list`, error);
		return;
	}

	const processByName = new Map(processes.map((process) => [process.name, process]));

	for (const bot of bots) {
		try {
			await pollBot(bot, processByName.get(bot.name) ?? null, now);
		} catch (error) {
			console.warn(`[health] ${bot.name} monitor check failed`, error);
		}
	}
}

function startHealthMonitor(options = {}) {
	const intervalMs = Number.isFinite(Number(options.intervalMs))
		? Math.max(1000, Number(options.intervalMs))
		: DEFAULT_INTERVAL_MS;
	const label = options.label ?? "health";
	let stopped = false;
	let inFlight = false;
	let timer = null;

	async function tick() {
		if (stopped || inFlight) return;

		inFlight = true;

		try {
			await runHealthCheck();
		} catch (error) {
			console.warn(`[${label}] PM2 health monitor tick failed`, error);
		} finally {
			inFlight = false;
		}
	}

	const initialBots = getEnabledBots();
	refreshAllocationsIfNeeded(initialBots, Date.now(), true);

	console.log(`[health] PM2 health monitor started (${intervalMs}ms)`);
	void (async () => {
		await sendAllocationWarnings(initialBots, allocationMap, Date.now());

		if (stopped) return;

		void tick();
		timer = setInterval(() => {
			void tick();
		}, intervalMs);
	})();

	return {
		stop() {
			stopped = true;

			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		runOnce: tick,
		getStateSnapshot() {
			return Array.from(stateByBot.values()).map((state) => ({
				botName: state.botName,
				pm2Status: state.pm2Status,
				pid: state.pid,
				uptime: state.uptime,
				memoryBytes: state.memoryBytes,
				memoryMb: state.memoryMb,
				cpuPercent: state.cpuPercent,
				restartCount: state.restartCount,
				unstableRestarts: state.unstableRestarts,
				lastSeenAt: state.lastSeenAt,
				lastAlertAt: state.lastAlertAt
			}));
		}
	};
}

module.exports = {
	startHealthMonitor
};
