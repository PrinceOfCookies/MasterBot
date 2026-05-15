function toNumber(value) {
	const number = Number(value);

	return Number.isFinite(number) ? number : null;
}

function formatBotStatus(process) {
	if (!process) return null;

	const pm2Env = process.pm2_env ?? {};
	const monit = process.monit ?? {};
	const memoryBytes = toNumber(monit.memory);
	const cpuPercent = toNumber(monit.cpu);
	const startedAt = toNumber(pm2Env.pm_uptime);

	return {
		name: process.name ?? pm2Env.name ?? null,
		status: pm2Env.status ?? null,
		pid: toNumber(process.pid ?? pm2Env.pid),
		uptime: startedAt ? Math.max(0, Date.now() - startedAt) : null,
		memoryMb: memoryBytes != null ? memoryBytes / 1024 / 1024 : null,
		cpuPercent,
		restartCount: toNumber(pm2Env.restart_time) ?? 0
	};
}

function formatAllBotStatuses(processes) {
	if (!Array.isArray(processes)) return [];

	return processes.map(formatBotStatus).filter(Boolean);
}

module.exports = {
	formatAllBotStatuses,
	formatBotStatus
};
