python3 -m pip install yt-dlp --upgrade
python3 -m gunicorn -w 4 server:app --bind 0.0.0.0:3003 --config gunicorn_config.py