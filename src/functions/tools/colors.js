const chalk = require("chalk");

module.exports = (client) => {
  client.color = async (hex, text) => {
    let hexColor = chalk.hex(hex);
    let colorText = await hexColor(text);

    return colorText;
  };
};
