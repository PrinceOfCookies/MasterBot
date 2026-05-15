function createStartupProfiler(botName) {
	const start = process.hrtime.bigint();
	let lastMark = start;
	const marks = [];
	let ended = false;

	function mark(label) {
		if (ended || typeof label !== "string" || !label) return 0;

		const now = process.hrtime.bigint();
		const durationMs = Number(now - lastMark) / 1_000_000;

		marks.push({
			label,
			durationMs: Math.max(0, durationMs)
		});

		lastMark = now;

		return durationMs;
	}

	function end() {
		if (ended) return;
		ended = true;

		if (marks.length === 0) return;

		console.log(`[${botName}] Startup timings:`);

		for (const markEntry of marks) {
			console.log(`- ${markEntry.label}: ${markEntry.durationMs.toFixed(0)}ms`);
		}
	}

	return {
		end,
		mark
	};
}

module.exports = {
	createStartupProfiler
};
