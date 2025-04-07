from flask import Flask, jsonify, request, send_from_directory, Response
import asyncio
import yt_dlp
from functools import partial
import os
import logging
from datetime import datetime, timedelta
from collections import defaultdict
import logging
import io
import json
import time
from urllib.parse import quote
import secrets
from security import (
    MaliciousRequestMiddleware, is_rate_limited, load_banned_ips,
    check_suspicious_headers, generate_csrf_token, verify_csrf_token,
    BANNED_IPS
)
from download import download_media_ytdlp, stream_progress, stream_file, get_formats
from config import FLASK_CONFIG, SERVER_CONFIG, SECURITY_CONFIG

app = Flask(__name__, static_folder='public', static_url_path='')
# turn on debug
app.debug = False
log = logging.getLogger('werkzeug')
log.setLevel(logging.DEBUG)

# Generate a secret key for CSRF token
app.secret_key = secrets.token_hex(32)

# Rate limiting and ban settings
RATE_LIMIT_MINUTES = 5
MAX_REQUESTS = 10
ip_request_count = defaultdict(list)
BANNED_IPS = set()

# Malicious request patterns
MALICIOUS_PATTERNS = [
    rb'\x03\x00\x00',  # Common malformed request pattern
    rb'\x16\x03\x01',  # SSL/TLS probe
    rb'Cookie:',       # Malformed cookie requests
    rb'\xc0\x14\xc0',  # Bad version requests (À encoded as \xc0)
]

logging.basicConfig(
    filename='server.log',
    level=logging.INFO,
    format='%(asctime)s - %(message)s'
)

# Add a global dictionary to store download progress
download_progress = {}

# Add size limit constant
MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024  # 100MB

def is_rate_limited(ip):
    # Don't even check rate limits for banned IPs
    if ip in BANNED_IPS:
        return True
        
    current_time = datetime.now()
    # Remove requests older than RATE_LIMIT_MINUTES
    ip_request_count[ip] = [timestamp for timestamp in ip_request_count[ip] 
                           if current_time - timestamp < timedelta(minutes=RATE_LIMIT_MINUTES)]
    
    # Add current request
    ip_request_count[ip].append(current_time)
    
    # Check if too many requests
    return len(ip_request_count[ip]) > MAX_REQUESTS

async def download_media_ytdlp(url, download_mode, format_id=None):
    # Generate a unique download ID
    download_id = str(datetime.now().timestamp())
    download_progress[download_id] = 0

    def progress_hook(d):
        if d['status'] == 'downloading':
            try:
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                downloaded = d.get('downloaded_bytes', 0)
                if total > 0:
                    progress = (downloaded / total) * 100
                    download_progress[download_id] = progress
            except Exception as e:
                logging.error(f"Error in progress hook: {e}")

    # Configure yt-dlp options based on download mode
    if download_mode == "audio":
        if format_id:
            download_setting_string = format_id

    else:  # video mode
        if format_id:
            download_setting_string = format_id



    ytdl_options = {
        "format": download_setting_string,
        "outtmpl": "temp/%(uploader)s - %(title).150B.%(ext)s",
        "quiet": True,
        "no_warnings": False,
        "noplaylist": True,
        "lazy_playlist": False,
        "playlist_items": "1",
        "noprogress": True,
        "nocheckcertificate": True,
        "cookiefile": ".cookies",
        "color": "never",
        "progress_hooks": [progress_hook],
        "postprocessors": [{
            "key": "FFmpegMetadata"
        }],
    }

    ytdl = yt_dlp.YoutubeDL(ytdl_options)

    # Run blocking operations in thread pool
    loop = asyncio.get_event_loop()
    try:

        # Now try the actual download
        info = await loop.run_in_executor(
            None,
            partial(ytdl.extract_info, url, download=True),
        )

    except yt_dlp.DownloadError as e:
        return jsonify({
            "error": str(e)
        }), download_id

    if "entries" in info:
        filepath = ytdl.prepare_filename(info["entries"][0])
    else:
        filepath = ytdl.prepare_filename(info)
    filename = os.path.basename(filepath)

    output = jsonify({
        "filepath": filepath,
        "filename": filename,
        "error": "none"
    }), download_id

    return output

@app.route('/download_progress/<download_id>')
def stream_progress(download_id):
    def generate():
        while True:
            # Get current progress
            progress = download_progress.get(download_id, 0)
            
            # Send progress to client
            data = json.dumps({"progress": progress})
            yield f"data: {data}\n\n"
            
            # Clean up if download is complete
            if progress >= 100:
                if download_id in download_progress:
                    del download_progress[download_id]
                break
                
            time.sleep(0.5)  # Wait half a second between updates

    return Response(generate(), mimetype='text/event-stream')

@app.before_request
def check_malicious_requests():
    """Check for malicious requests before processing"""
    load_banned_ips()
    
    if request.remote_addr in BANNED_IPS:
        return jsonify({"error": "Access denied"}), 403

    if check_suspicious_headers(str(request.headers)):
        logging.warning(f"Blocked suspicious request from {request.remote_addr}")
        return jsonify({"error": "Access denied"}), 403

@app.before_request
def check_csrf():
    """Check CSRF token for non-GET requests"""
    if request.method == 'GET' or request.path.startswith('/static/'):
        return
    
    if request.path == '/get_csrf_token':
        return
        
    csrf_token = request.headers.get('X-CSRF-Token')
    if not verify_csrf_token(csrf_token):
        return jsonify({'error': 'Invalid CSRF token'}), 403

@app.route('/get_csrf_token')
def get_csrf_token():
    """Get a new CSRF token"""
    token = generate_csrf_token()
    return jsonify({'csrf_token': token})

@app.route('/download_progress/<download_id>')
def stream_progress_route(download_id):
    """Stream download progress"""
    return stream_progress(download_id)

@app.route('/download_node', methods=['POST'])
def download_node():
    """Handle download requests"""
    client_ip = request.remote_addr
    
    if is_rate_limited(client_ip):
        return jsonify({
            "error": f"Rate limit exceeded. Please wait {SECURITY_CONFIG['RATE_LIMIT_MINUTES']} minutes."
        }), 429

    url = request.json.get('url')
    download_mode = request.json.get('download_mode')
    format_id = request.json.get('format_id')

    try:
        response, download_id = asyncio.run(download_media_ytdlp(url, download_mode, format_id))
        
        if response.json['error'] != "none":
            return jsonify({"error": response.json['error']}), 400

        response.json['download_id'] = download_id
        file_location = response.json['filepath']
        filename = response.json['filename']

        return stream_file(file_location, filename)

    except Exception as e:
        logging.error(f"Error during download: {e}")
        return jsonify({"error": "An error occurred during the download process"}), 500

@app.route('/get_formats', methods=['POST'])
def get_formats_route():
    """Get available formats for a URL"""
    url = request.json.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400
    return get_formats(url)

# Static file routes
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/download/')
def serve_download():
    return send_from_directory(f"{app.static_folder}/download", 'index.html')

@app.route('/tempo-pitch-calc/')
def serve_tempo_pitch_calc():
    return send_from_directory(f"{app.static_folder}/tempo-pitch-calc", 'index.html')

@app.route('/spectrogram/')
def serve_spectrogram():
    return send_from_directory(f"{app.static_folder}/spectrogram", 'index.html')

@app.route('/qr-code/')
def serve_qr_code():
    return send_from_directory(f"{app.static_folder}/qr-code", 'index.html')

@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory(f"{app.static_folder}/404", 'index.html')

if __name__ == '__main__':
    load_banned_ips()
    # Add timeout configuration
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max-length
    # Use threaded mode for better handling of downloads
    app.run(
        host=SERVER_CONFIG['HOST'],
        port=SERVER_CONFIG['PORT'],
        threaded=SERVER_CONFIG['THREADED']
    )



