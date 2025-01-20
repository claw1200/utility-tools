from flask import Flask, jsonify, request, send_file, send_from_directory
import asyncio
import yt_dlp
from functools import partial
import os
import logging
from datetime import datetime, timedelta
from collections import defaultdict
import logging

app = Flask(__name__, static_folder='public', static_url_path='')
# turn on debug
app.debug = False
log = logging.getLogger('werkzeug')
log.setLevel(logging.DEBUG)

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
    filename='bans.log',
    level=logging.INFO,
    format='%(asctime)s - %(message)s'
)

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

async def download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format, strict_formats):
    if strict_formats == "true":
        strict_formats = True
    else:
        strict_formats = False
    # Configure yt-dlp options
    ytdl_options = {
        "format": "best",
        "outtmpl": "temp/%(uploader)s - %(title).150B.%(ext)s",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "lazy_playlist": False,
        "playlist_items" : "1",
        "noprogress": True,
        "nocheckcertificate": True,
        "cookiefile": ".cookies",
        "color": "never",
        "postprocessors": [{
            "key": "FFmpegMetadata"
        }],
    }

    filesize_limit = "100M" # as this applies to both audio and video, max file size is theoretically 200M

    non_strict_video = f"bestvideo[filesize<={filesize_limit}][height<={video_quality}]+bestaudio/bestvideo[filesize<={filesize_limit}]+bestaudio/best[filesize<={filesize_limit}]"
    non_strict_audio = f"bestaudio/best[filesize<={filesize_limit}]"

    # default options
    if video_quality == "auto":
        video_quality = "360"
    if audio_format == "auto":
        audio_format = "mp3"
    if video_format == "auto":
        video_format = "mp4"

    if download_mode == "audio":
        download_setting_string = f"""
        bestaudio[ext={audio_format}]/
        """
        if strict_formats == False:
            #append non-strict formats
            download_setting_string += non_strict_audio

    if download_mode == "auto":
        download_setting_string = f"""
        bestvideo[filesize<={filesize_limit}][height<={video_quality}][ext={video_format}]+bestaudio/
        """
        if strict_formats == False:
            #append non-strict formats
            download_setting_string += non_strict_video

    ytdl_options["format"] = download_setting_string

    ytdl = yt_dlp.YoutubeDL(ytdl_options)

    # Run blocking operations in thread pool
    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(
            None,
            partial(ytdl.extract_info, url, download=True),
        )

    except yt_dlp.DownloadError as e:
        return jsonify({
            "error": str(e)
        })

    if "entries" in info:
        filepath = ytdl.prepare_filename(info["entries"][0])
    else:
        filepath = ytdl.prepare_filename(info)
    filename = os.path.basename(filepath)

    output = jsonify({
        "filepath": filepath,
        "filename": filename,
        "error": "none"
    })

    return output

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
    video_quality = request.json.get('video_quality')
    video_format = request.json.get('video_format')
    audio_format = request.json.get('audio_format')
    strict_formats = request.json.get('strict_formats')

    print(f"Request as follows:\nURL: {url}\nDownload Mode: {download_mode}\nVideo Quality: {video_quality}\nVideo Format: {video_format}\nAudio Format: {audio_format}\nStrict Formats: {strict_formats}")

    try:
        # Get the download information
        response = asyncio.run(download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format, strict_formats))
        
        if response.json['error'] != "none":
            return jsonify({"error": response.json['error']}), 400

        file_location = response.json['filepath']
        filename = response.json['filename']

        # Stream the file
        def generate():
            with open(file_location, 'rb') as f:
                while True:
                    chunk = f.read(8192)  # 8KB chunks
                    if not chunk:
                        break
                    yield chunk
            # Delete file after streaming is complete
            os.remove(file_location)
            print(f"File deleted: {file_location}")

        response = app.response_class(
            generate(),
            mimetype='application/octet-stream'
        )
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        response.headers['Content-Length'] = os.path.getsize(file_location)
        
        return response

    except Exception as e:
        logging.error(f"Error during download: {e}")
        return jsonify({"error": "An error occurred during the download process"}), 500

def save_banned_ips():
    with open('banned_ips.txt', 'w') as f:
        f.write('\n'.join(BANNED_IPS))

def load_banned_ips():
    try:
        with open('banned_ips.txt', 'r') as f:
            BANNED_IPS.update(f.read().splitlines())
    except FileNotFoundError:
        pass

# Serve the main index.html
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/download')
def serve_download():
    return send_from_directory(f"{app.static_folder}/download", 'index.html')

@app.route('/tempo-pitch-calc')
def serve_tempo_pitch_calc():
    return send_from_directory(f"{app.static_folder}/tempo-pitch-calc", 'index.html')

# Add new route for download-specific static files
@app.route('/download/<path:filename>')
def download_static(filename):
    return send_from_directory(f"{app.static_folder}/download", filename)

if __name__ == '__main__':
    load_banned_ips()
    # Add timeout configuration
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
    app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB max-length
    # Use threaded mode for better handling of downloads
    app.run(host='0.0.0.0', port=9000, threaded=True)


