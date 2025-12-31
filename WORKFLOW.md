# Development & Deployment Workflow

This document describes the standard workflow for developing the 5-More-Minutes / fivemore app locally on a MacBook and deploying it to the Raspberry Pi production server running behind a Cloudflare Tunnel.

The Pi runs:
- Flask + gunicorn (systemd service)
- React frontend served as static files from Flask
- Cloudflare Tunnel with locally managed ingress rules

GitHub is the source of truth. The Pi is a deployment target only.

----------------------------------------------------------------

QUICK REMINDER (ABBREVIATED COMMANDS)

From repo root on your Mac:

# commit changes
git add -A
git commit -m "Describe change"
git push

# build frontend (outputs to backend/static/)
cd frontend && npm run build && cd ..

# deploy to Pi
ssh tom@192.168.1.222 "cd /home/tom/apps/fivemore && git pull"
rsync -av --delete backend/static/ tom@192.168.1.222:/home/tom/apps/fivemore/backend/static/
ssh tom@192.168.1.222 "sudo systemctl restart fivemore"

Then verify:
https://fivemore.thinkpad.club

----------------------------------------------------------------

REPOSITORY STRUCTURE (RELEVANT PARTS)

backend/
  app.py
  static/          (production React build output)
  uploads/
  venv/

frontend/
  src/
  vite.config.js   (builds directly into ../backend/static)

----------------------------------------------------------------

A) LOCAL DEVELOPMENT (MAC)

1) Start the backend (local)

From repo root:

cd backend
source venv/bin/activate
python app.py

Runs Flask in debug mode at:
http://127.0.0.1:5000

------------------------------------------------

2) Start the frontend (local)

In a second terminal:

cd frontend
npm install
npm run dev

Runs Vite dev server (usually):
http://localhost:5173

------------------------------------------------

3) Test locally

- Use the Vite URL for UI
- API calls should hit the local Flask backend
- Confirm routes, auth, and UI changes work before deploying

----------------------------------------------------------------

B) COMMIT CHANGES (MAC)

From repo root:

git status
git add -A
git commit -m "Describe change"
git push

Always commit before building/deploying so GitHub stays the source of truth.

----------------------------------------------------------------

C) BUILD FRONTEND FOR PRODUCTION (MAC)

The Vite config outputs directly into backend/static/.

From repo root:

cd frontend
npm run build
cd ..

Verify build output:

ls backend/static
ls backend/static/assets

You should see:
- index.html
- assets/index-*.js
- assets/index-*.css

----------------------------------------------------------------

D) DEPLOY TO RASPBERRY PI (MAC → PI)

1) Pull latest code on the Pi

ssh tom@192.168.1.222 "cd /home/tom/apps/fivemore && git pull"

This updates backend code and config files.

------------------------------------------------

2) Sync built frontend assets

From repo root on your Mac:

rsync -av --delete backend/static/ \
  tom@192.168.1.222:/home/tom/apps/fivemore/backend/static/

This ensures the Pi exactly matches the current build.

------------------------------------------------

3) Install backend dependencies (only if changed)

If backend/requirements.txt was modified:

ssh tom@192.168.1.222 \
  "cd /home/tom/apps/fivemore/backend && ./venv/bin/pip install -r requirements.txt"

------------------------------------------------

4) Restart the production service

ssh tom@192.168.1.222 "sudo systemctl restart fivemore"

----------------------------------------------------------------

E) VERIFICATION

1) Local check on the Pi

ssh tom@192.168.1.222 "curl -I http://127.0.0.1:8000"

Expected:
HTTP/1.1 200 OK

------------------------------------------------

2) Public check

Open in a browser:
https://fivemore.thinkpad.club

Confirm:
- App loads
- Routes work (including deep links when configured)
- API calls succeed

----------------------------------------------------------------

IMPORTANT RULES

Rule 1: Do not edit code directly on the Pi
- All changes originate on the Mac
- GitHub is the canonical source
- The Pi is a deployment target only

Rule 2: Do not sync files from the Pi
- Never rsync Pi → Mac
- Persistent data (DB, uploads) should live outside the repo

----------------------------------------------------------------

NOTES

- Cloudflare Tunnel ingress rules are managed locally in:
  /home/tom/.cloudflared/config.yaml
- The Flask app runs on 127.0.0.1:8000
- Only Cloudflare exposes the app publicly (no open ports)

----------------------------------------------------------------

OPTIONAL NEXT IMPROVEMENT

Create a deploy.sh script that:
- builds frontend
- pulls on the Pi
- rsyncs static assets
- restarts the service

This reduces deployment to a single command.
