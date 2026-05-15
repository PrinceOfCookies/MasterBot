function formatValue(value, suffix = "") {
	if (value == null) return "n/a";
	if (typeof value === "number" && Number.isFinite(value)) return `${value}${suffix}`;
	return String(value);
}

function buildAlertMessage(alert) {
	const lines = [
		`[health] ${alert.botName} ${alert.eventType}`,
		`status: ${formatValue(alert.oldStatus)} -> ${formatValue(alert.newStatus)}`,
		`pid: ${formatValue(alert.pid)}`,
		`uptime: ${formatValue(alert.uptimeMs, "ms")}`,
		`memory: ${formatValue(alert.memoryMb, "MB")}`,
		`cpu: ${formatValue(alert.cpuPercent, "%")}`,
		`restartCount: ${formatValue(alert.restartCount)}`,
		`action: ${formatValue(alert.actionTaken)}`
	];

	if (alert.allocationCpuPercent != null || alert.allocationMemoryMb != null) {
		lines.push(
			`allocation: cpu=${formatValue(alert.allocationCpuPercent, "%")} memory=${formatValue(alert.allocationMemoryMb, "MB")}`
		);
	}

	if (alert.allocationSource) {
		lines.push(
			`allocationSource: cpu=${formatValue(alert.allocationSource.cpuPercent)} memory=${formatValue(alert.allocationSource.memoryMb)}`
		);
	}

	if (Array.isArray(alert.issues) && alert.issues.length > 0) {
		lines.push(`issues: ${alert.issues.map((issue) => issue.eventType).join(", ")}`);
	}

	if (alert.details) {
		lines.push(`details: ${alert.details}`);
	}

	return lines.join("\n");
}

async function sendWebhookAlert(message) {
	const webhookUrl = process.env.MASTER_ALERT_WEBHOOK;

	if (!webhookUrl) return;

	try {
		await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				content: message
			})
		});
	} catch (error) {
		console.warn("[health] failed to send webhook alert", error);
	}
}

async function sendAlert(alert) {
	const message = buildAlertMessage(alert);
	console.warn(message);
	await sendWebhookAlert(message);
}

module.exports = {
	buildAlertMessage,
	sendAlert
};
