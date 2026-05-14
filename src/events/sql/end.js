const { orange } = require("chalk");

module.exports = {
  name: "end",
  async execute() {
    console.log(orange("[Database Status]: Closed."));
  },
  color: "#00FF00",
};
