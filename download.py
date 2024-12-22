from flask import Flask, jsonify, request, send_file
import asyncio
import yt_dlp
from functools import partial
import os
import logging

app = Flask(__name__)

async def download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format):
    # Configure yt-dlp options
    ytdl_options = {
        "format": "best",
        "outtmpl": "temp/%(uploader)s - %(title)s.%(ext)s",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "noprogress": True,
        "nocheckcertificate": True,
        "cookiefile": ".cookies",
        "color": "never",
    }

    # default options
    if video_quality == "auto":
        video_quality = "360"
    if audio_format == "auto":
        audio_format = "mp3"
    if video_format == "auto":
        video_format = "mp4"

    if download_mode == "audio":
        ytdl_options["format"] = f"""
        bestaudio[ext={audio_format}]/
        bestaudio[acodec=aac]/
        bestaudio/
        best
        """

    if download_mode == "auto":
        ytdl_options["format"] = f"""
        bestvideo[vcodec=h264][height<={video_quality}]+bestaudio[acodec={video_format}]/
        bestvideo[vcodec=h264][height<={video_quality}]+bestaudio/
        bestvideo[vcodec=vp9][ext=webm][height<={video_quality}]+bestaudio[ext=webm]/
        bestvideo[vcodec=vp9][ext=webm][height<={video_quality}]+bestaudio/
        bestvideo[height<={video_quality}]+bestaudio/
        bestvideo+bestaudio/
        best
        """

    ytdl = yt_dlp.YoutubeDL(ytdl_options)

    # Run blocking operations in thread pool
    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(
            None,
            partial(ytdl.extract_info, url, download=True),
        )

    except yt_dlp.DownloadError as e:
        raise Exception(f"Error: {e}")


    filepath = ytdl.prepare_filename(info)
    return filepath

@app.route('/download_python')
def download_python():
    logging.info("Received download request")
    url = request.args.get('url')
    download_mode = request.args.get('download_mode')
    video_quality = request.args.get('video_quality')
    video_format = request.args.get('video_format')
    audio_format = request.args.get('audio_format')

    filepath = asyncio.run(download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format))
    
    output = jsonify({
        "filepath": filepath,
        "filename": os.path.basename(filepath),
        
    })

    logging.info(f"Downloaded {url} to {filepath}")
    return output

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)


