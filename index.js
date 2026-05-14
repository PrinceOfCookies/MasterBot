require("dotenv").config();

const { startAllBots } = require("./src/core/botloader");

startAllBots().catch(console.error);