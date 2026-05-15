require("dotenv").config();

const { startAllBots } = require("./src/core/botLoader");
const { startHealthMonitor } = require("./src/pm2/healthMonitor");

if (process.env.MASTER_HEALTH_MONITOR !== "false") {
	startHealthMonitor();
}

startAllBots().catch(console.error);
