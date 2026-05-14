const chalk = require("chalk");

module.exports = (client) => {
  client.color = async (hexC, text) => {
    let hexColor = chalk.hex(hexC);
    let colorText = hexColor(text);

    return colorText;
  };

  client.hexToRGB = async (hex) => {
    // Remove the '#' character if it exists
    hex = hex.replace("#", "");

    // Parse the hex string into RGB values
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return { r, g, b };
  }
};
