function download() {
    const url = document.getElementById('url-input-box').value;
    const download_mode = document.getElementById('download-mode').value;
    const video_quality = document.getElementById('video-quality').value;
    const audio_format = document.getElementById('audio-format').value;

    const download_button = document.getElementById('download-button');

    download_button.disabled = true;
    download_button.innerText = 'Downloading...';

    fetch('/download_node', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: url,
            download_mode: download_mode,
            video_quality: video_quality,
            audio_format: audio_format,
        }),
    })
    .then(async (response) => {
        if (!response.ok) {
            throw new Error('Failed to download file');
        }

        // Get filename from the Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition ? contentDisposition.split('=')[1] : 'downloaded_file';

        // Get total file size from the Content-Length header
        const contentLength = response.headers.get('Content-Length');
        if (!contentLength) {
            console.warn('Content-Length header is missing');
        }
        const total_size = contentLength ? parseInt(contentLength, 10) : 0;
        let downloaded = 0;

        // select the progress bar element
        const progress = document.getElementById('progress');

        // select the download button
        const download_button = document.getElementById('download-button');


        const reader = response.body.getReader();
        const stream = new ReadableStream({
            start(controller) {
                function push() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close();
                            //console.log('Download complete.');
                            return;
                        }

                        downloaded += value.length;
                        if (total_size) {
                            const progress_percentage = ((downloaded / total_size) * 100).toFixed(2);
                            console.log(`Progress: ${progress_percentage}%`);
                            // Update progress bar
                            progress.style.display = 'block';
                            progress.style.width = `${progress_percentage}%`;

                            // Disable the download button
                            download_button.disabled = true;
                            // Change the download button text
                            download_button.innerText = 'Downloading...';

                        }

                        controller.enqueue(value);
                        push();
                    }).catch((error) => {
                        console.error('Stream error:', error);
                        controller.error(error);
                    });
                }
                push();
            },
        });

        // Convert the stream into a blob
        const responseBlob = await new Response(stream).blob();

        // Create a download link and trigger it
        const downloadUrl = window.URL.createObjectURL(responseBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Remove the progress bar after download is complete
        progress.style.display = 'none';

        // Enable the download button
        download_button.disabled = false;
        // Change the download button text
        download_button.innerText = 'Download';
    })
    .catch(error => {
        console.error('Error:', error);
    });
}


function toggleMenu() {
    const settingsPanel = document.querySelector('.settings-panel');
    settingsPanel.classList.toggle('open');
}

// Add event listener for theme change
document.getElementById('theme-select').addEventListener('change', function(e) {
    document.body.className = e.target.value + '-theme';
});

document.querySelector('.menu-icon').addEventListener('click', function() {
    this.classList.toggle('active');
});

// Add event listener for download type selction change
document.getElementById('download-mode').addEventListener('change', function(e) {
    const videoQuality = document.getElementById('video-quality');
    const audioFormat = document.getElementById('audio-format');
    if (e.target.value === 'auto') {
        videoQuality.disabled = false;
        audioFormat.disabled = true;
    }
    else {
        videoQuality.disabled = true;
        audioFormat.disabled = false;
    }
}
);


function get_theme_cookie() {
    // set theme based on cookie
    const theme = localStorage.getItem('theme');
    if (theme) {
        document.body.className = theme + '-theme';
        document.getElementById('theme-select').value = theme;
    }
}

function theme_updated() {
    // called when theme is updated
    const theme = document.getElementById('theme-select').value;
    localStorage.setItem('theme', theme);
}

// Add event listeners
document.getElementById('theme-select').addEventListener('change', theme_updated);

// wait for the DOM to load before running the function
document.addEventListener('DOMContentLoaded', function() {
    get_theme_cookie();
    const videoQuality = document.getElementById('video-quality');
    const audioFormat = document.getElementById('audio-format');
    audioFormat.disabled = true;
    videoQuality.disabled = false;


});
