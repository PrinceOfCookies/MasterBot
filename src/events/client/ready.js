module.exports = {
	name: "ready",
	once: true,

	execute(client) {
		console.log(`[${client.botName}] Ready as ${client.user.tag}`);
	}
};