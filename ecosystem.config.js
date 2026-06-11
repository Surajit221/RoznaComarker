const path = require('path');

module.exports = {
  apps: [
    {
      name: 'RoznaComarker_Frontend',
      script: 'npx',
      args: 'serve -s dist -l 4200',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4200
      },
      error_file: path.join(__dirname, 'logs', 'frontend-error.log'),
      out_file: path.join(__dirname, 'logs', 'frontend-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
