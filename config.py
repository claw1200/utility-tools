import os
from datetime import timedelta

# Flask configuration
FLASK_CONFIG = {
    'DEBUG': False,
    'SECRET_KEY': os.urandom(32),
    'SEND_FILE_MAX_AGE_DEFAULT': 0,
    'MAX_CONTENT_LENGTH': 200 * 1024 * 1024  # 200MB
}

# Server configuration
SERVER_CONFIG = {
    'HOST': '0.0.0.0',
    'PORT': 9019,
    'THREADED': True
}

# Security settings
SECURITY_CONFIG = {
    'RATE_LIMIT_MINUTES': 5,
    'MAX_REQUESTS': 10,
    'MAX_DOWNLOAD_SIZE': 100 * 1024 * 1024,  # 100MB
    'MALICIOUS_PATTERNS': [
        rb'\x03\x00\x00',  # Common malformed request pattern
        rb'\x16\x03\x01',  # SSL/TLS probe
        rb'Cookie:',       # Malformed cookie requests
        rb'\xc0\x14\xc0',  # Bad version requests
    ],
    'SUSPICIOUS_HEADERS': [
        'sqlmap', 'acunetix', 'nikto', 'nmap',
        'masscan', 'zmeu', 'dirbuster', 'gobuster', 'burp'
    ]
}

# yt-dlp configuration
YTDL_CONFIG = {
    'DEFAULT_OPTIONS': {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'noplaylist': True,
        'lazy_playlist': False,
        'playlist_items': "1",
        'nocheckcertificate': True,
        'cookiefile': ".cookies",
        'color': "never"
    },
    'DOWNLOAD_OPTIONS': {
        'outtmpl': "temp/%(uploader)s - %(title).150B.%(ext)s",
        'quiet': True,
        'no_warnings': False,
        'noplaylist': True,
        'lazy_playlist': False,
        'playlist_items': "1",
        'noprogress': True,
        'nocheckcertificate': True,
        'cookiefile': ".cookies",
        'color': "never"
    }
}

# File paths
PATHS = {
    'BANNED_IPS_FILE': 'banned.txt',
    'LOG_FILE': 'server.log',
    'TEMP_DIR': 'temp'
} 