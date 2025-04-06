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
        else:
            download_setting_string = "bestaudio"
    else:  # video mode
        if format_id:
            download_setting_string = format_id
        else:
            download_setting_string = "best"

    print(f"\nAttempting download with format string: {download_setting_string}")

    ytdl_options = {
        "format": download_setting_string,
        "outtmpl": "temp/%(uploader)s - %(title).150B.%(ext)s",
        "quiet": False,
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
        "merge_output_format": "mp4"  # Ensure final output is mp4
    }

    ytdl = yt_dlp.YoutubeDL(ytdl_options)

    # Run blocking operations in thread pool
    loop = asyncio.get_event_loop()
    try:
        # First get format information without downloading
        ytdl_info = yt_dlp.YoutubeDL({
            **ytdl_options,
            "format": "best",
            "listformats": True,  # This will list all available formats
        })

        # Get format information first
        format_info = await loop.run_in_executor(
            None,
            partial(ytdl_info.extract_info, url, download=False),
        )

        # Now try the actual download
        info = await loop.run_in_executor(
            None,
            partial(ytdl.extract_info, url, download=True),
        )

    except yt_dlp.DownloadError as e:
        print(f"\nDownload error: {str(e)}")
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

@app.route('/download_node', methods=['POST'])
def download_node():
    client_ip = request.remote_addr
    
    if client_ip in BANNED_IPS:
        return jsonify({"error": "Access denied"}), 403
        
    if is_rate_limited(client_ip):
        return jsonify({
            "error": f"Rate limit exceeded. Please wait {RATE_LIMIT_MINUTES} minutes."
        }), 429

    logging.info("Received download request")
    url = request.json.get('url')
    download_mode = request.json.get('download_mode')
    format_id = request.json.get('format_id')  # New parameter

    logging.info(f"Request as follows:\nURL: {url}\nDownload Mode: {download_mode}\nFormat ID: {format_id}")

    try:
        # Get the download information
        response, download_id = asyncio.run(download_media_ytdlp(url, download_mode, format_id))
        
        if response.json['error'] != "none":
            return jsonify({"error": response.json['error']}), 400

        # Add download_id to response
        response.json['download_id'] = download_id

        file_location = response.json['filepath']
        filename = response.json['filename']

        # Stream the file
        def generate():
            buffer_size = 65536  # 64KB buffer for better streaming performance
            
            try:
                with open(file_location, 'rb') as f:
                    while True:
                        # Read into buffer
                        buffer = f.read(buffer_size)
                        if not buffer:
                            break
                        yield buffer
            finally:
                # Delete file after streaming is complete
                os.remove(file_location)
                logging.info(f"File deleted: {file_location}")

        response = app.response_class(
            generate(),
            mimetype='application/octet-stream',
            direct_passthrough=True
        )
        # url encode filename
        filename = quote(filename)
        print(filename)
        response.headers.set('Content-Disposition', f'attachment; filename={filename}')
        response.headers.set('Content-Length', str(os.path.getsize(file_location)))
        response.headers.set('Cache-Control', 'no-cache')
        response.headers.set('X-Accel-Buffering', 'no')  # Disable nginx buffering if present
        
        return response

    except Exception as e:
        logging.error(f"Error during download: {e}")
        return jsonify({"error": "An error occurred during the download process"}), 500

def save_banned_ips():
    with open('banned.txt', 'w') as f:
        f.write('\n'.join(BANNED_IPS))

def load_banned_ips():
    try:
        with open('banned.txt', 'r') as f:
            BANNED_IPS.update(f.read().splitlines())
    except FileNotFoundError:
        pass

def check_raw_request(raw_data, client_ip):
    """Check raw request data for malicious patterns"""
    for pattern in MALICIOUS_PATTERNS:
        if pattern in raw_data:
            logging.warning(f"Blocked malicious request from {client_ip} matching pattern: {pattern}")
            BANNED_IPS.add(client_ip)
            save_banned_ips()
            return True
    return False

class MaliciousRequestMiddleware:
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        # Get client IP
        client_ip = environ.get('REMOTE_ADDR')
        
        # Check if IP is already banned
        if client_ip in BANNED_IPS:
            logging.warning(f"Rejected request from banned IP: {client_ip}")
            response = jsonify({"error": "Access denied"})
            return response(environ, start_response)

        # Get raw request data
        try:
            raw_data = environ.get('wsgi.input').read()
            if check_raw_request(raw_data, client_ip):
                response = jsonify({"error": "Access denied"})
                return response(environ, start_response)
            # Reset input stream
            environ['wsgi.input'] = io.BytesIO(raw_data)
        except Exception as e:
            logging.error(f"Error processing request from {client_ip}: {e}")
            BANNED_IPS.add(client_ip)
            save_banned_ips()
            response = jsonify({"error": "Access denied"})
            return response(environ, start_response)

        return self.app(environ, start_response)

# Apply the middleware
app.wsgi_app = MaliciousRequestMiddleware(app.wsgi_app)

# Add this after the app initialization but before the routes
@app.before_request
def check_malicious_requests():
    # load banned ips
    load_banned_ips()
    logging.info(f"Banned IPs: {BANNED_IPS}")

    # if ip is banned, return 403
    if request.remote_addr in BANNED_IPS:
        return jsonify({"error": "Access denied"}), 403

    # Get the raw request data
    raw_data = request.get_data()
    
    # Check request against malicious patterns
    for pattern in MALICIOUS_PATTERNS:
        if pattern in raw_data:
            # Log the blocked request
            logging.warning(f"Blocked malicious request from {request.remote_addr} matching pattern: {pattern}")
            # Add the IP to banned list
            BANNED_IPS.add(request.remote_addr)
            # Save the updated banned IPs list
            save_banned_ips()
            return jsonify({"error": "Access denied"}), 403
    
    # Check if the request headers contain suspicious patterns
    headers_str = str(request.headers).lower()
    suspicious_headers = [
        'sqlmap',
        'acunetix',
        'nikto',
        'nmap',
        'masscan',
        'zmeu',
        'dirbuster',
        'gobuster',
        'burp'
    ]
    
    for header in suspicious_headers:
        if header in headers_str:
            logging.warning(f"Blocked suspicious request from {request.remote_addr} with header: {header}")
            BANNED_IPS.add(request.remote_addr)
            save_banned_ips()
            return jsonify({"error": "Access denied"}), 403

def generate_csrf_token():
    return secrets.token_hex(32)

def verify_csrf_token(token):
    if not token:
        return False
    # In a real application, you would store the token in a session
    # and verify it against the stored value. For simplicity, we'll
    # just check if it's a valid hex string of the right length
    return len(token) == 64 and all(c in '0123456789abcdef' for c in token)

@app.route('/get_csrf_token')
def get_csrf_token():
    token = generate_csrf_token()
    return jsonify({'csrf_token': token})

@app.before_request
def check_csrf():
    # Skip CSRF check for GET requests and static files
    if request.method == 'GET' or request.path.startswith('/static/'):
        return
    
    # Skip CSRF check for getting the token itself
    if request.path == '/get_csrf_token':
        return
        
    # Get CSRF token from header
    csrf_token = request.headers.get('X-CSRF-Token')
    
    if not verify_csrf_token(csrf_token):
        return jsonify({'error': 'Invalid CSRF token'}), 403

@app.route('/get_formats', methods=['POST'])
def get_formats():
    url = request.json.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400

    try:
        # Configure yt-dlp to get format information
        ytdl = yt_dlp.YoutubeDL({
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "listformats": True,
            "noplaylist": True,
            "lazy_playlist": False,
            "playlist_items": "1",
            "nocheckcertificate": True,
            "cookiefile": ".cookies",
            "color": "never",
        })

        # Get format information
        info = ytdl.extract_info(url, download=False)
        
        if not info or 'formats' not in info:
            return jsonify({"error": "No formats found"}), 400

        # Extract valid format combinations
        video_combinations = []
        audio_combinations = []

        for f in info['formats']:
            # Skip formats without video or audio
            if not f.get('vcodec') and not f.get('acodec'):
                continue

            # Handle video formats
            if f.get('vcodec') and f.get('vcodec') != 'none':
                height = f.get('height', 0)
                if height:
                    # Keep the full codec name and add format_id
                    vcodec = f.get('vcodec', '')
                    video_combinations.append({
                        'format': f.get('ext', ''),
                        'codec': vcodec,
                        'height': height,
                        'format_id': f.get('format_id'),
                        'filesize': f.get('filesize', 0)
                    })

            # Handle audio formats
            if f.get('acodec') and f.get('acodec') != 'none':
                # Keep the full codec name and add format_id
                acodec = f.get('acodec', '')
                audio_combinations.append({
                    'format': f.get('ext', ''),
                    'codec': acodec,
                    'format_id': f.get('format_id'),
                    'filesize': f.get('filesize', 0)
                })

        # Remove duplicates and sort
        video_combinations = [dict(t) for t in {tuple(d.items()) for d in video_combinations}]
        audio_combinations = [dict(t) for t in {tuple(d.items()) for d in audio_combinations}]

        # Sort video combinations by height in descending order
        video_combinations.sort(key=lambda x: x['height'], reverse=True)

        # Log the combinations we're returning
        print("\nReturning video combinations:")
        for combo in video_combinations:
            print(f"  {combo}")
        print("\nReturning audio combinations:")
        for combo in audio_combinations:
            print(f"  {combo}")

        return jsonify({
            'video_combinations': video_combinations,
            'audio_combinations': audio_combinations
        })

    except Exception as e:
        logging.error(f"Error getting formats: {e}")
        return jsonify({"error": str(e)}), 500


# Serve the main index.html
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/download/')
def serve_download():
    return send_from_directory(f"{app.static_folder}/download", 'index.html')

@app.route('/tempo-pitch-calc/')
def serve_tempo_pitch_calc():
    return send_from_directory(f"{app.static_folder}/tempo-pitch-calc", 'index.html')

@app.errorhandler(404)
def page_not_found(e):
    return send_from_directory(f"{app.static_folder}/404", 'index.html')

if __name__ == '__main__':
    load_banned_ips()
    # Add timeout configuration
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max-length
    # Use threaded mode for better handling of downloads
    app.run(host='0.0.0.0', port=9019, threaded=True)


