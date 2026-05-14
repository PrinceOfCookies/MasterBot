module.exports = {
	name: "interactionCreate",

	async execute(interaction, client) {
		if (!interaction.isChatInputCommand()) return;

		const command = client.commands.get(interaction.commandName);
		if (!command) return;

		try {
			await command.execute(interaction, client);
		} catch (err) {
			console.error(`[${client.botName}] Command failed`, err);

			const payload = {
				content: "There was an error running this command.",
				ephemeral: true
			};

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(payload).catch(() => {});
			} else {
				await interaction.reply(payload).catch(() => {});
			}
		}
	}
};