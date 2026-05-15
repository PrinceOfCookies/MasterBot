const mysql = require("mysql");
const { blue, green, yellow } = require("chalk");

const missingConfigWarned = new Set();

function getSQLConfig(bot) {
	return {
		host: bot.env.DB_HOST,
		port: Number(bot.env.DB_PORT ?? 3306),
		user: bot.env.DB_USER,
		password: bot.env.DB_PW,
		database: bot.env.DB_DB,
		waitForConnections: true,
		connectionLimit: Number(bot.env.DB_CONLIMIT ?? 10),
		queueLimit: 0
	};
}

function hasSQLConfig(config) {
	return Boolean(config.host && config.user && config.database);
}

function attachPoolLogging(bot, pool) {
	if (!pool || typeof pool.on !== "function") return;

	pool.on("error", (error) => {
		if (error?.code === "PROTOCOL_CONNECTION_LOST") {
			console.warn(`[${bot.name}] SQL connection lost, pool will reconnect on demand.`);
			return;
		}

		if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") {
			console.warn(`[${bot.name}] SQL connection interrupted, pool will retry on the next query.`);
			return;
		}

		console.warn(`[${bot.name}] SQL pool error`, error);
	});

	pool.on("connection", (connection) => {
		console.log(`[${bot.name}] SQL connection established (thread ${connection.threadId})`);

		if (typeof connection?.on === "function") {
			connection.on("error", (error) => {
				if (error?.code === "PROTOCOL_CONNECTION_LOST") {
					console.warn(`[${bot.name}] SQL connection lost, reconnecting through the pool.`);
					return;
				}

				console.warn(`[${bot.name}] SQL connection error`, error);
			});
		}
	});
}

async function warmPool(bot, pool) {
	const startedAt = process.hrtime.bigint();

	await new Promise((resolve, reject) => {
		pool.query("SELECT 1", (error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});

	const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
	console.log(green(`[${bot.name}] SQL warmup completed in ${yellow(durationMs.toFixed(0))}ms`));

	if (bot.startupProfiler) {
		bot.startupProfiler.mark("sqlWarmup");
	}
}

async function createBotDatabase(bot) {
	if (bot._sqlPool) {
		return bot._sqlPool;
	}

	if (bot._sqlPoolPromise) {
		return bot._sqlPoolPromise;
	}

	const conf = getSQLConfig(bot);

	if (!hasSQLConfig(conf)) {
		if (!missingConfigWarned.has(bot.name)) {
			missingConfigWarned.add(bot.name);
			console.log(blue(`[${bot.name}] No SQL config found.`));
		}

		if (bot.startupProfiler) {
			bot.startupProfiler.mark("sqlWarmup");
		}

		return null;
	}

	bot._sqlPoolPromise = (async () => {
		const pool = mysql.createPool(conf);

		attachPoolLogging(bot, pool);
		await warmPool(bot, pool);

		bot._sqlPool = pool;
		return pool;
	})()
		.catch((error) => {
			delete bot._sqlPool;
			throw error;
		})
		.finally(() => {
			delete bot._sqlPoolPromise;
		});

	return bot._sqlPoolPromise;
}

module.exports = {
	createBotDatabase
};
