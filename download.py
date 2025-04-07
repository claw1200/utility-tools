import asyncio
import yt_dlp
from functools import partial
import os
import logging
from datetime import datetime
import json
import time
from urllib.parse import quote
from flask import jsonify, Response
from config import YTDL_CONFIG, SECURITY_CONFIG

# Global download progress tracking
download_progress = {}

async def download_media_ytdlp(url, download_mode, format_id=None):
    """Download media using yt-dlp"""
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

    ytdl_options = YTDL_CONFIG['DOWNLOAD_OPTIONS'].copy()
    ytdl_options['format'] = format_id
    ytdl_options['progress_hooks'] = [progress_hook]
    ytdl_options['postprocessors'] = [{'key': 'FFmpegMetadata'}]

    ytdl = yt_dlp.YoutubeDL(ytdl_options)

    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(
            None,
            partial(ytdl.extract_info, url, download=True),
        )

        if "entries" in info:
            filepath = ytdl.prepare_filename(info["entries"][0])
        else:
            filepath = ytdl.prepare_filename(info)
        filename = os.path.basename(filepath)

        return jsonify({
            "filepath": filepath,
            "filename": filename,
            "error": "none"
        }), download_id

    except yt_dlp.DownloadError as e:
        return jsonify({"error": str(e)}), download_id

def stream_progress(download_id):
    """Stream download progress to client"""
    def generate():
        while True:
            progress = download_progress.get(download_id, 0)
            data = json.dumps({"progress": progress})
            yield f"data: {data}\n\n"
            
            if progress >= 100:
                if download_id in download_progress:
                    del download_progress[download_id]
                break
                
            time.sleep(0.5)

    return Response(generate(), mimetype='text/event-stream')

def stream_file(file_location, filename):
    """Stream downloaded file to client"""
    def generate():
        buffer_size = 65536  # 64KB buffer
        
        try:
            with open(file_location, 'rb') as f:
                while True:
                    buffer = f.read(buffer_size)
                    if not buffer:
                        break
                    yield buffer
        finally:
            os.remove(file_location)
            logging.info(f"File deleted: {file_location}")

    response = Response(
        generate(),
        mimetype='application/octet-stream',
        direct_passthrough=True
    )
    
    filename = quote(filename)
    response.headers.set('Content-Disposition', f'attachment; filename={filename}')
    response.headers.set('Content-Length', str(os.path.getsize(file_location)))
    response.headers.set('Cache-Control', 'no-cache')
    response.headers.set('X-Accel-Buffering', 'no')
    
    return response

def get_formats(url):
    """Get available formats for a URL"""
    try:
        ytdl = yt_dlp.YoutubeDL(YTDL_CONFIG['DEFAULT_OPTIONS'])
        info = ytdl.extract_info(url, download=False)
        
        if not info or 'formats' not in info:
            return jsonify({"error": "No formats found"}), 400

        video_combinations = []
        audio_combinations = []

        for f in info['formats']:
            if not f.get('vcodec') and not f.get('acodec'):
                continue

            if f.get('filesize') and f.get('filesize') > SECURITY_CONFIG['MAX_DOWNLOAD_SIZE']:
                continue

            if f.get('vcodec') and f.get('vcodec') != 'none':
                height = f.get('height', 0)
                if height:
                    video_combinations.append({
                        'format': f.get('ext', ''),
                        'vcodec': f.get('vcodec', ''),
                        'height': height,
                        'format_id': f.get('format_id'),
                        'filesize': f.get('filesize', 0),
                        'acodec': f.get('acodec', 'none'),
                        'url': f.get('url', '')
                    })

            if f.get('acodec') and f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                audio_combinations.append({
                    'format': f.get('ext', ''),
                    'acodec': f.get('acodec', ''),
                    'vcodec': f.get('vcodec', 'none'),
                    'format_id': f.get('format_id'),
                    'filesize': f.get('filesize', 0),
                    'url': f.get('url', '')
                })

        video_combinations = [dict(t) for t in {tuple(d.items()) for d in video_combinations}]
        audio_combinations = [dict(t) for t in {tuple(d.items()) for d in audio_combinations}]
        video_combinations.sort(key=lambda x: x['height'], reverse=True)

        if not video_combinations and not audio_combinations:
            return jsonify({"error": "No valid formats found under the size limit"}), 400

        return jsonify({
            'video_combinations': video_combinations,
            'audio_combinations': audio_combinations
        })

    except Exception as e:
        logging.error(f"Error getting formats: {e}")
        return jsonify({"error": str(e)}), 500 