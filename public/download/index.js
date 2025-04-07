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

// Helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateDownloadButton(state, text = null, fileSize = null) {
    const download_button = document.getElementById('download-button');
    download_button.disabled = state === 'disabled';
    download_button.style.cursor = state === 'disabled' ? 'not-allowed' : 'pointer';
    download_button.style.pointerEvents = state === 'disabled' ? 'none' : 'auto';
    
    if (fileSize) {
        download_button.innerText = `${text || 'download'} (${formatFileSize(fileSize)})`;
    } else {
        download_button.innerText = text || (state === 'disabled' ? 'download starting' : 'download');
    }
}

function updateProgressBar(progress_percentage) {
    const progress = document.getElementById('progress');
    progress.style.display = 'block';
    progress.style.width = `${progress_percentage}%`;
    updateDownloadButton('disabled', `${progress_percentage}%`);
}

function getFormatId(download_mode, settings) {
    if (download_mode === 'audio') {
        const audioCombinations = window.currentAudioCombinations || [];
        const selectedAudio = audioCombinations.find(combo => 
            combo.format === settings.audio_format && 
            combo.codec === settings.audio_codec
        );
        return selectedAudio?.format_id;
    }

    const videoCombinations = window.currentVideoCombinations || [];
    const audioCombinations = window.currentAudioCombinations || [];
    
    const selectedVideo = videoCombinations.find(combo => 
        combo.height === parseInt(settings.video_quality) && 
        combo.format === settings.video_format && 
        combo.codec === settings.video_codec
    );
    
    const selectedAudio = audioCombinations.find(combo => 
        combo.format === settings.audio_format && 
        combo.codec === settings.audio_codec
    );

    if (!selectedVideo) return null;
    return selectedAudio ? `${selectedVideo.format_id}+${selectedAudio.format_id}` : selectedVideo.format_id;
}

function download() {
    const settings = {
        url: document.getElementById('url-input-box').value,
        download_mode: document.getElementById('download-mode').value,
        video_quality: document.getElementById('video-quality').value,
        video_format: document.getElementById('video-format').value,
        video_codec: document.getElementById('video-codec').value,
        audio_format: document.getElementById('audio-format').value,
        audio_codec: document.getElementById('audio-codec').value
    };

    const error_message = document.getElementById('error-message');
    error_message.style.display = 'none';

    // URL validation
    const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*(\?[\w=&-]*)?$/;
    if (!urlRegex.test(settings.url)) {
        error_display('Please enter a valid URL');
        updateDownloadButton('enabled');
        return;
    }

    const format_id = getFormatId(settings.download_mode, settings);
    if (!format_id) {
        error_display('Could not find matching format. Please try again.');
        return;
    }

    updateDownloadButton('disabled');

    fetch('/download_node', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
            url: settings.url,
            download_mode: settings.download_mode,
            format_id: format_id
        }),
    })
    .then(async (response) => {
        if (response.status === 429) {
            error_display('slow it down buddy, and try again in a moment 🥶');
            return;
        }
        if (response.status === 400) {
            error_display('failed to find a file matching the given criteria 🤔');
            return;
        }
        if (response.status !== 200) {
            throw new Error('Failed to fetch');
        }

        // Get filename from the Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = contentDisposition ? contentDisposition.split('=')[1] : 'downloaded_file';
        filename = decodeURIComponent(filename);

        // Get total file size from the Content-Length header
        const contentLength = response.headers.get('Content-Length');
        const total_size = contentLength ? parseInt(contentLength, 10) : 0;
        let downloaded = 0;

        const progress = document.getElementById('progress');
        const reader = response.body.getReader();
        const stream = new ReadableStream({
            start(controller) {
                function push() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close();
                            return;
                        }

                        downloaded += value.length;
                        if (total_size) {
                            const progress_percentage = ((downloaded / total_size) * 100).toFixed(0);
                            updateProgressBar(progress_percentage);
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

        // Convert the stream into a blob and trigger download
        const responseBlob = await new Response(stream).blob();
        const downloadUrl = window.URL.createObjectURL(responseBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Reset UI
        progress.style.display = 'none';
        updateDownloadButton('enabled');
    })
    .catch(error => {
        console.error(error);
        error_display("something went wrong (but idk what it is) 😱");
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
            return response.json().then(data => {
                throw new Error(data.error || 'Failed to fetch formats');
            });
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
        const downloadModeSelect = document.getElementById('download-mode');
        if (data.video_combinations.length === 0 && data.audio_combinations.length > 0) {
            // Switch to audio mode if no video formats available but audio exists
            downloadModeSelect.value = 'audio';
            updateFormatSelectorsVisibility('audio');
            
            // Hide video option from download mode list
            const videoOption = downloadModeSelect.querySelector('option[value="auto"]');
            if (videoOption) {
                videoOption.style.display = 'none';
            }
        } else if (data.audio_combinations.length === 0 && data.video_combinations.length > 0) {
            // Switch to video mode if no audio formats available but video exists
            downloadModeSelect.value = 'auto';
            updateFormatSelectorsVisibility('auto');
            
            // Show video option if it was hidden
            const videoOption = downloadModeSelect.querySelector('option[value="auto"]');
            if (videoOption) {
                videoOption.style.display = '';
            }
        } else if (data.video_combinations.length === 0 && data.audio_combinations.length === 0) {
            // No formats available at all
            throw new Error('No formats available for this URL');
        } else {
            // Both formats available, ensure video option is visible
            const videoOption = downloadModeSelect.querySelector('option[value="auto"]');
            if (videoOption) {
                videoOption.style.display = '';
            }
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

        // Update download button with initial file size
        const currentMode = downloadModeSelect.value;
        if (currentMode === 'audio' && data.audio_combinations.length > 0) {
            const firstAudioCombo = data.audio_combinations[0];
            if (firstAudioCombo.filesize) {
                updateDownloadButton('enabled', 'download', firstAudioCombo.filesize);
            }
        } else if (data.video_combinations.length > 0) {
            const firstVideoCombo = data.video_combinations[0];
            if (firstVideoCombo.filesize) {
                updateDownloadButton('enabled', 'download', firstVideoCombo.filesize);
            }
        }
    })
    .catch(error => {
        console.error('Error fetching formats:', error);
        error_display(error.message);
        
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
        // Reset download button state if no file size was set
        const download_button = document.getElementById('download-button');
        if (download_button.innerText === 'checking url') {
            download_button.disabled = false;
            download_button.style.cursor = 'pointer';
            download_button.style.pointerEvents = 'auto';
            download_button.innerText = 'download';
        }
    });
}

function getTotalFileSize() {
    const downloadMode = document.getElementById('download-mode').value;
    
    if (downloadMode === 'audio') {
        // For audio mode, just return the audio size
        const audioFormat = document.getElementById('audio-format').value;
        const audioCodec = document.getElementById('audio-codec').value;
        
        const selectedAudio = window.currentAudioCombinations?.find(combo => 
            combo.format === audioFormat && 
            combo.codec === audioCodec
        );
        
        return selectedAudio?.filesize || 0;
    } else {
        // For video mode, add up video and audio sizes
        const videoQuality = parseInt(document.getElementById('video-quality').value);
        const videoFormat = document.getElementById('video-format').value;
        const videoCodec = document.getElementById('video-codec').value;
        const audioFormat = document.getElementById('audio-format').value;
        const audioCodec = document.getElementById('audio-codec').value;
        
        const selectedVideo = window.currentVideoCombinations?.find(combo => 
            combo.height === videoQuality && 
            combo.format === videoFormat && 
            combo.codec === videoCodec
        );
        
        const selectedAudio = window.currentAudioCombinations?.find(combo => 
            combo.format === audioFormat && 
            combo.codec === audioCodec
        );
        
        const videoSize = selectedVideo?.filesize || 0;
        const audioSize = selectedAudio?.filesize || 0;
        
        return videoSize + audioSize;
    }
}

function updateDownloadButtonWithSize() {
    const totalSize = getTotalFileSize();
    if (totalSize > 0) {
        updateDownloadButton('enabled', 'download', totalSize);
    } else {
        updateDownloadButton('enabled');
    }
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

        // Update total file size
        updateDownloadButtonWithSize();
    }

    // Add event listeners
    videoQualitySelect.addEventListener('change', updateFormatOptions);
    videoFormatSelect.addEventListener('change', updateCodecOptions);
    videoCodecSelect.addEventListener('change', updateDownloadButtonWithSize);

    // Initial update
    updateFormatOptions();
}

function updateAudioOptions(combinations) {
    // Store the current combinations for later use
    window.currentAudioCombinations = combinations;
    
    const audioFormatSelect = document.getElementById('audio-format');
    const audioCodecSelect = document.getElementById('audio-codec');
    const currentFormat = audioFormatSelect.value;
    const currentCodec = audioCodecSelect.value;

    // Get unique formats from combinations
    const validFormats = new Set(combinations.map(combo => combo.format));
    
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
        
        // Filter combinations for selected format
        const validCombinations = combinations.filter(combo => combo.format === selectedFormat);
        
        // Get unique codecs for this format
        const validCodecs = new Set(validCombinations.map(combo => combo.codec));
        
        audioCodecSelect.innerHTML = '';
        validCodecs.forEach(codec => {
            const option = document.createElement('option');
            option.value = codec;
            option.textContent = codec;
            if (codec === currentCodec) {
                option.selected = true;
            }
            audioCodecSelect.appendChild(option);
        });

        // Update total file size
        updateDownloadButtonWithSize();
    }

    // Add event listeners
    audioFormatSelect.addEventListener('change', updateCodecOptions);
    audioCodecSelect.addEventListener('change', updateDownloadButtonWithSize);

    // Initial update
    updateCodecOptions();
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

        // Update total file size
        updateDownloadButtonWithSize();
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

        // Update total file size
        updateDownloadButtonWithSize();
    }
}