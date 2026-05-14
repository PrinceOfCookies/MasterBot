module.exports = {
	name: "ready",
	once: true,

	execute(client) {
		console.log(
			await client.color(
			  "#2afeb7",
			  `[Client Status]: Logged in as ${client.user.tag}`
			)
		  );

		  const guilds = client.guilds.cache.size;
    
		  // Get the users in all guilds (not counting bots)
		  const users = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
		  
		  console.log(
			await client.color(
			  "#2afeb7",
			  `[Client Status]: Serving ${users} users in ${guilds} guild(s).`
			)
		  );
	}
};