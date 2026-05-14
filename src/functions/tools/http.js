module.exports = async (client) => {
	client.http = async (url, method = "GET", headers = {}, body) => {
		const options = {
			method,
			headers
		};

		if (typeof body !== "undefined") {
			options.body = body;
		}

		const response = await fetch(url, options);
		const contentType = response.headers.get("content-type") || "";

		if (!response.ok) {
			const error = new Error(`HTTP ${response.status} ${response.statusText}`);
			error.status = response.status;
			error.url = url;
			throw error;
		}

		if (contentType.includes("application/json")) {
			return response.json();
		}

		return response.text();
	};
};
