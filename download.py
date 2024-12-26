from flask import Flask, jsonify, request, send_file
import asyncio
import yt_dlp
from functools import partial
import os
import logging

app = Flask(__name__)

# make flask quiet
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

async def download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format, strict_formats):
    if strict_formats == "true":
        strict_formats = True
    else:
        strict_formats = False
    # Configure yt-dlp options
    ytdl_options = {
        "format": "best",
        "outtmpl": "temp/%(uploader)s - %(title)s.%(ext)s",
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


@app.route('/download_python')
def download_python():
    logging.info("Received download request")
    url = request.args.get('url')
    download_mode = request.args.get('download_mode')
    video_quality = request.args.get('video_quality')
    video_format = request.args.get('video_format')
    audio_format = request.args.get('audio_format')
    strict_formats = request.args.get('strict_formats')

    print (f"Request as follows:\nURL: {url}\nDownload Mode: {download_mode}\nVideo Quality: {video_quality}\nVideo Format: {video_format}\nAudio Format: {audio_format}\nStrict Formats: {strict_formats}")

    response = asyncio.run(download_media_ytdlp(url, download_mode, video_quality, video_format, audio_format, strict_formats))

    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)


