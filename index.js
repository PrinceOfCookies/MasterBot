require("dotenv").config();

const { startAllBots } = require("./src/core/botLoader");

startAllBots().catch(console.error);
