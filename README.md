# 5 More Minutes

A full-stack web application built with React (Vite), Flask, and SQLite, designed to run locally during development and deploy to a Raspberry Pi Zero with Cloudflare Tunnel.

## Project Structure

```
5-more-minutes/
├── frontend/          # React + Vite application
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── backend/           # Flask application
│   ├── app.py
│   ├── requirements.txt
│   ├── gunicorn_config.py
│   ├── 5-more-minutes.service
│   └── cloudflared.service
├── button-actions.json  # Centralized button actions configuration
├── index.html          # Static HTML demo for GitHub Pages
└── README.md
```

## Features

- Instagram-inspired UI design
- User authentication (login/register)
- Profile management with image uploads
- Time tracking with action buttons
- Dynamic button actions loaded from `button-actions.json`
- Action repeatability and similarity tracking
- Timezone-aware daily action limits
- Enhanced confirmation modals with warnings and metadata
- Animated time count-up on action confirmation
- Pastel rainbow button styling
- Administrative user management page (`/users`)
- SQLite database for data persistence
- Production-ready Flask server with SPA fallback
- Cloudflare Tunnel integration for secure access
- Static HTML demo for GitHub Pages

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- pip

### Setup

1. **Clone and navigate to the project:**
   ```bash
   cd 5-more-minutes
   ```

2. **Set up the frontend:**
   ```bash
   cd frontend
   npm install
   ```

3. **Set up the backend:**
   ```bash
   cd ../backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Initialize the database:**
   The database will be automatically created when you first run the Flask app.

### Running Locally

You'll need two terminal windows:

**Terminal 1 - Flask Backend:**
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python app.py
```

The Flask server will run on `http://127.0.0.1:5000`

**Terminal 2 - Vite Dev Server:**
```bash
cd frontend
npm run dev
```

The Vite dev server will run on `http://localhost:5173` and proxy API requests to Flask.

### Development Workflow

- The Vite dev server provides hot-reload for React development
- All API calls from the frontend go to `/api/*` which is proxied to Flask
- Flask serves the API endpoints and handles authentication
- The database (`app.db`) and uploads folder are created in the `backend/` directory

### Building for Production

When ready to test the production build locally:

```bash
cd frontend
npm run build
```

This will build the React app and output static files to `backend/static/`. Then run Flask:

```bash
cd backend
source venv/bin/activate
python app.py
```

Visit `http://127.0.0.1:5000` to see the production build served by Flask.

## Raspberry Pi Deployment

### Prerequisites on Raspberry Pi

- Raspberry Pi OS (or similar Linux distribution)
- Python 3.8+
- A Cloudflare account with a domain

### Step 1: Initial Pi Setup

1. **Update the system:**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Python and pip:**
   ```bash
   sudo apt install python3 python3-pip python3-venv -y
   ```

3. **Install Cloudflare Tunnel (cloudflared):**
   ```bash
   # Download the latest release (adjust version as needed)
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm
   sudo mv cloudflared-linux-arm /usr/local/bin/cloudflared
   sudo chmod +x /usr/local/bin/cloudflared
   ```

### Step 2: Deploy Application Files

1. **Transfer files to the Pi:**
   You can use `scp`, `rsync`, or `git clone`:
   ```bash
   # From your local machine
   scp -r 5-more-minutes pi@raspberrypi.local:/home/pi/
   ```

   Or if using git:
   ```bash
   # On the Pi
   cd /home/pi
   git clone <your-repo-url> 5-more-minutes
   ```

2. **Build the frontend on your local machine:**
   ```bash
   cd frontend
   npm run build
   ```

3. **Transfer the built static files:**
   ```bash
   # The static files should already be in backend/static/ after build
   # Make sure button-actions.json is also transferred (it's in the root directory)
   # When using scp/rsync, ensure the entire project directory is transferred
   ```
   
   **Important:** Make sure `button-actions.json` is included in the transfer. This file is required for the app to function properly.

### Step 3: Set Up Python Environment

On the Raspberry Pi:

```bash
cd /home/pi/5-more-minutes/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 4: Configure Cloudflare Tunnel

1. **Authenticate cloudflared:**
   ```bash
   cloudflared tunnel login
   ```
   This will open a browser window for you to authenticate with Cloudflare.

2. **Create a tunnel:**
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

### Step 5: Set Up Systemd Services

1. **Configure the Flask service:**
   ```bash
   cd /home/pi/5-more-minutes/backend
   sudo nano /etc/systemd/system/5-more-minutes.service
   ```
   
   Copy the contents from `backend/5-more-minutes.service` and adjust paths if needed. Make sure to:
   - Update `SECRET_KEY` environment variable with a secure random key
   - Verify all paths are correct

2. **Configure the Cloudflare Tunnel service:**
   ```bash
   sudo nano /etc/systemd/system/cloudflared.service
   ```
   
   Copy the contents from `backend/cloudflared.service`

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

6. **View logs:**
   ```bash
   sudo journalctl -u 5-more-minutes.service -f
   sudo journalctl -u cloudflared.service -f
   ```

### Step 6: Initialize Database

The database will be created automatically on first run, but you can verify:

```bash
cd /home/pi/5-more-minutes/backend
source venv/bin/activate
python3 -c "from app import init_db; init_db()"
```

### Step 7: File Permissions

Ensure the uploads directory has proper permissions:

```bash
mkdir -p /home/pi/5-more-minutes/backend/uploads
chmod 755 /home/pi/5-more-minutes/backend/uploads
```

## Security Considerations

1. **Change the SECRET_KEY:**
   - Generate a secure random key: `python3 -c "import secrets; print(secrets.token_hex(32))"`
   - Update it in the systemd service file

2. **Firewall:**
   - The app binds to 127.0.0.1, so it's only accessible locally
   - Cloudflare Tunnel handles external access securely
   - No need to open ports on your router

3. **Cloudflare Security:**
   - Enable Cloudflare's security features in your dashboard
   - Consider enabling WAF rules for additional protection

## Troubleshooting

### Flask app won't start
- Check logs: `sudo journalctl -u 5-more-minutes.service -n 50`
- Verify Python virtual environment is activated in the service
- Check file permissions on the backend directory

### Cloudflare Tunnel issues
- Verify tunnel is running: `cloudflared tunnel list`
- Check tunnel logs: `sudo journalctl -u cloudflared.service -f`
- Test tunnel manually: `cloudflared tunnel --config ~/.cloudflared/config.yml run`

### Database issues
- Ensure the `backend/` directory is writable
- Check that SQLite is installed: `sqlite3 --version`

### Static files not loading
- Verify `backend/static/` directory exists and contains built files
- Check that the build was successful: `ls -la backend/static/`

### Profile pictures not displaying
- Check `backend/uploads/` directory exists and is writable
- Verify file permissions: `chmod 755 backend/uploads`
- Check Flask logs for upload errors

## Development vs Production

**Development:**
- Vite dev server on port 5173 with hot-reload
- Flask dev server on port 5000
- Development database in `backend/app.db`

**Production:**
- Flask serves static files from `backend/static/`
- Gunicorn runs Flask with single worker
- App binds to 127.0.0.1:5000
- Cloudflare Tunnel exposes it securely
- Production database in `backend/app.db`

## Configuration

### Button Actions Configuration

Button actions and their minute values are configured in `button-actions.json` in the root directory. This file is used by:

- **Static HTML demo** (`index.html`) - Loads directly from the JSON file
- **React app** - Fetches from `/api/button-actions` endpoint
- **Flask backend** - Validates actions against this file

To add, remove, or modify button actions, simply edit `button-actions.json`:

```json
{
  "actions": [
    {
      "text": "skipped a meal!",
      "minutes": 30
    },
    {
      "text": "skipped a drink!",
      "minutes": 15
    },
    {
      "text": "went running!",
      "minutes": 45
    }
  ]
}
```

Changes will be reflected immediately when the app is accessed (no restart needed for Flask, just refresh the browser).

## API Endpoints

- `GET /api/button-actions` - Get button actions configuration
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile
- `GET /api/time` - Get current time data
- `POST /api/time/add` - Add time via action
- `GET /api/uploads/<filename>` - Serve uploaded files
- `GET /button-actions.json` - Serve button actions JSON (for static HTML)

## GitHub Pages Static Demo

A static HTML version of the app is available in `index.html` for use with GitHub Pages. This version:

- Uses Daniel's account data and profile picture
- Has fully functional buttons that update the time display
- Does **not** persist data to the backend (resets on page reload)
- Has disabled logout and edit profile links
- Is completely self-contained (no external dependencies)

### Setting Up GitHub Pages

1. **Ensure the profile picture is in the repo root:**
   - The file `daniel-profile.jpg` should be in the root directory
   - If it's not there, copy it from `backend/uploads/profile_1_1767124672.jpeg`

2. **Enable GitHub Pages:**
   - Go to your repository settings
   - Navigate to "Pages" in the left sidebar
   - Under "Source", select the branch containing `index.html` (usually `main` or `master`)
   - Select the root directory
   - Click "Save"

3. **Access your site:**
   - Your site will be available at `https://<username>.github.io/5-more-minutes/`
   - It may take a few minutes for the site to be available after enabling

The static version is perfect for demonstrating the UI without requiring backend infrastructure.

## License

This project is provided as-is for personal use.

## Development History

This section documents the complete development process, including all prompts and changes made.

### Development Environment

- **AI Assistant**: Auto (agent router designed by Cursor)
- **IDE**: Cursor
- **Development Date**: December 2024

### Prompt 1: Initial Project Creation

**Original Prompt:**

```
Can you create a starter app using React (built with Vite), Flask, and SQLite, designed to be developed and tested locally first and then deployed onto a Raspberry Pi Zero and exposed via a Cloudflare Tunnel? The React frontend should be scaffolded and built using Vite strictly as a development and build tool so that all JavaScript compilation and hot-reload development happens on the local development machine, with the production output being a static SPA that is later copied to and served by Flask on the Pi (no Node.js, no Vite, and no SSR in production, and explicitly no Next.js). During local development, the app should run with the Vite dev server on one port and Flask on another, using a dev proxy so the frontend consistently calls /api/*, and should be fully testable locally before deployment. Flask should act as the sole production server, providing a small JSON REST API under /api/* and serving the built React static files with an SPA fallback to index.html. The backend should use Python 3 with Flask, gunicorn (single worker), and SQLite accessed directly via sqlite3 (no ORM), and should include proper handling of reverse-proxy headers (e.g., X-Forwarded-Proto) for use behind Cloudflare. In production on the Pi, the app should bind only to 127.0.0.1, assume TLS termination at Cloudflare, and be suitable for running as systemd services alongside cloudflared. The initial feature scope should be a minimal CRUD example (list, create, delete items) intended to validate local development, React–Flask integration, SQLite persistence, and tunnel-based deployment, while explicitly avoiding Docker, SSR frameworks, multiple workers, or heavy frontend/state libraries.

The CSS for the app should generally resemple a simple Instagram UI. The landing page should display the centered text "5 More Minutes". Under this should be a large circular div that will display an image of a proffile picture. Under this should be the smaller centered text "with Daniel!". Under this should be dynamic text saying "+ 6 days 13 hours 32 minutes". Under this should be a vertical stack of styled rounded buttons saying "skipped a meal!", "skipped a drink!", "went running!". When these are clicked they should increase the dynamically displayed number of days / times based on a static table that associates buttons pressed with a number of minutes to increase the overall calculated time by. 

There should be standard styled log in / registration pages that the user is automatically routed to if they do not yet have an account. Theses should allow new users to set their username, email, the name that will be displayed in place of "Daniel" and they should be able to upload an image that will be used as the profile pic. The app should be structured so the image file will be stored locally. This should work on local development as well as when the app is deployed on the pi. There should be small links at the bottom of the main page to log out or edit profile information. There should be an edit profile page that allows them to edit all their info including the profile pic. Their number of minutes should start at zero.

Please create a readme file clearly explaining how to run the app locally for development, how to deploy it / set it up on a raspberry pi including how to set up the pi and the cloudflare tunnel etc.
```

**Changes Made:**

1. **Project Structure Created:**
   - Set up `frontend/` directory with React + Vite configuration
   - Set up `backend/` directory with Flask application
   - Created `.gitignore` files for both frontend and backend

2. **Frontend Implementation:**
   - Created React app with Vite (`frontend/package.json`, `vite.config.js`)
   - Implemented Instagram-inspired UI styling
   - Created routing with React Router (`App.jsx`)
   - Built Home page with:
     - Centered "5 More Minutes" title
     - Circular profile picture display
     - Dynamic time display (days, hours, minutes)
     - Three action buttons: "skipped a meal!" (30 min), "skipped a drink!" (15 min), "went running!" (45 min)
   - Created Login and Register pages with form handling
   - Created Edit Profile page
   - Implemented authentication flow with session management
   - Configured Vite dev proxy to forward `/api/*` to Flask on port 5000
   - Configured Vite build to output to `backend/static/`

3. **Backend Implementation:**
   - Created Flask app (`backend/app.py`) with:
     - SQLite database using direct `sqlite3` (no ORM)
     - User authentication with session-based login
     - REST API endpoints under `/api/*`:
       - `/api/auth/register` - User registration with profile picture upload
       - `/api/auth/login` - User login
       - `/api/auth/logout` - User logout
       - `/api/auth/me` - Get current user
       - `/api/auth/profile` - Update user profile
       - `/api/time` - Get current time data
       - `/api/time/add` - Add time via button actions
       - `/api/uploads/<filename>` - Serve uploaded profile pictures
     - Local file storage for profile pictures in `backend/uploads/`
     - SPA fallback routing to serve `index.html` for all non-API routes
     - Static file serving for built React assets
     - Reverse proxy header handling for Cloudflare (`X-Forwarded-Proto`)
     - Database initialization on app startup
   - Created `requirements.txt` with Flask, gunicorn, and Werkzeug
   - Created `gunicorn_config.py` for production (single worker, binds to 127.0.0.1:5000)

4. **Production Configuration:**
   - Created systemd service file for Flask app (`backend/5-more-minutes.service`)
   - Created systemd service file for Cloudflare Tunnel (`backend/cloudflared.service`)
   - Created Cloudflare Tunnel example config (`backend/cloudflared.config.example.yml`)
   - Created deployment script (`deploy.sh`)

5. **Documentation:**
   - Created comprehensive README with:
     - Local development setup instructions
     - Raspberry Pi deployment guide
     - Cloudflare Tunnel setup instructions
     - Systemd service configuration
     - Troubleshooting section
     - API endpoint documentation

6. **Database Schema:**
   - `users` table: id, username, email, password_hash, display_name, profile_picture, total_minutes, created_at
   - `time_actions` table: id, user_id, action, minutes_added, created_at

### Prompt 2: Development History Documentation

**Prompt:**

```
Great! Can you add a section to the README that includes the complete original system prompt I gave you and all additional prompts. This should be added to every time I give you a new prompt so that there is a complete development record. Please add brief notes about what changes were made after each prompt. Also include a note on the exact model and cursor version being used for development.
```

**Changes Made:**

1. **Documentation Update:**
   - Added "Development History" section to README
   - Included development environment information (Auto agent router, Cursor IDE)
   - Documented Prompt 1 (initial project creation) with full prompt text and detailed change log
   - Documented Prompt 2 (this prompt) with change log
   - Established format for future prompt documentation

### Prompt 3: CORS and 403 Error Fix

**Prompt:**

```
Ok fantastic it's working! Can you update it so it does not display days, hours or minutes respectively if they are at 0? Also please update the UI so the background on the main page is white and there is no border on the image? Also the image should be a bit larger. And please update the README file to include all the additional prompts that you have been given.
```

**Note:** This prompt was actually preceded by a bug report about a 403 error, which was fixed first.

**Initial Bug Report:**

```
Great! I started up the app but I'm getting this 403 error in the browser when trying to register a new user: 'Request URL
http://localhost:5173/api/auth/register
Request Method
POST
Status Code
403 Forbidden
Remote Address
[::1]:5173
Referrer Policy
strict-origin-when-cross-origin'
```

**Changes Made:**

1. **CORS Configuration (Bug Fix):**
   - Added CORS headers to Flask app for development (localhost/127.0.0.1)
   - Added `@app.after_request` handler to set CORS headers on all responses
   - Added `@app.before_request` handler to handle OPTIONS preflight requests
   - Updated session cookie configuration to allow cross-origin cookies in development
   - Added `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_HTTPONLY`, and `SESSION_COOKIE_SECURE` settings
   - Updated Vite proxy configuration to use `127.0.0.1` instead of `localhost` and added `secure: false`

2. **UI Improvements:**
   - Updated time display to conditionally show days, hours, and minutes only if they are greater than 0
   - Added proper pluralization (e.g., "1 day" vs "2 days")
   - Changed main page background from `#fafafa` to `white`
   - Removed border from profile picture (changed from `border: 3px solid #dbdbdb` to `border: none`)
   - Increased profile picture size from 120px to 180px (both image and placeholder)

3. **Documentation Update:**
   - Added Prompt 3 to development history section
   - Documented the 403 error fix and UI improvements

### Prompt 4: GitHub Pages Static Demo

**Prompt:**

```
Fantastic! Using the account I just created for Daniel and the image I uploaded can you create a static example index.html file that I can use as a github page for this repo? The buttons should still work but should not persist to the backend and the numbers should reset when the page is reloaded. The logout and edit profile links should be disabled.
```

**Changes Made:**

1. **Static HTML File Creation:**
   - Created `index.html` in the repo root for GitHub Pages
   - Embedded all CSS styles inline (no external dependencies)
   - Implemented vanilla JavaScript for button functionality
   - Time tracking uses in-memory state only (resets on page reload)
   - Buttons are fully functional but don't communicate with backend
   - Logout and edit profile links are disabled (grayed out, non-clickable)

2. **Profile Picture Setup:**
   - Copied Daniel's profile picture from `backend/uploads/profile_1_1767124672.jpeg` to `daniel-profile.jpg` in repo root
   - Added fallback placeholder if image fails to load
   - Included comments in HTML explaining how to update the image path

3. **Documentation:**
   - Added "GitHub Pages Static Demo" section to README
   - Included instructions for setting up GitHub Pages
   - Documented that the static version is self-contained and doesn't require backend

---

## Major Feature Restructuring Summary

This section summarizes the major prompts that restructured the app beyond minor styling changes.

### Centralized Button Actions Configuration
**Key Change:** Moved from hardcoded button definitions to a centralized `button-actions.json` file.

- Created `button-actions.json` in the root directory as the single source of truth
- Actions are dynamically loaded by both the React app and static HTML demo
- Added `/api/button-actions` endpoint to serve the JSON configuration
- Enables easy addition/modification of actions without code changes

### Action Tracking and Repeatability System
**Key Change:** Implemented sophisticated action tracking with timezone-aware daily limits and similarity detection.

- Added timestamp tracking for all actions in the database
- Implemented timezone-aware "today" calculation (actions reset at midnight in user's local timezone)
- Added `is-repeatable-daily` flag to control whether actions can be repeated
- Implemented `similar-to` array to prevent duplicate similar actions (e.g., "fasted 12+ hours" and "fasted 14+ hours")
- Actions are grayed out and disabled if already taken (for non-repeatable) or if a similar action was taken
- Added `/api/actions/today` endpoint that accepts timezone offset for accurate daily tracking

### Enhanced Confirmation Modal System
**Key Change:** Transformed simple button clicks into a comprehensive confirmation system with warnings and metadata.

- Modal now appears for all actions (not just those with warnings)
- Displays action name, minutes to be added, and detailed warnings
- Shows metadata: `is-repeatable-daily` and `must-be-logged-at-end-of-day` flags
- Includes collapsible JSON details section for full action configuration
- Disables confirmation button if action cannot be repeated
- Provides clear explanations when actions are disabled due to similarity or repeatability rules

### Time Display Animation and Formatting
**Key Change:** Added animated count-up effect and improved time formatting.

- Implemented smooth count-up animation when actions are confirmed
- Animation scrolls page to top and counts minutes incrementally
- Uses ease-out cubic easing for natural deceleration
- Changed time format to abbreviations: "dy"/"dys", "hrs", "mins"
- Increased font size and weight for better visibility

### Button Styling and Organization
**Key Change:** Enhanced visual design with pastel colors and improved organization.

- Implemented pastel rainbow color scheme (6 colors cycling through buttons)
- Buttons sorted by minutes (ascending: lowest at top, highest at bottom)
- Added minutes display in button text: "action name (+X)"
- Increased button text size for better readability
- All minutes rounded to whole numbers

### Administrative Features
**Key Change:** Added hidden administrative page for user management.

- Created `/users` route (hidden, not in main navigation)
- Displays all registered users with profile information
- Shows total accumulated minutes for each user
- Collapsible sections showing all actions for each user in reverse chronological order
- Reset functionality to clear all actions and reset minutes for individual users
- Added `/api/users`, `/api/users/<id>/actions`, and `/api/users/<id>/reset` endpoints

### Static Demo Enhancements
**Key Change:** Updated static HTML demo to match all production features.

- Static demo now loads `button-actions.json` dynamically
- Implements all modal features (warnings, metadata, JSON details)
- Includes action tracking and repeatability logic (resets on page reload)
- Matches production UI with pastel colors, sorting, and formatting
- Fully functional demo without backend dependency

