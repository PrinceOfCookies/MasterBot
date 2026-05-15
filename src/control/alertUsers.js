const { redactSensitive } = require("./pm2Control");

function getAllowedUserIds() {
	return new Set(
		String(process.env.CONTROL_ALLOWED_USERS ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean)
	);
}

async function sendControlAlert(client, message) {
	if (!client?.users?.fetch) {
		console.warn("[control] cannot send DM alert because Discord client is not ready");
		return;
	}

	const allowedUserIds = [...getAllowedUserIds()];
	if (allowedUserIds.length === 0) return;

	const text =
		typeof message === "string"
			? message
			: message instanceof Error
				? message.stack || message.message || String(message)
				: typeof message === "object" && message !== null
					? JSON.stringify(message, null, 2)
					: String(message);
	const redacted = redactSensitive(text);

	await Promise.allSettled(
		allowedUserIds.map(async (userId) => {
			try {
				const user = await client.users.fetch(userId);
				await user.send(redacted);
			} catch (error) {
				console.warn(`[control] failed to DM alert user ${userId}: ${redactSensitive(error?.message || String(error))}`);
			}
		})
	);
}

module.exports = {
	sendControlAlert
};
