const { red } = require("chalk");

module.exports = {
  name: "close",
  async execute() {
    console.log(red("[Database Status]: Unexpectedly terminated.."));
  },
  color: "#00FF00",
};
