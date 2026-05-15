require("dotenv").config();

const { startHealthMonitor } = require("../src/pm2/healthMonitor");

if (process.env.MASTER_HEALTH_MONITOR === "false") {
	console.log("[health] PM2 health monitor disabled by MASTER_HEALTH_MONITOR=false");
	process.exit(0);
}

const controller = startHealthMonitor();

process.once("SIGINT", () => {
	controller.stop();
	process.exit(0);
});

process.once("SIGTERM", () => {
	controller.stop();
	process.exit(0);
});
