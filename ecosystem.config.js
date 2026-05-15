module.exports = {
  apps: [
    {
      "name": "kittycultbot",
      "script": "src/worker/botWorker.js",
      "cwd": "/home/Cookies/MainHDD/Projects/active/MasterBot",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "512M",
      "min_uptime": "10s",
      "max_restarts": 10,
      "restart_delay": 5000,
      "env": {
        "BOT_NAME": "kittycultbot",
        "NODE_ENV": "production",
        "NODE_OPTIONS": "--max-old-space-size=384"
      }
    },
    {
      "name": "strwremastered",
      "script": "src/worker/botWorker.js",
      "cwd": "/home/Cookies/MainHDD/Projects/active/MasterBot",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "512M",
      "min_uptime": "10s",
      "max_restarts": 10,
      "restart_delay": 5000,
      "env": {
        "BOT_NAME": "strwremastered",
        "NODE_ENV": "production",
        "NODE_OPTIONS": "--max-old-space-size=384"
      }
    },
    {
      "name": "masterbot-monitor",
      "script": "scripts/monitorPm2.js",
      "cwd": "/home/Cookies/MainHDD/Projects/active/MasterBot",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "256M",
      "min_uptime": "10s",
      "max_restarts": 10,
      "restart_delay": 5000,
      "env": {
        "MASTER_HEALTH_MONITOR": "true",
        "NODE_ENV": "production"
      }
    },
    {
      "name": "masterbot-watchdog",
      "script": "rust/masterbot-watchdog/target/release/masterbot-watchdog",
      "args": "--watch --interval 10",
      "cwd": "/home/Cookies/MainHDD/Projects/active/MasterBot",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "env": {
        "NODE_ENV": "production",
        "MASTERBOT_WATCHDOG": "1"
      }
    }
  ]
};
