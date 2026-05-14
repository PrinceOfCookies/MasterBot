const { GatewayIntentBits, ActivityType } = require("discord.js");

const defaultClientOptions = {
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.MessageContent,
	],

	presence: {
		activities: [
			{
				name: "Over",
				type: ActivityType.Watching
			}
		],
		status: "online"
	},

	allowedMentions: {
		parse: ["users", "roles"],
		repliedUser: true
	}
};

const defaultPaths = {
    tools: "src/tools",
	functions: "src/functions",
	events: "src/events",
	commands: "src/commands"
};

module.exports = {
	defaultClientOptions,
	defaultPaths
};