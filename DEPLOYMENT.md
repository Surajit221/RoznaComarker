# PM2 Deployment Guide for RoznaComarker Frontend

## Prerequisites
- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`
- Angular CLI installed globally: `npm install -g @angular/cli`

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm install
npm run build:prod
```

The production build will be created in the `dist/` directory.

## PM2 Deployment

### 1. Build the application
```bash
npm run build:prod
```

### 2. Start with PM2
```bash
npm run pm2:start
```

### 3. Monitor the application
```bash
npm run pm2:monit
```

### 4. View logs
```bash
npm run pm2:logs
```

### 5. Restart the application
```bash
npm run pm2:restart
```

### 6. Stop the application
```bash
npm run pm2:stop
```

### 7. Delete from PM2
```bash
npm run pm2:delete
```

## PM2 Configuration
The PM2 configuration is in `ecosystem.config.js`:
- App name: `RoznaComarker_Frontend`
- Port: 4200
- Serves static files from `dist/` directory
- Logs stored in `logs/` directory
- Auto-restart enabled
- Max memory: 500MB
- Max restarts: 10

## Environment Variables
The application uses `src/environments/environment.prod.ts` for production configuration. Update this file with your production API URLs before building.

## Troubleshooting

### Schema validation error with allowedHosts
If you encounter "Schema validation failed with the following errors: Data path "" must NOT have additional properties(allowedHosts)", this has been fixed in the current `angular.json` by using the proper schema for Angular 20.3.0's new `@angular/build` builders.

### Build fails
- Ensure all dependencies are installed: `npm install`
- Check Node.js version: `node --version` (should be 18+)
- Clear Angular cache: `rm -rf .angular/cache`

### PM2 won't start
- Check if port 4200 is already in use: `netstat -ano | findstr :4200`
- Kill existing process if needed
- Check PM2 logs: `npm run pm2:logs`

## Auto-start on Server Reboot
To make PM2 start automatically on server reboot:
```bash
pm2 startup
pm2 save
```

## Nginx Configuration (Optional)
If using Nginx as a reverse proxy:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
