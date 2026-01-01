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
DATABASE = Path(os.environ.get('FIVEMORE_DB_PATH', BASE_DIR / 'app.db'))
UPLOAD_FOLDER = BASE_DIR / 'uploads'
UPLOAD_FOLDER.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
BUTTON_ACTIONS_FILE = PROJECT_ROOT / 'button-actions.json'

# Load button actions from JSON file
def load_button_actions():
    """Load button actions from JSON file - returns full action objects"""
    try:
        if BUTTON_ACTIONS_FILE.exists():
            with open(BUTTON_ACTIONS_FILE, 'r') as f:
                data = json.load(f)
                return data.get('actions', [])
    except Exception as e:
        print(f"Error loading button actions: {e}")
    
    # Fallback to default actions
    return [
        {'text': 'skipped a meal!', 'minutes': 30, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False},
        {'text': 'skipped a drink!', 'minutes': 15, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False},
        {'text': 'went running!', 'minutes': 45, 'similar-to': [], 'is-repeatable-daily': True, 'must-be-logged-at-end-of-day': False}
    ]

def get_button_minutes_dict():
    """Get button actions as a text->minutes dict for backward compatibility"""
    actions = load_button_actions()
    return {action['text']: action['minutes'] for action in actions}

def get_button_minutes():
    """Get current button actions mapping for the logged-in user"""
    user_id = session.get('user_id')
    button_minutes = get_button_minutes_dict()
    
    # Apply user-specific changes (deletions, edits, custom actions)
    if user_id:
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Get deleted actions (remove from dict)
            cursor.execute('''
                SELECT action_text
                FROM deleted_actions
                WHERE user_id = ?
            ''', (user_id,))
            deleted_actions = cursor.fetchall()
            for row in deleted_actions:
                deleted_text = row['action_text']
                if deleted_text in button_minutes:
                    del button_minutes[deleted_text]
            
            # Get edited actions (overrides for default actions)
            cursor.execute('''
                SELECT text, minutes
                FROM edited_actions
                WHERE user_id = ?
            ''', (user_id,))
            edited_actions = cursor.fetchall()
            
            # Apply edits (overrides) - use edited text as key
            for action in edited_actions:
                button_minutes[action['text']] = action['minutes']
            
            # Add custom actions
            cursor.execute('''
                SELECT text, minutes
                FROM custom_actions
                WHERE user_id = ?
            ''', (user_id,))
            custom_actions = cursor.fetchall()
            conn.close()
            
            for action in custom_actions:
                button_minutes[action['text']] = action['minutes']
        except Exception as e:
            print(f"Error loading actions for button minutes: {e}")
    
    return button_minutes


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
    
    # Custom actions table (user-created actions)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            similar_to TEXT,
            is_repeatable_daily INTEGER DEFAULT 1,
            must_be_logged_at_end_of_day INTEGER DEFAULT 0,
            warning TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Deleted actions table (user-deleted default actions)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, action_text)
        )
    ''')
    
    # Edited actions table (user-edited default actions)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edited_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            original_text TEXT NOT NULL,
            text TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            similar_to TEXT,
            is_repeatable_daily INTEGER DEFAULT 1,
            must_be_logged_at_end_of_day INTEGER DEFAULT 0,
            warning TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, original_text)
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


@app.route('/api/time/today', methods=['GET'])
def get_time_today():
    """Get time added today (since local midnight)"""
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
        from datetime import datetime, timedelta, timezone
        
        # Get current time in user's timezone
        user_tz = timezone(timedelta(minutes=-timezone_offset))
        now = datetime.now(user_tz)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Convert to UTC for comparison with database timestamps
        today_start_utc = today_start.astimezone(timezone.utc)
        
        # Get all time actions for this user with timestamps
        cursor.execute('''
            SELECT minutes_added, created_at
            FROM time_actions
            WHERE user_id = ?
        ''', (user_id,))
        
        actions = cursor.fetchall()
        conn.close()

        # Sum minutes for actions that occurred today
        total_minutes_today = 0
        for action in actions:
            try:
                action_str = action['created_at']
                if 'T' in action_str:
                    if action_str.endswith('Z'):
                        action_str = action_str.replace('Z', '+00:00')
                    elif '+' not in action_str and '-' not in action_str[-6:]:
                        action_str = action_str + '+00:00'
                    action_time = datetime.fromisoformat(action_str)
                else:
                    action_time = datetime.strptime(action_str, '%Y-%m-%d %H:%M:%S')
                    action_time = action_time.replace(tzinfo=timezone.utc)
                
                if action_time >= today_start_utc:
                    total_minutes_today += action['minutes_added'] or 0
            except Exception as e:
                print(f"Error parsing timestamp {action['created_at']}: {e}")
                continue

        time_data = minutes_to_days_hours_minutes(total_minutes_today)
        return jsonify(time_data), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


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

        # Count occurrences of each action
        from collections import Counter
        action_counts = Counter(actions_today)
        
        # Return unique actions and counts
        return jsonify({
            'actions': list(set(actions_today)),  # Keep for backward compatibility
            'action_counts': dict(action_counts)  # New: action -> count mapping
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/button-actions', methods=['GET'])
def get_button_actions():
    """Get button actions configuration with user-specific edits and deletions"""
    user_id = session.get('user_id')
    
    # Load default actions from JSON file (never modified)
    default_actions = load_button_actions()
    actions = []
    
    # Get user's deleted and edited actions if logged in
    deleted_texts = set()
    edited_actions_map = {}
    
    if user_id:
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Get deleted actions
            cursor.execute('''
                SELECT action_text
                FROM deleted_actions
                WHERE user_id = ?
            ''', (user_id,))
            deleted_actions = cursor.fetchall()
            deleted_texts = {row['action_text'] for row in deleted_actions}
            
            # Get edited actions
            cursor.execute('''
                SELECT original_text, text, minutes, similar_to, is_repeatable_daily,
                       must_be_logged_at_end_of_day, warning
                FROM edited_actions
                WHERE user_id = ?
            ''', (user_id,))
            edited_actions = cursor.fetchall()
            for action in edited_actions:
                edited_actions_map[action['original_text']] = {
                    'text': action['text'],
                    'minutes': action['minutes'],
                    'similar-to': json.loads(action['similar_to']) if action['similar_to'] else [],
                    'is-repeatable-daily': bool(action['is_repeatable_daily']),
                    'must-be-logged-at-end-of-day': bool(action['must_be_logged_at_end_of_day']),
                    'warning': action['warning'] if action['warning'] else None,
                }
            
            # Get custom actions
            cursor.execute('''
                SELECT text, minutes, similar_to, is_repeatable_daily, 
                       must_be_logged_at_end_of_day, warning
                FROM custom_actions
                WHERE user_id = ?
                ORDER BY created_at ASC
            ''', (user_id,))
            custom_actions = cursor.fetchall()
            conn.close()
            
            # Add custom actions
            for action in custom_actions:
                actions.append({
                    'text': action['text'],
                    'minutes': action['minutes'],
                    'similar-to': json.loads(action['similar_to']) if action['similar_to'] else [],
                    'is-repeatable-daily': bool(action['is_repeatable_daily']),
                    'must-be-logged-at-end-of-day': bool(action['must_be_logged_at_end_of_day']),
                    'warning': action['warning'] if action['warning'] else None,
                    'is_custom': True,
                })
        except Exception as e:
            print(f"Error loading user actions: {e}")
    
    # Process default actions: filter deleted, apply edits
    for action in default_actions:
        original_text = action['text']
        
        # Skip if deleted
        if original_text in deleted_texts:
            continue
        
        # Use edited version if exists, otherwise use default
        if original_text in edited_actions_map:
            edited = edited_actions_map[original_text]
            actions.append({
                **action,
                'text': edited['text'],
                'minutes': edited['minutes'],
                'similar-to': edited['similar-to'],
                'is-repeatable-daily': edited['is-repeatable-daily'],
                'must-be-logged-at-end-of-day': edited['must-be-logged-at-end-of-day'],
                'warning': edited['warning'],
                'original_text': original_text,  # Keep track of original for editing
                'is_edited': True,
            })
        else:
            actions.append({
                **action,
                'original_text': original_text,
                'is_edited': False,
            })
    
    return jsonify({'actions': actions}), 200


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

        # Get minutes - check button_minutes first, then check edited/custom actions
        minutes_to_add = None
        if action in button_minutes:
            minutes_to_add = button_minutes[action]
        else:
            # Try to find in edited or custom actions
            conn = get_db()
            cursor = conn.cursor()
            
            # Check edited actions
            cursor.execute('''
                SELECT minutes
                FROM edited_actions
                WHERE user_id = ? AND text = ?
            ''', (user_id, action))
            edited = cursor.fetchone()
            
            if edited:
                minutes_to_add = edited['minutes']
            else:
                # Check custom actions
                cursor.execute('''
                    SELECT minutes
                    FROM custom_actions
                    WHERE user_id = ? AND text = ?
                ''', (user_id, action))
                custom = cursor.fetchone()
                
                if custom:
                    minutes_to_add = custom['minutes']
            
            conn.close()
            
            if minutes_to_add is None:
                return jsonify({'error': 'Invalid action'}), 400

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


@app.route('/api/actions/today/reset', methods=['POST'])
def reset_today_actions():
    """Reset actions from the current day (since previous midnight)"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        # Get timezone offset from request body or query parameter
        data = request.get_json() or {}
        timezone_offset = data.get('timezone_offset') or request.args.get('timezone_offset', type=int)
        if timezone_offset is None:
            return jsonify({'error': 'Timezone offset required'}), 400

        conn = get_db()
        cursor = conn.cursor()

        # Calculate today's start in UTC based on user's timezone
        from datetime import datetime, timedelta, timezone
        
        # Get current time in user's timezone
        user_tz = timezone(timedelta(minutes=-timezone_offset))
        now = datetime.now(user_tz)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Convert to UTC for comparison with database timestamps
        today_start_utc = today_start.astimezone(timezone.utc)
        
        # Get all time actions for this user
        cursor.execute('''
            SELECT id, action, minutes_added, created_at
            FROM time_actions
            WHERE user_id = ?
        ''', (user_id,))
        
        actions = cursor.fetchall()

        # Find actions from today and calculate total minutes to subtract
        actions_to_delete = []
        total_minutes_to_subtract = 0
        
        for action in actions:
            try:
                action_str = action['created_at']
                if 'T' in action_str:
                    if action_str.endswith('Z'):
                        action_str = action_str.replace('Z', '+00:00')
                    elif '+' not in action_str and '-' not in action_str[-6:]:
                        action_str = action_str + '+00:00'
                    action_time = datetime.fromisoformat(action_str)
                else:
                    action_time = datetime.strptime(action_str, '%Y-%m-%d %H:%M:%S')
                    action_time = action_time.replace(tzinfo=timezone.utc)
                
                if action_time >= today_start_utc:
                    actions_to_delete.append(action['id'])
                    total_minutes_to_subtract += action['minutes_added'] or 0
            except Exception as e:
                print(f"Error parsing timestamp {action['created_at']}: {e}")
                continue

        # Delete today's actions
        if actions_to_delete:
            placeholders = ','.join(['?'] * len(actions_to_delete))
            cursor.execute(f'''
                DELETE FROM time_actions 
                WHERE id IN ({placeholders})
            ''', actions_to_delete)

        # Subtract today's minutes from total
        if total_minutes_to_subtract > 0:
            cursor.execute('''
                UPDATE users 
                SET total_minutes = MAX(0, total_minutes - ?)
                WHERE id = ?
            ''', (total_minutes_to_subtract, user_id))

        conn.commit()
        conn.close()

        return jsonify({
            'message': 'Today\'s actions reset successfully',
            'actions_deleted': len(actions_to_delete),
            'minutes_subtracted': total_minutes_to_subtract
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth/reset', methods=['POST'])
def reset_current_user():
    """Reset the current user's actions and total minutes, and restore default actions"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Delete all time actions for this user
        cursor.execute('DELETE FROM time_actions WHERE user_id = ?', (user_id,))

        # Reset total minutes to 0
        cursor.execute('''
            UPDATE users 
            SET total_minutes = 0
            WHERE id = ?
        ''', (user_id,))

        # Delete all custom actions
        cursor.execute('DELETE FROM custom_actions WHERE user_id = ?', (user_id,))
        
        # Delete all deleted actions (restore defaults)
        cursor.execute('DELETE FROM deleted_actions WHERE user_id = ?', (user_id,))
        
        # Delete all edited actions (restore defaults)
        cursor.execute('DELETE FROM edited_actions WHERE user_id = ?', (user_id,))

        conn.commit()
        conn.close()

        return jsonify({'message': 'User reset successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/actions/delete', methods=['POST'])
def delete_action():
    """Delete a default action for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        action_text = data.get('action_text', '').strip()
        
        if not action_text:
            return jsonify({'error': 'Action text is required'}), 400
        
        # Can only delete default actions, not custom ones
        default_actions = load_button_actions()
        default_texts = {action['text'] for action in default_actions}
        
        if action_text not in default_texts:
            return jsonify({'error': 'Can only delete default actions'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Add to deleted_actions (or update if exists)
        cursor.execute('''
            INSERT OR REPLACE INTO deleted_actions (user_id, action_text)
            VALUES (?, ?)
        ''', (user_id, action_text))
        
        # If this action was edited, remove the edit
        cursor.execute('''
            DELETE FROM edited_actions 
            WHERE user_id = ? AND original_text = ?
        ''', (user_id, action_text))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Action deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/actions/edit', methods=['POST'])
def edit_action():
    """Edit a default action for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        original_text = data.get('original_text', '').strip()
        text = data.get('text', '').strip()
        minutes = data.get('minutes', 0)
        similar_to = data.get('similar-to', [])
        is_repeatable_daily = data.get('is-repeatable-daily', True)
        must_be_logged_at_end_of_day = data.get('must-be-logged-at-end-of-day', False)
        warning = data.get('warning', '')
        
        if not original_text or not text:
            return jsonify({'error': 'Original text and new text are required'}), 400
        
        if not isinstance(minutes, int) or minutes < 0:
            return jsonify({'error': 'Minutes must be a non-negative integer'}), 400
        
        # Can only edit default actions
        default_actions = load_button_actions()
        default_texts = {action['text'] for action in default_actions}
        
        if original_text not in default_texts:
            return jsonify({'error': 'Can only edit default actions'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Remove from deleted_actions if it was deleted
        cursor.execute('''
            DELETE FROM deleted_actions 
            WHERE user_id = ? AND action_text = ?
        ''', (user_id, original_text))
        
        # Insert or update edited action
        cursor.execute('''
            INSERT OR REPLACE INTO edited_actions 
            (user_id, original_text, text, minutes, similar_to, is_repeatable_daily,
             must_be_logged_at_end_of_day, warning, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            user_id,
            original_text,
            text,
            minutes,
            json.dumps(similar_to) if similar_to else None,
            1 if is_repeatable_daily else 0,
            1 if must_be_logged_at_end_of_day else 0,
            warning if warning else None
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Action edited successfully',
            'action': {
                'original_text': original_text,
                'text': text,
                'minutes': minutes,
                'similar-to': similar_to,
                'is-repeatable-daily': is_repeatable_daily,
                'must-be-logged-at-end-of-day': must_be_logged_at_end_of_day,
                'warning': warning,
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/actions/restore', methods=['POST'])
def restore_action():
    """Restore a deleted default action for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        action_text = data.get('action_text', '').strip()
        
        if not action_text:
            return jsonify({'error': 'Action text is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Remove from deleted_actions
        cursor.execute('''
            DELETE FROM deleted_actions 
            WHERE user_id = ? AND action_text = ?
        ''', (user_id, action_text))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Action restored successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/custom-actions/delete', methods=['POST'])
def delete_custom_action_by_text():
    """Delete a custom action by text for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        action_text = data.get('text', '').strip()
        
        if not action_text:
            return jsonify({'error': 'Action text is required'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Delete the custom action
        cursor.execute('''
            DELETE FROM custom_actions 
            WHERE user_id = ? AND text = ?
        ''', (user_id, action_text))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Custom action deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/custom-actions/edit', methods=['POST'])
def edit_custom_action():
    """Edit a custom action for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        original_text = data.get('original_text', '').strip()
        text = data.get('text', '').strip()
        minutes = data.get('minutes', 0)
        similar_to = data.get('similar-to', [])
        is_repeatable_daily = data.get('is-repeatable-daily', True)
        must_be_logged_at_end_of_day = data.get('must-be-logged-at-end-of-day', False)
        warning = data.get('warning', '')
        
        if not original_text or not text:
            return jsonify({'error': 'Original text and new text are required'}), 400
        
        if not isinstance(minutes, int) or minutes < 0:
            return jsonify({'error': 'Minutes must be a non-negative integer'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Verify the action exists and belongs to this user
        cursor.execute('''
            SELECT id FROM custom_actions 
            WHERE user_id = ? AND text = ?
        ''', (user_id, original_text))
        
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Custom action not found'}), 404
        
        # Update the custom action
        cursor.execute('''
            UPDATE custom_actions 
            SET text = ?, minutes = ?, similar_to = ?, is_repeatable_daily = ?,
                must_be_logged_at_end_of_day = ?, warning = ?
            WHERE user_id = ? AND text = ?
        ''', (
            text,
            minutes,
            json.dumps(similar_to) if similar_to else None,
            1 if is_repeatable_daily else 0,
            1 if must_be_logged_at_end_of_day else 0,
            warning if warning else None,
            user_id,
            original_text
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Custom action updated successfully',
            'action': {
                'text': text,
                'minutes': minutes,
                'similar-to': similar_to,
                'is-repeatable-daily': is_repeatable_daily,
                'must-be-logged-at-end-of-day': must_be_logged_at_end_of_day,
                'warning': warning,
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/custom-actions', methods=['POST'])
def create_custom_action():
    """Create a new custom action for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.json
        text = data.get('text', '').strip()
        minutes = data.get('minutes', 0)
        similar_to = data.get('similar-to', [])
        is_repeatable_daily = data.get('is-repeatable-daily', True)
        must_be_logged_at_end_of_day = data.get('must-be-logged-at-end-of-day', False)
        warning = data.get('warning', '')
        
        if not text:
            return jsonify({'error': 'Action text is required'}), 400
        
        if not isinstance(minutes, int) or minutes < 0:
            return jsonify({'error': 'Minutes must be a non-negative integer'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Check if user already has an action with this text
        cursor.execute('''
            SELECT id FROM custom_actions 
            WHERE user_id = ? AND text = ?
        ''', (user_id, text))
        if cursor.fetchone():
            conn.close()
            return jsonify({'error': 'You already have an action with this text'}), 400
        
        # Insert new custom action
        cursor.execute('''
            INSERT INTO custom_actions 
            (user_id, text, minutes, similar_to, is_repeatable_daily, 
             must_be_logged_at_end_of_day, warning)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            text,
            minutes,
            json.dumps(similar_to) if similar_to else None,
            1 if is_repeatable_daily else 0,
            1 if must_be_logged_at_end_of_day else 0,
            warning if warning else None
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Custom action created successfully',
            'action': {
                'text': text,
                'minutes': minutes,
                'similar-to': similar_to,
                'is-repeatable-daily': is_repeatable_daily,
                'must-be-logged-at-end-of-day': must_be_logged_at_end_of_day,
                'warning': warning,
            }
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/users/<int:user_id>/reset', methods=['POST'])
def reset_user(user_id):
    """Reset a user's actions and total minutes, and restore default actions"""
    try:
        conn = get_db()
        cursor = conn.cursor()

        # Delete all time actions for this user
        cursor.execute('DELETE FROM time_actions WHERE user_id = ?', (user_id,))

        # Reset total minutes to 0
        cursor.execute('''
            UPDATE users 
            SET total_minutes = 0
            WHERE id = ?
        ''', (user_id,))

        # Delete all custom actions
        cursor.execute('DELETE FROM custom_actions WHERE user_id = ?', (user_id,))
        
        # Delete all deleted actions (restore defaults)
        cursor.execute('DELETE FROM deleted_actions WHERE user_id = ?', (user_id,))
        
        # Delete all edited actions (restore defaults)
        cursor.execute('DELETE FROM edited_actions WHERE user_id = ?', (user_id,))

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

