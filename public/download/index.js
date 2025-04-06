// Add CSRF token handling
let csrfToken = null;

async function fetchCSRFToken() {
    try {
        const response = await fetch('/get_csrf_token');
        const data = await response.json();
        csrfToken = data.csrf_token;
    } catch (error) {
        console.error('Error fetching CSRF token:', error);
    }
}

function download() {
    const url = document.getElementById('url-input-box').value;
    const download_mode = document.getElementById('download-mode').value;
    const video_quality = document.getElementById('video-quality').value;
    const video_format = document.getElementById('video-format').value;
    const audio_format = document.getElementById('audio-format').value;
    const strict_formats = document.getElementById('strict-formats').value;
    const download_button = document.getElementById('download-button');
    const error_message = document.getElementById('error-message');

    // hide error message
    error_message.style.display = 'none';

    // URL validation
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlRegex.test(url)) {
        error_display('Please enter a valid URL');
        download_button.disabled = false;
        download_button.innerText = 'download';
        download_button.style.cursor = 'pointer';
        download_button.style.pointerEvents = 'auto';
        return;
    }

    download_button.disabled = true;
    download_button.innerText = 'download starting';
    download_button.style.cursor = 'not-allowed';
    download_button.style.pointerEvents = 'none';

    fetch('/download_node', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
            url: url,
            download_mode: download_mode,
            video_quality: video_quality,
            video_format: video_format,
            audio_format: audio_format,
            strict_formats: strict_formats,
        }),
    })
    .then(async (response) => {
        if (response.status == 429) {
            error_display('slow it down buddy, and try again in a moment 🥶');
            return;
        }

        if (response.status == 400) {
            error_display('failed to find a file matching the given criteria 🤔\ntry changing your settings or disable strict formats');
            return;
        }

        else if (response.status != 200) {
            throw new Error('Failed to fetch');
        }

        // Get filename from the Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = contentDisposition ? contentDisposition.split('=')[1] : 'downloaded_file';
        // decode filename to support special characters
        filename = decodeURIComponent(filename);

        console.log(`Downloading file: ${filename}`);

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
                            const progress_percentage = ((downloaded / total_size) * 100).toFixed(0);
                            //console.log(`Progress: ${progress_percentage}%`);
                            // Update progress bar
                            progress.style.display = 'block';
                            progress.style.width = `${progress_percentage}%`;

                            // Disable the download button
                            download_button.disabled = true;
                            download_button.style.cursor = 'not-allowed';
                            download_button.innerText = `${progress_percentage}%`;
                            // disable the download button hover effect 
                            download_button.style.pointerEvents = 'none';
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
        download_button.style.cursor = 'pointer';
        download_button.style.pointerEvents = 'auto';
        // Change the download button text
        download_button.innerText = 'download';
    })
    .catch(error => {
        error_display("something went wrong (but idk what it is) 😱");
        console.error(error)
    });
}

function error_display(error_message_text) {
    const download_button = document.getElementById('download-button');

    // Enable the download button
    download_button.disabled = false;
    download_button.style.cursor = 'pointer';
    download_button.style.pointerEvents = 'auto';
    // Change the download button text
    download_button.innerText = 'download';

    // show error message
    const error_message = document.getElementById('error-message');
    error_message.innerText = error_message_text;
    error_message.style.display = 'block';

    // flash widget red for 1 second
    const widget = document.getElementsByClassName('widget')[0];
    widget.style.transition = 'background-color 0s';
    widget.style.backgroundColor = '#770000';
    setTimeout(() => {
        widget.style.transition = 'background-color 0.7s';
        widget.style.backgroundColor = '';
        
    }, 20);
    setTimeout(() => {
        widget.style.transition = '';
    }, 720);
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
    updateFormatSelectorsVisibility(e.target.value);
});


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
    document.body.classList.add('loaded');
}

// Add event listeners
document.getElementById('theme-select').addEventListener('change', theme_updated);

// wait for the DOM to load before running the function
document.addEventListener('DOMContentLoaded', function() {
    get_theme_cookie();
    document.body.classList.add('loaded');
    
    // Set initial visibility based on default download mode
    const defaultDownloadMode = document.getElementById('download-mode').value;
    updateFormatSelectorsVisibility(defaultDownloadMode);
    
    // Fetch CSRF token
    fetchCSRFToken();
});

// window.addEventListener('pageshow', function(event) {
//     if (event.persisted) {
//         window.location.reload();
//     }
// }
// );

// Add debounce mechanism
let lastFormatRequestTime = 0;
const FORMAT_REQUEST_INTERVAL = 1000; // only lower this if you wanna get rate limited by the server lol

function updateFormats(url) {
    if (!url) return;

    // URL validation
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlRegex.test(url)) {
        return;
    }

    // Check if enough time has passed since last request
    const now = Date.now();
    if (now - lastFormatRequestTime < FORMAT_REQUEST_INTERVAL) {
        return;
    }
    lastFormatRequestTime = now;

    // Show loading state in download button
    const download_button = document.getElementById('download-button');
    download_button.disabled = true;
    download_button.style.cursor = 'not-allowed';
    download_button.style.pointerEvents = 'none';
    download_button.innerText = 'checking url';

    fetch('/get_formats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ url: url }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch formats');
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }

        // Check if we need to switch modes based on available formats
        const downloadMode = document.getElementById('download-mode');
        if (data.video_formats.length === 0 && downloadMode.value === 'auto') {
            // Switch to audio mode if no video formats available
            downloadMode.value = 'audio';
            updateFormatSelectorsVisibility('audio');
        } else if (data.audio_formats.length === 0 && downloadMode.value === 'audio') {
            // Switch to video mode if no audio formats available
            downloadMode.value = 'auto';
            updateFormatSelectorsVisibility('auto');
        }

        // Update video format options
        const videoFormatSelect = document.getElementById('video-format');
        const currentVideoFormat = videoFormatSelect.value;
        videoFormatSelect.innerHTML = '';
        
        data.video_formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format;
            if (format === currentVideoFormat) {
                option.selected = true;
            }
            videoFormatSelect.appendChild(option);
        });

        // Update audio format options
        const audioFormatSelect = document.getElementById('audio-format');
        const currentAudioFormat = audioFormatSelect.value;
        audioFormatSelect.innerHTML = '';
        
        data.audio_formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format;
            if (format === currentAudioFormat) {
                option.selected = true;
            }
            audioFormatSelect.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error fetching formats:', error);
        error_display('failed to fetch formats for this link. try a different one?');
    })
    .finally(() => {
        // Reset download button state
        download_button.disabled = false;
        download_button.style.cursor = 'pointer';
        download_button.style.pointerEvents = 'auto';
        download_button.innerText = 'download';
    });
}

// Add event listener for URL input changes
document.getElementById('url-input-box').addEventListener('input', function(e) {
    const url = e.target.value.trim();
    if (url) {
        updateFormats(url);
    }
});

function updateFormatSelectorsVisibility(downloadMode) {
    const videoQuality = document.getElementById('video-quality');
    const videoFormat = document.getElementById('video-format');
    const audioFormat = document.getElementById('audio-format');
    const videoQualityContainer = videoQuality.closest('.extra-input');
    const videoFormatContainer = videoFormat.closest('.extra-input');
    const audioFormatContainer = audioFormat.closest('.extra-input');

    if (downloadMode === 'auto') {
        // Show video options
        videoQualityContainer.style.display = 'block';
        videoFormatContainer.style.display = 'block';
        audioFormatContainer.style.display = 'none';
        
        // Enable/disable video options
        videoQuality.disabled = false;
        videoQuality.style.filter = 'none';
        videoFormat.disabled = false;
        videoFormat.style.filter = 'none';
        audioFormat.disabled = true;
        audioFormat.style.filter = 'grayscale(1)';
    } else {
        // Show audio options
        videoQualityContainer.style.display = 'none';
        videoFormatContainer.style.display = 'none';
        audioFormatContainer.style.display = 'block';
        
        // Enable/disable audio options
        videoQuality.disabled = true;
        videoQuality.style.filter = 'grayscale(1)';
        videoFormat.disabled = true;
        videoFormat.style.filter = 'grayscale(1)';
        audioFormat.disabled = false;
        audioFormat.style.filter = 'none';
    }
}