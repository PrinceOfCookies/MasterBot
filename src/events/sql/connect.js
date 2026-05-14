const { green } = require("chalk");

module.exports = {
  name: "connect",
  async execute() {
    console.log(green("[Database Status]: Connected."));
  },
  color: "#00FF00",
};
