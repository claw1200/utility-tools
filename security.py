import logging
import secrets
from collections import defaultdict
from datetime import datetime, timedelta
import io
from flask import jsonify
from config import SECURITY_CONFIG, PATHS

# Initialize logging
logging.basicConfig(
    filename=PATHS['LOG_FILE'],
    level=logging.INFO,
    format='%(asctime)s - %(message)s'
)

# Global security state
ip_request_count = defaultdict(list)
BANNED_IPS = set()

def is_rate_limited(ip):
    """Check if an IP is rate limited"""
    if ip in BANNED_IPS:
        return True
        
    current_time = datetime.now()
    # Remove requests older than RATE_LIMIT_MINUTES
    ip_request_count[ip] = [timestamp for timestamp in ip_request_count[ip] 
                           if current_time - timestamp < timedelta(minutes=SECURITY_CONFIG['RATE_LIMIT_MINUTES'])]
    
    # Add current request
    ip_request_count[ip].append(current_time)
    
    # Check if too many requests
    return len(ip_request_count[ip]) > SECURITY_CONFIG['MAX_REQUESTS']

def save_banned_ips():
    """Save banned IPs to file"""
    with open(PATHS['BANNED_IPS_FILE'], 'w') as f:
        f.write('\n'.join(BANNED_IPS))

def load_banned_ips():
    """Load banned IPs from file"""
    try:
        with open(PATHS['BANNED_IPS_FILE'], 'r') as f:
            BANNED_IPS.update(f.read().splitlines())
    except FileNotFoundError:
        pass

def check_raw_request(raw_data, client_ip):
    """Check raw request data for malicious patterns"""
    for pattern in SECURITY_CONFIG['MALICIOUS_PATTERNS']:
        if pattern in raw_data:
            logging.warning(f"Blocked malicious request from {client_ip} matching pattern: {pattern}")
            BANNED_IPS.add(client_ip)
            save_banned_ips()
            return True
    return False

def check_suspicious_headers(headers_str):
    """Check request headers for suspicious patterns"""
    for header in SECURITY_CONFIG['SUSPICIOUS_HEADERS']:
        if header in headers_str.lower():
            return True
    return False

def generate_csrf_token():
    """Generate a new CSRF token"""
    return secrets.token_hex(32)

def verify_csrf_token(token):
    """Verify a CSRF token"""
    if not token:
        return False
    return len(token) == 64 and all(c in '0123456789abcdef' for c in token)

class MaliciousRequestMiddleware:
    """Middleware to check for malicious requests"""
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        client_ip = environ.get('REMOTE_ADDR')
        
        if client_ip in BANNED_IPS:
            logging.warning(f"Rejected request from banned IP: {client_ip}")
            response = jsonify({"error": "Access denied"})
            return response(environ, start_response)

        try:
            raw_data = environ.get('wsgi.input').read()
            if check_raw_request(raw_data, client_ip):
                response = jsonify({"error": "Access denied"})
                return response(environ, start_response)
            environ['wsgi.input'] = io.BytesIO(raw_data)
        except Exception as e:
            logging.error(f"Error processing request from {client_ip}: {e}")
            BANNED_IPS.add(client_ip)
            save_banned_ips()
            response = jsonify({"error": "Access denied"})
            return response(environ, start_response)

        return self.app(environ, start_response) 