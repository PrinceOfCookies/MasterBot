const mysql = require("mysql")
const { yellow, orange, green } = require("chalk")

function getSQLConfig(bot) {
    return {
        host: bot.env.DB_HOST,
        port: Number(bot.env.DB_PORT ?? 3306),
        user: bot.env.DB_USER,
        password: bot.env.DB_PW,
        database: bot.env.DB_DB,
        waitForConnections: true,
        connectionLimit: Number(bot.env.DB_CONLIMIT ?? 10),
        queueLimit: 0
    }
}

function hasSQLConfig(config) {
    return Boolean(config.host && config.user && config.db)
}

async function createBotDatabase(bot) {
    const conf = getSQLConfig(bot)

    if (!hasSQLConfig(conf)) {
        console.log(orange(`[${bot.name}] No SQL config found.`))
        return null;
    }

    const start = Date.now()
    const pool = mysql.createPool(conf)

    await pool.query("SELECT 1")
    console.log(green(`[${bot.name}] SQL connected in ${yellow(Date.now() - start)}ms`))

    return pool
}

module.exports = {
    createBotDatabase
}