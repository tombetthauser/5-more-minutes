import os
import sqlite3
import hashlib
import secrets
import time
import json
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, session
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Session configuration for development (allows cross-origin cookies)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS

# Configuration
BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent
DATABASE = BASE_DIR / 'app.db'
UPLOAD_FOLDER = BASE_DIR / 'uploads'
UPLOAD_FOLDER.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
BUTTON_ACTIONS_FILE = PROJECT_ROOT / 'button-actions.json'

# Load button actions from JSON file
def load_button_actions():
    """Load button actions from JSON file"""
    try:
        if BUTTON_ACTIONS_FILE.exists():
            with open(BUTTON_ACTIONS_FILE, 'r') as f:
                data = json.load(f)
                return {action['text']: action['minutes'] for action in data.get('actions', [])}
    except Exception as e:
        print(f"Error loading button actions: {e}")
    
    # Fallback to default actions
    return {
        'skipped a meal!': 30,
        'skipped a drink!': 15,
        'went running!': 45,
    }

def get_button_minutes():
    """Get current button actions mapping"""
    return load_button_actions()


def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database schema"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            profile_picture TEXT,
            total_minutes INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Time actions table (for history if needed)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS time_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            minutes_added INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_profile_picture(file, user_id):
    """Save profile picture and return filename"""
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f'profile_{user_id}_{int(time.time())}.{ext}'
        filepath = UPLOAD_FOLDER / filename
        file.save(filepath)
        return filename
    return None


def minutes_to_days_hours_minutes(total_minutes):
    """Convert total minutes to days, hours, minutes"""
    days = total_minutes // (24 * 60)
    remaining = total_minutes % (24 * 60)
    hours = remaining // 60
    minutes = remaining % 60
    return {'days': days, 'hours': hours, 'minutes': minutes}


# Initialize database on app startup
with app.app_context():
    init_db()

# CORS headers for development
@app.after_request
def after_request(response):
    """Add CORS headers and handle reverse proxy"""
    # Handle reverse proxy headers for Cloudflare
    if request.headers.get('X-Forwarded-Proto') == 'https':
        request.scheme = 'https'
    
    # Add CORS headers for development (Vite dev server)
    origin = request.headers.get('Origin')
    if origin and ('localhost' in origin or '127.0.0.1' in origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    
    return response

# Handle preflight OPTIONS requests
@app.before_request
def handle_preflight():
    """Handle CORS preflight requests"""
    if request.method == 'OPTIONS':
        response = jsonify({})
        origin = request.headers.get('Origin')
        if origin and ('localhost' in origin or '127.0.0.1' in origin):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        return response


# Auth endpoints
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        username = request.form.get('username')
        email = request.form.get('email')
        display_name = request.form.get('display_name')
        password = request.form.get('password')
        profile_picture = request.files.get('profile_picture')

        if not all([username, email, display_name, password]):
            return jsonify({'error': 'Missing required fields'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Check if username or email already exists
        cursor.execute('SELECT id FROM users WHERE username = ? OR email = ?',
                      (username, email))
        if cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Username or email already exists'}), 400

        # Create user
        password_hash = generate_password_hash(password)
        cursor.execute('''
            INSERT INTO users (username, email, password_hash, display_name, total_minutes)
            VALUES (?, ?, ?, ?, 0)
        ''', (username, email, password_hash, display_name))
        user_id = cursor.lastrowid

        # Save profile picture if provided
        profile_pic_filename = None
        if profile_picture:
            profile_pic_filename = save_profile_picture(profile_picture, user_id)
            if profile_pic_filename:
                cursor.execute('''
                    UPDATE users SET profile_picture = ? WHERE id = ?
                ''', (profile_pic_filename, user_id))

        conn.commit()
        conn.close()

        # Set session
        session['user_id'] = user_id

        return jsonify({
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'display_name': display_name,
                'profile_picture': profile_pic_filename,
            }
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, username, email, display_name, profile_picture, password_hash
            FROM users WHERE username = ?
        ''', (username,))
        user = cursor.fetchone()
        conn.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Invalid credentials'}), 401

        session['user_id'] = user['id']

        return jsonify({
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'display_name': user['display_name'],
                'profile_picture': user['profile_picture'],
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out'}), 200


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """Get current authenticated user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, display_name, profile_picture
        FROM users WHERE id = ?
    ''', (user_id,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'display_name': user['display_name'],
            'profile_picture': user['profile_picture'],
        }
    }), 200


@app.route('/api/auth/profile', methods=['PUT'])
def update_profile():
    """Update user profile"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        conn = get_db()
        cursor = conn.cursor()

        # Get current user
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return jsonify({'error': 'User not found'}), 404

        # Update fields
        email = request.form.get('email', user['email'])
        display_name = request.form.get('display_name', user['display_name'])
        password = request.form.get('password')
        profile_picture = request.files.get('profile_picture')

        # Update password if provided
        password_hash = user['password_hash']
        if password:
            password_hash = generate_password_hash(password)

        # Update profile picture if provided
        profile_pic_filename = user['profile_picture']
        if profile_picture:
            # Delete old profile picture if exists
            if profile_pic_filename:
                old_file = UPLOAD_FOLDER / profile_pic_filename
                if old_file.exists():
                    old_file.unlink()
            profile_pic_filename = save_profile_picture(profile_picture, user_id)

        cursor.execute('''
            UPDATE users 
            SET email = ?, display_name = ?, password_hash = ?, profile_picture = ?
            WHERE id = ?
        ''', (email, display_name, password_hash, profile_pic_filename, user_id))

        conn.commit()
        conn.close()

        return jsonify({
            'user': {
                'id': user_id,
                'username': user['username'],
                'email': email,
                'display_name': display_name,
                'profile_picture': profile_pic_filename,
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Time tracking endpoints
@app.route('/api/time', methods=['GET'])
def get_time():
    """Get current time for user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT total_minutes FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    time_data = minutes_to_days_hours_minutes(user['total_minutes'])
    return jsonify(time_data), 200


@app.route('/api/actions/today', methods=['GET'])
def get_today_actions():
    """Get actions taken today (based on user's local timezone)"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        # Get timezone offset from query parameter (in minutes)
        timezone_offset = request.args.get('timezone_offset', type=int)
        if timezone_offset is None:
            return jsonify({'error': 'Timezone offset required'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Calculate today's start in UTC based on user's timezone
        # timezone_offset is in minutes (e.g., -300 for EST which is UTC-5)
        # We need to find actions that occurred after midnight in user's local time
        # SQLite stores timestamps in UTC, so we need to adjust
        
        # Get all actions for this user
        cursor.execute('''
            SELECT action, created_at
            FROM time_actions
            WHERE user_id = ?
            ORDER BY created_at DESC
        ''', (user_id,))
        
        actions = cursor.fetchall()
        conn.close()

        # Filter actions that occurred today in user's local timezone
        from datetime import datetime, timedelta, timezone
        
        # Get current time in user's timezone
        # timezone_offset is minutes from UTC (negative for west of UTC, positive for east)
        # JavaScript getTimezoneOffset() returns negative of what we need
        user_tz = timezone(timedelta(minutes=-timezone_offset))
        now = datetime.now(user_tz)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Convert to UTC for comparison with database timestamps
        today_start_utc = today_start.astimezone(timezone.utc)
        
        actions_today = []
        for action in actions:
            # Parse the timestamp (SQLite stores as string in UTC)
            try:
                # Handle different timestamp formats
                action_str = action['created_at']
                if 'T' in action_str:
                    # ISO format with or without timezone
                    if action_str.endswith('Z'):
                        action_str = action_str.replace('Z', '+00:00')
                    elif '+' not in action_str and '-' not in action_str[-6:]:
                        # Assume UTC if no timezone
                        action_str = action_str + '+00:00'
                    action_time = datetime.fromisoformat(action_str)
                else:
                    # SQLite datetime format: YYYY-MM-DD HH:MM:SS
                    action_time = datetime.strptime(action_str, '%Y-%m-%d %H:%M:%S')
                    # Assume UTC
                    action_time = action_time.replace(tzinfo=timezone.utc)
                
                if action_time >= today_start_utc:
                    actions_today.append(action['action'])
            except Exception as e:
                print(f"Error parsing timestamp {action['created_at']}: {e}")
                continue

        # Return unique actions taken today
        return jsonify({'actions': list(set(actions_today))}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/button-actions', methods=['GET'])
def get_button_actions():
    """Get button actions configuration"""
    try:
        if BUTTON_ACTIONS_FILE.exists():
            with open(BUTTON_ACTIONS_FILE, 'r') as f:
                data = json.load(f)
                return jsonify(data), 200
    except Exception as e:
        print(f"Error loading button actions: {e}")
    
    # Fallback to default actions
    return jsonify({
        'actions': [
            {'text': 'skipped a meal!', 'minutes': 30, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False},
            {'text': 'skipped a drink!', 'minutes': 15, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False},
            {'text': 'went running!', 'minutes': 45, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False}
        ]
    }), 200


@app.route('/api/time/add', methods=['POST'])
def add_time():
    """Add time based on action"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        data = request.json
        action = data.get('action')
        button_minutes = get_button_minutes()

        if action not in button_minutes:
            return jsonify({'error': 'Invalid action'}), 400

        minutes_to_add = button_minutes[action]

        conn = get_db()
        cursor = conn.cursor()

        # Update user's total minutes
        cursor.execute('''
            UPDATE users 
            SET total_minutes = total_minutes + ?
            WHERE id = ?
        ''', (minutes_to_add, user_id))

        # Record action
        cursor.execute('''
            INSERT INTO time_actions (user_id, action, minutes_added)
            VALUES (?, ?, ?)
        ''', (user_id, action, minutes_to_add))

        # Get updated total
        cursor.execute('SELECT total_minutes FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()

        conn.commit()
        conn.close()

        time_data = minutes_to_days_hours_minutes(user['total_minutes'])
        return jsonify(time_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# File serving endpoint
@app.route('/api/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded files"""
    return send_from_directory(UPLOAD_FOLDER, filename)


# Users listing endpoint (hidden page)
@app.route('/api/users', methods=['GET'])
def get_all_users():
    """Get all users (for hidden /users page)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, username, email, display_name, profile_picture, 
                   total_minutes, created_at
            FROM users
            ORDER BY created_at DESC
        ''')
        users = cursor.fetchall()
        conn.close()

        users_list = []
        for user in users:
            users_list.append({
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'display_name': user['display_name'],
                'profile_picture': user['profile_picture'],
                'total_minutes': user['total_minutes'],
                'created_at': user['created_at'],
            })

        return jsonify({'users': users_list}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<int:user_id>/actions', methods=['GET'])
def get_user_actions(user_id):
    """Get all actions for a specific user"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, action, minutes_added, created_at
            FROM time_actions
            WHERE user_id = ?
            ORDER BY created_at DESC
        ''', (user_id,))
        actions = cursor.fetchall()
        conn.close()

        actions_list = []
        for action in actions:
            actions_list.append({
                'id': action['id'],
                'action': action['action'],
                'minutes_added': action['minutes_added'],
                'created_at': action['created_at'],
            })

        return jsonify({'actions': actions_list}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<int:user_id>/reset', methods=['POST'])
def reset_user(user_id):
    """Reset a user's actions and total minutes"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Delete all actions for this user
        cursor.execute('DELETE FROM time_actions WHERE user_id = ?', (user_id,))

        # Reset total minutes to 0
        cursor.execute('''
            UPDATE users 
            SET total_minutes = 0
            WHERE id = ?
        ''', (user_id,))

        conn.commit()
        conn.close()

        return jsonify({'message': 'User reset successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Serve button actions JSON file (for static HTML)
@app.route('/button-actions.json')
def serve_button_actions():
    """Serve button actions JSON file"""
    try:
        if BUTTON_ACTIONS_FILE.exists():
            return send_from_directory(PROJECT_ROOT, 'button-actions.json')
    except Exception as e:
        print(f"Error serving button actions: {e}")
    
    # Fallback response
    return jsonify({
        'actions': [
            {'text': 'skipped a meal!', 'minutes': 30},
            {'text': 'skipped a drink!', 'minutes': 15},
            {'text': 'went running!', 'minutes': 45}
        ]
    }), 200


# SPA fallback - serve index.html for all non-API routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    """Serve React app with SPA fallback"""
    # Don't interfere with API routes
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    # Try to serve static files (JS, CSS, etc.) if they exist
    if path and not path.startswith('api/'):
        static_file = Path(app.static_folder) / path
        if static_file.exists() and static_file.is_file():
            return send_from_directory(app.static_folder, path)
    
    # Fallback to index.html for SPA routing
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='127.0.0.1', port=5000)

