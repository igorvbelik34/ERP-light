module.exports = {
  apps: [
    {
      name: "erp-lite",
      script: "node_modules/.bin/next",
      args: "dev -p 3005",
      watch: false, // Next.js has built-in HMR, no need for PM2 watch
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
        PORT: 3005,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3005,
      },

      // Logging
      out_file: "./logs/app-out.log",
      error_file: "./logs/app-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
