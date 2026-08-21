# ModerBot

Minecraft moderation bot with web panel for CheatMine server.

## Features
- Multiple Minecraft bots for different servers/modes
- Real-time chat monitoring and violation detection
- Web panel for management and logs
- Telegram notifications
- Persistent logging with daily rotation
- Auto-reconnection with exponential backoff

## Quick Start

### Local Development
```bash
cp .env.example .env
# Edit .env with your tokens
npm install
npm start
```

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram bot token | Yes |
| `MC_PASSWORD` | Minecraft server password | Yes |
| `ADMIN_IDS` | Comma-separated Telegram admin IDs | No |
| `TZ` | Timezone (default: Europe/Moscow) | No |
| `PORT` | Web panel port (default: 10000) | No |
| `DATA_DIR` | Data directory for logs/config | No |
| `CONFIG_PATH` | Config file path | No |
| `LOGS_DIR` | Logs directory | No |

## Render Deployment

### 1. Create Render Web Service
1. Connect your GitHub repo to Render
2. Create a new **Web Service**
3. Use the `render.yaml` in this repo (or configure manually):
   - Build Command: `npm install`
   - Start Command: `node bot.js`
   - Add persistent disk: mount at `/opt/render/project/data`, 1GB

### 2. Set Environment Variables in Render Dashboard
- `BOT_TOKEN` - Your Telegram bot token
- `MC_PASSWORD` - Minecraft server password
- `ADMIN_IDS` - Comma-separated admin Telegram IDs
- `TZ` - `Europe/Moscow` (or your timezone)

### 3. Auto-Deploy via GitHub Actions
The workflow in `.github/workflows/deploy.yml` auto-deploys on push to `main`.

Add these secrets to your GitHub repo (Settings → Secrets → Actions):
- `RENDER_API_KEY` - From Render Account Settings → API Keys
- `RENDER_SERVICE_ID` - From your Render service URL: `https://dashboard.render.com/web/srv-XXXXXX` → the `srv-XXXXXX` part

## Project Structure
```
├── bot.js              # Main bot logic
├── config.json         # Runtime config (gitignored, created from example)
├── config.example.json # Template config
├── render.yaml         # Render service definition
├── Dockerfile          # Container definition
├── .github/workflows/  # CI/CD
├── public/             # Web panel frontend
│   ├── index.html
│   ├── app.js
│   ├── games.js
│   └── style.css
└── logs/               # Daily logs (gitignored)
```

## Commands (Telegram)
- `/start` - Show help
- `/status` - Bot status (admin)
- `/players` - Online players (admin)
- `/chat <text>` - Send message as bot (admin)
- `/restart` - Restart all bots (admin)
- `/logs` - Recent violations (admin)

## Web Panel
Access at `https://your-service.onrender.com` (or localhost:10000 locally)
- View real-time logs with filters
- Manage bot connections
- Send commands to bots
- Configure server settings
- Download daily logs

## Auto-Recovery
- Bots auto-reconnect on disconnect
- Exponential backoff: 5s → 10s → 30s → 5min
- Config changes trigger affected bot restarts
- Graceful shutdown on SIGTERM/SIGINT (Render deployments)