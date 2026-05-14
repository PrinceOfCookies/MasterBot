module.exports = (client) => {
	client.query = (sql, params) =>
		new Promise((resolve, reject) => {
			const connection = client.connection;

			if (!connection || typeof connection.query !== "function") {
				reject(new Error(`[${client.botName}] Database connection is not ready`));
				return;
			}

			connection.query(sql, params, (error, result) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(result);
			});
		});
};
