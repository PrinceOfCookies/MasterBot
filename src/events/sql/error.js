const { red } = require("chalk");

module.exports = {
  name: "error",
  async execute(err) {
    const details = [
      `An error occured with the database connection:`,
      err?.code ? `code: ${err.code}` : null,
      err?.sqlMessage ? `sqlMessage: ${err.sqlMessage}` : null,
      err?.sql ? `sql: ${err.sql}` : null,
      err?.params ? `params: ${JSON.stringify(err.params)}` : null,
      err?.stack ? err.stack : String(err),
    ]
      .filter(Boolean)
      .join("\n");

    console.log(red(details));
  },
  color: "#00FF00",
};
