module.exports = (client) => {
	client.query = (sql, params) =>
		new Promise((resolve, reject) => {
			const connection = client.connection ?? client.db ?? client.sql;
			const hasParams = typeof params !== "undefined";
			const hasCallbackStyle = typeof params === "function";

			if (!connection || typeof connection.query !== "function") {
				reject(new Error(`[${client.botName}] Database connection is not ready`));
				return;
			}

			if (hasCallbackStyle) {
				reject(
					new Error(
						`[${client.botName}] client.query callback style is no longer supported. Use await client.query(sql, params).`
					)
				);
				return;
			}

			if (!hasParams && typeof sql === "string" && sql.includes("?")) {
				reject(
					new Error(
						`[${client.botName}] Query has placeholders but no params were provided: ${sql}`
					)
				);
				return;
			}

			const queryArgs = hasParams ? [sql, params] : [sql];

			connection.query(...queryArgs, (error, result) => {
				if (error) {
					error.sql = error.sql ?? sql;
					error.params = error.params ?? params;
					reject(error);
					return;
				}

				resolve(result);
			});
		});
};
