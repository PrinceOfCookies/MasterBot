const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });
const {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	Events,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder
} = require("discord.js");

const { sendControlAlert } = require("./alertUsers");
const { getBotLogs, getBotStatus, listBots, restartBot, startBot, stopBot, updateBot, redactSensitive } = require("./pm2Control");
const { startPm2Cache } = require("../pm2/pm2Cache");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ALLOWED_USERS = new Set(
	String(process.env.CONTROL_ALLOWED_USERS ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)
);

const CONTROL_PREFIX = "masterbot-control";

function requireEnv(name, value) {
	if (!value || !String(value).trim()) {
		throw new Error(`${name} is required`);
	}
}

function isAllowedUser(userId) {
	return ALLOWED_USERS.has(String(userId));
}

function formatDuration(ms) {
	if (ms == null || !Number.isFinite(Number(ms))) return "n/a";

	let remaining = Math.max(0, Math.floor(Number(ms)));
	const days = Math.floor(remaining / 86_400_000);
	remaining -= days * 86_400_000;
	const hours = Math.floor(remaining / 3_600_000);
	remaining -= hours * 3_600_000;
	const minutes = Math.floor(remaining / 60_000);
	remaining -= minutes * 60_000;
	const seconds = Math.floor(remaining / 1000);

	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function buildBotListText(bots) {
	if (!bots.length) {
		return "No MasterBot PM2 processes were found.";
	}

	const lines = [
		"name | status | pid | uptime | memory | cpu | restarts",
		"---- | ------ | --- | ------ | ------ | --- | --------"
	];

	for (const bot of bots) {
		lines.push(
			[
				bot.name,
				bot.status,
				bot.pid ?? "n/a",
				formatDuration(bot.uptime),
				bot.memoryMb == null ? "n/a" : `${bot.memoryMb} MB`,
				bot.cpuPercent == null ? "n/a" : `${Number(bot.cpuPercent).toFixed(1)}%`,
				bot.restartCount ?? 0
			].join(" | ")
		);
	}

	return `\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}

function buildStatusText(bot) {
	return [
		`Bot: ${bot.name}`,
		`Status: ${bot.status}`,
		`PID: ${bot.pid ?? "n/a"}`,
		`Uptime: ${formatDuration(bot.uptime)}`,
		`Memory: ${bot.memoryMb == null ? "n/a" : `${bot.memoryMb} MB`}`,
		`CPU: ${bot.cpuPercent == null ? "n/a" : `${Number(bot.cpuPercent).toFixed(1)}%`}`,
		`Restarts: ${bot.restartCount ?? 0}`
	].join("\n");
}

function buildConfirmationId(kind, action, botName, requesterId) {
	return `${CONTROL_PREFIX}:${kind}:${action}:${encodeURIComponent(botName)}:${requesterId}`;
}

function parseConfirmationId(customId) {
	const parts = String(customId ?? "").split(":");

	if (parts.length !== 5 || parts[0] !== CONTROL_PREFIX) return null;

	const [, kind, action, encodedBotName, requesterId] = parts;

	return {
		kind,
		action,
		botName: decodeURIComponent(encodedBotName),
		requesterId
	};
}

function buildConfirmationRow(action, botName, requesterId) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(buildConfirmationId("confirm", action, botName, requesterId))
			.setLabel("Confirm")
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(buildConfirmationId("cancel", action, botName, requesterId))
			.setLabel("Cancel")
			.setStyle(ButtonStyle.Secondary)
	);
}

function buildCommandDefinitions() {
	return [
		new SlashCommandBuilder()
			.setName("bots")
			.setDescription("Manage MasterBot PM2 processes")
			.addSubcommand((subcommand) => subcommand.setName("list").setDescription("Show all bot PM2 statuses"))
			.addSubcommand((subcommand) =>
				subcommand
					.setName("status")
					.setDescription("Show status for one bot")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("restart")
					.setDescription("Restart one bot")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("stop")
					.setDescription("Stop one bot")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("start")
					.setDescription("Start one bot")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("logs")
					.setDescription("Show recent bot logs")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
					.addIntegerOption((option) =>
						option
							.setName("lines")
							.setDescription("Number of log lines")
							.setMinValue(1)
							.setMaxValue(500)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName("update")
					.setDescription("Update one bot safely and restart it")
					.addStringOption((option) =>
						option.setName("bot").setDescription("Bot name").setRequired(true)
					)
			)
			.toJSON()
	];
}

async function registerCommands(client) {
	const rest = new REST({ version: "10" }).setToken(TOKEN);
	const commands = buildCommandDefinitions();

	await rest.put(Routes.applicationCommands(CLIENT_ID), {
		body: commands
	});

	console.log(`[control] registered ${commands.length} global slash command(s)`);
}

async function replyUnauthorized(interaction, client) {
	const text = "You are not authorized to use this control app.";

	if (interaction.deferred || interaction.replied) {
		await interaction.followUp({ content: text, ephemeral: true }).catch(() => {});
	} else {
		await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
	}

	await sendControlAlert(
		client,
		`Unauthorized control attempt by ${interaction.user.tag} (${interaction.user.id}) on /${interaction.commandName ?? "button"}`
	);
}

async function showConfirmation(interaction, action, botName) {
	const content = `Confirm ${action} for \`${botName}\`?`;

	await interaction.reply({
		content,
		ephemeral: true,
		components: [buildConfirmationRow(action, botName, interaction.user.id)]
	});
}

async function handleList(interaction) {
	const bots = await listBots();
	await interaction.editReply({
		content: buildBotListText(bots)
	});
}

async function handleStatus(interaction, botName) {
	const bot = await getBotStatus(botName);
	await interaction.editReply({
		content: `\`\`\`text\n${buildStatusText(bot)}\n\`\`\``
	});
}

async function handleStart(interaction, botName) {
	await startBot(botName);
	await interaction.editReply({
		content: `Started \`${botName}\`.`
	});
}

async function handleLogs(interaction, botName) {
	const lines = interaction.options.getInteger("lines") ?? 80;
	const logText = await getBotLogs(botName, lines);

	if (logText.length <= 1800 && !logText.includes("```")) {
		await interaction.editReply({
			content: `\`\`\`text\n${logText}\n\`\`\``
		});
		return;
	}

	const attachment = new AttachmentBuilder(Buffer.from(logText, "utf8"), {
		name: `${botName}-logs.txt`
	});

	await interaction.editReply({
		content: `Recent logs for \`${botName}\` (${lines} lines) are attached.`,
		files: [attachment]
	});
}

async function handleRestartPrompt(interaction, botName, action) {
	await showConfirmation(interaction, action, botName);
}

async function runConfirmedAction(interaction, client, action, botName) {
	const runningText = `${action === "update" ? "Updating" : action === "restart" ? "Restarting" : "Stopping"} \`${botName}\`...`;

	await interaction.update({
		content: runningText,
		components: []
	});

	try {
		let resultText = "";

		if (action === "restart") {
			await restartBot(botName);
			resultText = `Restarted \`${botName}\`.`;
		} else if (action === "stop") {
			await stopBot(botName);
			resultText = `Stopped \`${botName}\`.`;
		} else if (action === "update") {
			const result = await updateBot(botName);
			resultText = [
				`Updated \`${botName}\`.`,
				`Git refresh: ${result.usedSubmoduleUpdate ? "submodule update" : "git pull"}`,
				`npm install: ${result.ranInstall ? "yes" : "no"}`,
				`Restart: complete`
			].join("\n");
		} else {
			throw new Error(`Unsupported action: ${action}`);
		}

		await interaction.followUp({
			content: resultText,
			ephemeral: true
		});
	} catch (error) {
		const message = redactSensitive(error?.message || String(error));
		await interaction.followUp({
			content: `Failed to ${action} \`${botName}\`: ${message}`,
			ephemeral: true
		});
		await sendControlAlert(client, `Control action failed for ${botName} (${action}): ${message}`);
	}
}

async function handleButton(interaction, client) {
	const parsed = parseConfirmationId(interaction.customId);

	if (!parsed) return;

	if (!isAllowedUser(interaction.user.id)) {
		await interaction.reply({ content: "You are not authorized to use this control app.", ephemeral: true }).catch(() => {});
		await sendControlAlert(
			client,
			`Unauthorized control button attempt by ${interaction.user.tag} (${interaction.user.id}) on ${parsed.action} ${parsed.botName}`
		);
		return;
	}

	if (interaction.user.id !== parsed.requesterId) {
		await interaction.reply({ content: "Only the requester can use these buttons.", ephemeral: true }).catch(() => {});
		return;
	}

	if (parsed.kind === "cancel") {
		await interaction.update({
			content: `Cancelled ${parsed.action} for \`${parsed.botName}\`.`,
			components: []
		});
		return;
	}

	if (parsed.kind !== "confirm") {
		return;
	}

	await runConfirmedAction(interaction, client, parsed.action, parsed.botName);
}

async function handleBotsCommand(interaction, client) {
	const subcommand = interaction.options.getSubcommand();
	const botName = interaction.options.getString("bot", false);

	if (subcommand === "list") {
		await handleList(interaction);
		return;
	}

	if (!botName && subcommand !== "list") {
		throw new Error("A bot name is required.");
	}

	if (subcommand === "status") {
		await handleStatus(interaction, botName);
		return;
	}

	if (subcommand === "start") {
		await handleStart(interaction, botName);
		return;
	}

	if (subcommand === "logs") {
		await handleLogs(interaction, botName);
		return;
	}

	if (subcommand === "restart" || subcommand === "stop" || subcommand === "update") {
		await handleRestartPrompt(interaction, botName, subcommand);
		return;
	}

	throw new Error(`Unsupported subcommand: ${subcommand}`);
}

async function main() {
	requireEnv("TOKEN", TOKEN);
	requireEnv("CLIENT_ID", CLIENT_ID);
	requireEnv("CONTROL_ALLOWED_USERS", process.env.CONTROL_ALLOWED_USERS);

	await startPm2Cache();

	const client = new Client({
		intents: [GatewayIntentBits.Guilds]
	});

	client.once(Events.ClientReady, async () => {
		console.log(`[control] logged in as ${client.user.tag}`);
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		try {
			if (interaction.isButton()) {
				await handleButton(interaction, client);
				return;
			}

			if (!interaction.isChatInputCommand()) return;
			if (interaction.commandName !== "bots") return;

			if (!isAllowedUser(interaction.user.id)) {
				await replyUnauthorized(interaction, client);
				return;
			}

			await interaction.deferReply({ ephemeral: true });
			await handleBotsCommand(interaction, client);
		} catch (error) {
			const message = redactSensitive(error?.message || String(error));
			console.error(`[control] interaction error: ${message}`);

			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({
					content: `Control command failed: ${message}`,
					ephemeral: true
				}).catch(() => {});
			} else {
				await interaction.reply({
					content: `Control command failed: ${message}`,
					ephemeral: true
				}).catch(() => {});
			}

			await sendControlAlert(client, `Control command failed: ${message}`);
		}
	});

	await registerCommands(client);
	await client.login(TOKEN);
}

main().catch((error) => {
	console.error(`[control] fatal startup error: ${redactSensitive(error?.message || String(error))}`);
	process.exit(1);
});
