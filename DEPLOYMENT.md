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

## Cache headers and automatic updates (stale-version prevention)
Open tabs pick up a new deployment by themselves: the app polls `/version.json` and switches to the new version at a safe moment
(see `src/app/core/app-update/`). This needs three things on the server:

1. **Build with `npm run build:prod`.** Its `postbuild:prod` step (`scripts/stamp-release.cjs`) writes `version.json` and the
   release id into `index.html`. With `pnpm`, pre/post scripts do not run by default: run `node scripts/stamp-release.cjs` after
   the build. Without the stamp the app still works, but open tabs are not told about updates.
2. **Serve the browser output folder** (`dist/rozna-comarker-fe/browser`). `serve` reads `serve.json` from the folder it serves,
   and that file sets the cache policy. If PM2 runs `serve -s dist`, `serve.json` is not found and no Cache-Control is sent.
3. **If Nginx serves the files itself** (not `proxy_pass` to `serve`), set the same policy there:

```nginx
root /path/to/dist/rozna-comarker-fe/browser;
location = /index.html { add_header Cache-Control "no-cache" always; }
location ~ ^/(version|release)\.json$ { add_header Cache-Control "no-cache, no-store, must-revalidate" always; }
location ~* -[A-Z0-9]{8}\.(js|css|mjs)$ { add_header Cache-Control "public, max-age=31536000, immutable" always; try_files $uri =404; }
location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache" always; }
```

When Nginx only proxies to `serve`, the headers from `serve.json` pass through; do not add `proxy_cache` for the frontend.
Check after a deploy: `curl -sI https://<site>/ | grep -i cache-control` must show `no-cache`, and `/version.json` must show `no-store`.
