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
    const video_codec = document.getElementById('video-codec').value;
    const audio_format = document.getElementById('audio-format').value;
    const audio_codec = document.getElementById('audio-codec').value;
    const download_button = document.getElementById('download-button');
    const error_message = document.getElementById('error-message');

    // hide error message
    error_message.style.display = 'none';

    // URL validation
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*(\?[\w=&-]*)?$/;
    if (!urlRegex.test(url)) {
        error_display('Please enter a valid URL');
        download_button.disabled = false;
        download_button.innerText = 'download';
        download_button.style.cursor = 'pointer';
        download_button.style.pointerEvents = 'auto';
        return;
    }

    // Get the selected format_id based on the current selections
    let format_id = null;
    if (download_mode === 'audio') {
        const audioCombinations = window.currentAudioCombinations || [];
        const selectedAudio = audioCombinations.find(combo => 
            combo.format === audio_format && 
            combo.codec === audio_codec
        );
        if (selectedAudio) {
            format_id = selectedAudio.format_id;
        }
    } else {
        const videoCombinations = window.currentVideoCombinations || [];
        const audioCombinations = window.currentAudioCombinations || [];
        
        // Find the selected video format
        const selectedVideo = videoCombinations.find(combo => 
            combo.height === parseInt(video_quality) && 
            combo.format === video_format && 
            combo.codec === video_codec
        );
        
        // Find the selected audio format
        const selectedAudio = audioCombinations.find(combo => 
            combo.format === audio_format && 
            combo.codec === audio_codec
        );

        if (selectedVideo) {
            if (selectedAudio) {
                // Combine video and audio format IDs
                format_id = `${selectedVideo.format_id}+${selectedAudio.format_id}`;
            } else {
                // Use just the video format if no audio selected
                format_id = selectedVideo.format_id;
            }
        }
    }

    if (!format_id) {
        error_display('Could not find matching format. Please try again.');
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
            format_id: format_id
        }),
    })
    .then(async (response) => {
        if (response.status == 429) {
            error_display('slow it down buddy, and try again in a moment 🥶');
            return;
        }

        if (response.status == 400) {
            error_display('failed to find a file matching the given criteria 🤔');
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
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*(\?[\w=&-]*)?$/;
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

        // Reset all selectors first
        const videoQualitySelect = document.getElementById('video-quality');
        const videoFormatSelect = document.getElementById('video-format');
        const videoCodecSelect = document.getElementById('video-codec');
        const audioFormatSelect = document.getElementById('audio-format');
        const audioCodecSelect = document.getElementById('audio-codec');

        videoQualitySelect.innerHTML = '';
        videoFormatSelect.innerHTML = '';
        videoCodecSelect.innerHTML = '';
        audioFormatSelect.innerHTML = '';
        audioCodecSelect.innerHTML = '';

        // Check if we need to switch modes based on available formats
        const downloadMode = document.getElementById('download-mode');
        if (data.video_combinations.length === 0 && data.audio_combinations.length > 0) {
            // Switch to audio mode if no video formats available but audio exists
            downloadMode.value = 'audio';
            updateFormatSelectorsVisibility('audio');
        } else if (data.audio_combinations.length === 0 && data.video_combinations.length > 0) {
            // Switch to video mode if no audio formats available but video exists
            downloadMode.value = 'auto';
            updateFormatSelectorsVisibility('auto');
        } else if (data.video_combinations.length === 0 && data.audio_combinations.length === 0) {
            // No formats available at all
            throw new Error('No formats available for this URL');
        }

        // Update video quality options if we have video formats
        if (data.video_combinations.length > 0) {
            // Update video format and codec options based on selected quality
            updateVideoOptions(data.video_combinations, videoQualitySelect.value);
        }

        // Update audio format and codec options if we have audio formats
        if (data.audio_combinations.length > 0) {
            updateAudioOptions(data.audio_combinations);
        }
    })
    .catch(error => {
        console.error('Error fetching formats:', error);
        error_display('failed to fetch formats for this link. try a different one?');
        
        // Reset all selectors on error
        const videoQualitySelect = document.getElementById('video-quality');
        const videoFormatSelect = document.getElementById('video-format');
        const videoCodecSelect = document.getElementById('video-codec');
        const audioFormatSelect = document.getElementById('audio-format');
        const audioCodecSelect = document.getElementById('audio-codec');

        videoQualitySelect.innerHTML = '';
        videoFormatSelect.innerHTML = '';
        videoCodecSelect.innerHTML = '';
        audioFormatSelect.innerHTML = '';
        audioCodecSelect.innerHTML = '';
    })
    .finally(() => {
        // Reset download button state
        download_button.disabled = false;
        download_button.style.cursor = 'pointer';
        download_button.style.pointerEvents = 'auto';
        download_button.innerText = 'download';
    });
}

function updateVideoOptions(combinations, selectedQuality) {
    // Store the current combinations for later use
    window.currentVideoCombinations = combinations;
    
    const videoFormatSelect = document.getElementById('video-format');
    const videoCodecSelect = document.getElementById('video-codec');
    const videoQualitySelect = document.getElementById('video-quality');
    const currentFormat = videoFormatSelect.value;
    const currentCodec = videoCodecSelect.value;

    // Get unique resolutions from combinations
    const resolutions = new Set(combinations.map(combo => combo.height));
    
    // Update resolution options
    videoQualitySelect.innerHTML = '';
    Array.from(resolutions).sort((a, b) => b - a).forEach(resolution => {
        const option = document.createElement('option');
        option.value = resolution;
        option.textContent = `${resolution}p`;
        if (resolution.toString() === selectedQuality) {
            option.selected = true;
        }
        videoQualitySelect.appendChild(option);
    });

    // Update format options based on selected resolution
    function updateFormatOptions() {
        const selectedResolution = parseInt(videoQualitySelect.value);
        
        // Filter combinations for selected resolution
        const validCombinations = combinations.filter(combo => combo.height === selectedResolution);
        
        // Get unique formats for this resolution
        const validFormats = new Set(validCombinations.map(combo => combo.format));
        
        videoFormatSelect.innerHTML = '';
        validFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format;
            option.textContent = format;
            if (format === currentFormat) {
                option.selected = true;
            }
            videoFormatSelect.appendChild(option);
        });

        // Update codec options based on selected format
        updateCodecOptions();
    }

    // Update codec options based on selected format
    function updateCodecOptions() {
        const selectedResolution = parseInt(videoQualitySelect.value);
        const selectedFormat = videoFormatSelect.value;
        
        // Filter combinations for selected resolution and format
        const validCombinations = combinations.filter(combo => 
            combo.height === selectedResolution && 
            combo.format === selectedFormat
        );
        
        // Get unique codecs for this resolution and format
        const validCodecs = new Set(validCombinations.map(combo => combo.codec));
        
        videoCodecSelect.innerHTML = '';
        validCodecs.forEach(codec => {
            const option = document.createElement('option');
            option.value = codec;
            option.textContent = codec;
            if (codec === currentCodec) {
                option.selected = true;
            }
            videoCodecSelect.appendChild(option);
        });
    }

    // Initial format update
    updateFormatOptions();

    // Add event listeners
    videoQualitySelect.addEventListener('change', updateFormatOptions);
    videoFormatSelect.addEventListener('change', updateCodecOptions);
}

function updateAudioOptions(combinations) {
    // Store the current combinations for later use
    window.currentAudioCombinations = combinations;
    
    const audioFormatSelect = document.getElementById('audio-format');
    const audioCodecSelect = document.getElementById('audio-codec');
    const currentFormat = audioFormatSelect.value;
    const currentCodec = audioCodecSelect.value;

    // Get unique formats and codecs
    const validFormats = new Set();
    const validCodecs = new Set();
    const formatCodecMap = new Map();

    combinations.forEach(combo => {
        validFormats.add(combo.format);
        validCodecs.add(combo.codec);
        if (!formatCodecMap.has(combo.format)) {
            formatCodecMap.set(combo.format, new Set());
        }
        formatCodecMap.get(combo.format).add(combo.codec);
    });

    // Update format options
    audioFormatSelect.innerHTML = '';
    validFormats.forEach(format => {
        const option = document.createElement('option');
        option.value = format;
        option.textContent = format;
        if (format === currentFormat) {
            option.selected = true;
        }
        audioFormatSelect.appendChild(option);
    });

    // Update codec options based on selected format
    function updateCodecOptions() {
        const selectedFormat = audioFormatSelect.value;
        const validCodecsForFormat = formatCodecMap.get(selectedFormat) || new Set();
        
        audioCodecSelect.innerHTML = '';
        validCodecsForFormat.forEach(codec => {
            const option = document.createElement('option');
            option.value = codec;
            option.textContent = codec;
            if (codec === currentCodec) {
                option.selected = true;
            }
            audioCodecSelect.appendChild(option);
        });
    }

    // Initial codec update
    updateCodecOptions();

    // Add event listener for format changes
    audioFormatSelect.addEventListener('change', updateCodecOptions);
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
    const videoCodec = document.getElementById('video-codec');
    const audioFormat = document.getElementById('audio-format');
    const audioCodec = document.getElementById('audio-codec');
    const videoQualityContainer = videoQuality.closest('.extra-input');
    const videoFormatContainer = videoFormat.closest('.extra-input');
    const videoCodecContainer = videoCodec.closest('.extra-input');
    const audioFormatContainer = audioFormat.closest('.extra-input');
    const audioCodecContainer = audioCodec.closest('.extra-input');

    if (downloadMode === 'auto') {
        // Show both video and audio options
        videoQualityContainer.style.display = 'block';
        videoFormatContainer.style.display = 'block';
        videoCodecContainer.style.display = 'block';
        audioFormatContainer.style.display = 'block';
        audioCodecContainer.style.display = 'block';
        
        // Enable/disable options
        videoQuality.disabled = false;
        videoQuality.style.filter = 'none';
        videoFormat.disabled = false;
        videoFormat.style.filter = 'none';
        videoCodec.disabled = false;
        videoCodec.style.filter = 'none';
        audioFormat.disabled = false;
        audioFormat.style.filter = 'none';
        audioCodec.disabled = false;
        audioCodec.style.filter = 'none';
    } else {
        // Show only audio options
        videoQualityContainer.style.display = 'none';
        videoFormatContainer.style.display = 'none';
        videoCodecContainer.style.display = 'none';
        audioFormatContainer.style.display = 'block';
        audioCodecContainer.style.display = 'block';
        
        // Enable/disable options
        videoQuality.disabled = true;
        videoQuality.style.filter = 'grayscale(1)';
        videoFormat.disabled = true;
        videoFormat.style.filter = 'grayscale(1)';
        videoCodec.disabled = true;
        videoCodec.style.filter = 'grayscale(1)';
        audioFormat.disabled = false;
        audioFormat.style.filter = 'none';
        audioCodec.disabled = false;
        audioCodec.style.filter = 'none';
    }
}