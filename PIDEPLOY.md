# Raspberry Pi Deployment Guide

This guide outlines the exact steps for deploying the 5 More Minutes app to an existing Raspberry Pi server.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS (or similar Linux distribution)
- Python 3.8+ installed
- SSH access to the Pi
- Cloudflare account with a domain (for tunnel setup)

## Step 1: Transfer Files to Pi

Transfer the project files to your Raspberry Pi. You can use `scp`, `rsync`, or `git clone`:

**Option A: Using scp (from your local machine)**
```bash
scp -r 5-more-minutes pi@raspberrypi.local:/home/pi/
```

**Option B: Using git (on the Pi)**
```bash
# On the Pi
cd /home/pi
git clone <your-repo-url> 5-more-minutes
```

**Important:** Make sure `button-actions.json` is included in the transfer (it's in the root directory and required for the app to function).

## Step 2: Build Frontend on Local Machine

Build the React frontend on your local development machine:

```bash
cd frontend
npm run build
```

This creates the production build in `backend/static/`. The built files should be included when you transfer the project to the Pi.

## Step 3: Set Up Python Environment on Pi

On the Raspberry Pi:

```bash
cd /home/pi/5-more-minutes/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Step 4: Configure Cloudflare Tunnel

1. **Install Cloudflare Tunnel (if not already installed):**
   ```bash
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm
   sudo mv cloudflared-linux-arm /usr/local/bin/cloudflared
   sudo chmod +x /usr/local/bin/cloudflared
   ```

2. **Create tunnel:**
   ```bash
   cloudflared tunnel create 5-more-minutes
   ```
   Note the tunnel ID that's displayed.

3. **Create tunnel configuration:**
   ```bash
   mkdir -p ~/.cloudflared
   nano ~/.cloudflared/config.yml
   ```
   
   Add the following (replace `YOUR_DOMAIN` and `YOUR_TUNNEL_ID`):
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /home/pi/.cloudflared/YOUR_TUNNEL_ID.json

   ingress:
     - hostname: YOUR_DOMAIN
       service: http://127.0.0.1:5000
     - service: http_status:404
   ```

4. **Create DNS record:**
   ```bash
   cloudflared tunnel route dns 5-more-minutes YOUR_DOMAIN
   ```

5. **Test the tunnel:**
   ```bash
   cloudflared tunnel --config ~/.cloudflared/config.yml run
   ```
   You should be able to access your app at `https://YOUR_DOMAIN`

## Step 5: Set Up Systemd Services

1. **Configure the Flask service:**
   ```bash
   cd /home/pi/5-more-minutes/backend
   sudo nano /etc/systemd/system/5-more-minutes.service
   ```
   
   Copy the contents from `backend/5-more-minutes.service` and adjust paths if needed. Make sure to:
   - Update `SECRET_KEY` environment variable with a secure random key (generate with: `python3 -c "import secrets; print(secrets.token_hex(32))"`)
   - Verify all paths are correct (especially `WorkingDirectory` and `ExecStart` paths)
   - Update `User` if not using `pi` user

2. **Configure the Cloudflare Tunnel service:**
   ```bash
   sudo nano /etc/systemd/system/cloudflared.service
   ```
   
   Copy the contents from `backend/cloudflared.service` and adjust paths if needed.

3. **Set proper permissions:**
   ```bash
   sudo chown -R pi:pi /home/pi/5-more-minutes
   sudo chmod +x /usr/local/bin/cloudflared
   ```

4. **Enable and start services:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable 5-more-minutes.service
   sudo systemctl enable cloudflared.service
   sudo systemctl start 5-more-minutes.service
   sudo systemctl start cloudflared.service
   ```

5. **Check service status:**
   ```bash
   sudo systemctl status 5-more-minutes.service
   sudo systemctl status cloudflared.service
   ```

## Step 6: Verify Deployment

1. **Check Flask app logs:**
   ```bash
   sudo journalctl -u 5-more-minutes.service -f
   ```

2. **Check Cloudflare Tunnel logs:**
   ```bash
   sudo journalctl -u cloudflared.service -f
   ```

3. **Test the application:**
   - Visit `https://YOUR_DOMAIN` in a browser
   - Verify the app loads correctly
   - Test user registration and login
   - Test button actions

## Troubleshooting

- **Service won't start:** Check logs with `sudo journalctl -u 5-more-minutes.service -n 50`
- **Tunnel connection issues:** Verify tunnel ID and credentials file path in config.yml
- **Database errors:** Ensure the `backend/` directory is writable: `chmod -R 755 /home/pi/5-more-minutes/backend`
- **Static files not loading:** Verify `backend/static/` directory exists and contains built React files
- **Button actions not working:** Verify `button-actions.json` exists in the root directory

## Updating the App

To update the app after making changes:

1. **Build frontend on local machine:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Transfer updated files to Pi:**
   ```bash
   scp -r 5-more-minutes pi@raspberrypi.local:/home/pi/
   ```

3. **Restart services on Pi:**
   ```bash
   sudo systemctl restart 5-more-minutes.service
   sudo systemctl restart cloudflared.service
   ```

## File Structure on Pi

After deployment, your Pi should have this structure:

```
/home/pi/5-more-minutes/
├── backend/
│   ├── app.py
│   ├── app.db (created automatically)
│   ├── static/ (React build output)
│   ├── uploads/ (user profile pictures)
│   ├── requirements.txt
│   ├── gunicorn_config.py
│   ├── venv/ (Python virtual environment)
│   ├── 5-more-minutes.service
│   └── cloudflared.service
├── button-actions.json (required!)
└── index.html (static demo, optional)
```

