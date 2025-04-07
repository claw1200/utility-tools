document.addEventListener('DOMContentLoaded', () => {
    const audioFileInput = document.getElementById('audioFile');
    const analyzeButton = document.getElementById('analyzeButton');
    const canvas = document.getElementById('spectrumCanvas');
    const ctx = canvas.getContext('2d');
    let audioContext;
    let audioBuffer;
    let isAnalyzing = false;

    // Set up drag and drop
    function setupDragAndDrop() {
        const spectrumContainer = document.querySelector('.spectrum-container');
        const fileInput = document.getElementById('audioFile');

        // Click on spectrum container to trigger file input
        spectrumContainer.addEventListener('click', () => {
            if (!audioContext || !isAnalyzing) {
                fileInput.click();
            }
        });

        // Drag and drop events
        spectrumContainer.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (!isAnalyzing) {
                spectrumContainer.style.borderColor = 'var(--button-light)';
            }
        });

        spectrumContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        spectrumContainer.addEventListener('dragleave', () => {
            spectrumContainer.style.borderColor = '';
        });

        spectrumContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            spectrumContainer.style.borderColor = '';
            
            if (!isAnalyzing) {
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('audio/')) {
                    handleFileSelect(file);
                }
            }
        });

        // File input change event
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function updateFileDisplay(file, audioBuffer = null) {
        const fileNameElement = document.getElementById('file-name');
        const emptyState = document.getElementById('empty-state');
        const canvas = document.getElementById('spectrumCanvas');
        
        if (file) {
            fileNameElement.textContent = file.name;
            emptyState.style.display = 'none';
            canvas.classList.add('active');
            
            // Update metadata
            document.getElementById('format-value').textContent = file.type.split('/')[1].toUpperCase();
            
            if (audioBuffer) {
                document.getElementById('sample-rate-value').textContent = `${(audioBuffer.sampleRate / 1000).toFixed(1)} kHz`;
                document.getElementById('channels-value').textContent = audioBuffer.numberOfChannels;
                document.getElementById('duration-value').textContent = `${audioBuffer.duration.toFixed(1)}s`;
            } else {
                document.getElementById('sample-rate-value').textContent = '-';
                document.getElementById('channels-value').textContent = '-';
                document.getElementById('duration-value').textContent = '-';
            }
            
            // Calculate approximate bit rate if possible
            if (file.size && audioBuffer) {
                const bitRate = Math.round((file.size * 8) / audioBuffer.duration / 1000);
                document.getElementById('bit-rate-value').textContent = `${bitRate} kbps`;
            } else {
                document.getElementById('bit-rate-value').textContent = '-';
            }
        } else {
            fileNameElement.textContent = 'No file selected';
            emptyState.style.display = 'block';
            canvas.classList.remove('active');
            
            // Reset metadata
            document.getElementById('format-value').textContent = '-';
            document.getElementById('sample-rate-value').textContent = '-';
            document.getElementById('bit-rate-value').textContent = '-';
            document.getElementById('duration-value').textContent = '-';
            document.getElementById('channels-value').textContent = '-';
        }
    }

    async function handleFileSelect(file) {
        if (file && file.type.startsWith('audio/')) {
            updateFileDisplay(file);
            try {
                // Initialize audio context
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Read file as ArrayBuffer
                const arrayBuffer = await file.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Update display with audio buffer info
                updateFileDisplay(file, audioBuffer);
                
                // Start analysis immediately
                analyzeAudio();
            } catch (error) {
                console.error('Error loading audio file:', error);
                alert('Error loading audio file. Please try another file.');
                updateFileDisplay(null);
            }
        }
    }

    // Set canvas size with higher resolution
    function resizeCanvas() {
        const container = canvas.parentElement;
        const leftPadding = 40;
        const rightPadding = 80;
        const bottomPadding = 30;
        const topPadding = 25;
        
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        ctx.imageSmoothingEnabled = false;
        
        canvas.spectrumWidth = canvas.width - (leftPadding + rightPadding);
        canvas.spectrumHeight = canvas.height - (topPadding + bottomPadding);
        canvas.spectrumX = leftPadding;
        canvas.spectrumY = topPadding;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Move the analysis code to its own function
    async function analyzeAudio() {
        if (!audioBuffer || isAnalyzing) return;
        
        try {
            isAnalyzing = true;
            analyzeButton.disabled = true;
            analyzeButton.textContent = 'Analyzing...';
            
            // Clear canvas
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const fftSize = 4096; // Good balance of performance and quality
            const channelData = audioBuffer.getChannelData(0); // Use first channel
            
            // Calculate analysis parameters
            const overlap = 0.5; // 50% overlap
            const chunkSize = fftSize;
            const hopSize = Math.floor(chunkSize * (1 - overlap));
            const numChunks = Math.floor((channelData.length - chunkSize) / hopSize);
            
            // Create an off-screen canvas for double buffering
            const offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height);
            const offscreenCtx = offscreenCanvas.getContext('2d');
            offscreenCtx.fillStyle = 'black';
            offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);

            // Find the maximum frequency present in the audio
            const nyquistFreq = audioBuffer.sampleRate / 2;
            const maxFreq = Math.min(nyquistFreq, 20000); // Cap at 20kHz
            const displayMaxFreq = maxFreq * 1.15; // Show 15% above the max frequency
            
            // Process chunks in batches
            const batchSize = 32;
            for (let chunkStart = 0; chunkStart < numChunks; chunkStart += batchSize) {
                const batchEnd = Math.min(chunkStart + batchSize, numChunks);
                const batchPromises = [];

                // Create promises for each chunk in the batch
                for (let i = chunkStart; i < batchEnd; i++) {
                    const startSample = i * hopSize;
                    const chunk = channelData.slice(startSample, startSample + chunkSize);
                    batchPromises.push(processAudioChunk(chunk, audioBuffer.sampleRate, fftSize));
                }

                // Wait for all chunks in batch to complete
                const batchResults = await Promise.all(batchPromises);

                // Draw the batch results
                const columnWidth = Math.ceil(canvas.spectrumWidth / numChunks);
                batchResults.forEach((frequencyData, batchIndex) => {
                    const column = chunkStart + batchIndex;
                    const x = canvas.spectrumX + Math.floor((column / numChunks) * canvas.spectrumWidth);

                    for (let i = 0; i < frequencyData.length; i++) {
                        const frequency = i * (audioBuffer.sampleRate / 2) / (fftSize / 2);
                        if (frequency > displayMaxFreq) break;

                        const y = canvas.spectrumY + Math.floor(canvas.spectrumHeight * (1 - frequency / displayMaxFreq));
                        const db = frequencyData[i];
                        const color = getColorForDecibel(db);

                        offscreenCtx.fillStyle = color;
                        offscreenCtx.fillRect(x, y, columnWidth, 1);
                    }
                });

                // Update display
                ctx.drawImage(offscreenCanvas, 0, 0);
                const progress = (batchEnd / numChunks) * 100;
                analyzeButton.textContent = `Analyzing... ${Math.round(progress)}%`;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            // Add frequency scale
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            const freqStep = displayMaxFreq > 20000 ? 5000 : 2500;
            for (let freq = 0; freq <= displayMaxFreq; freq += freqStep) {
                const y = canvas.spectrumY + canvas.spectrumHeight * (1 - freq / displayMaxFreq);
                ctx.fillText(`${Math.round(freq/1000)}k`, canvas.spectrumX - 5, y + 4);
            }
            
            // Add time scale
            ctx.textAlign = 'center';
            const duration = audioBuffer.duration;
            const timePoints = [0, duration/4, duration/2, (duration*3)/4, duration];
            timePoints.forEach(time => {
                const x = canvas.spectrumX + ((time / duration) * canvas.spectrumWidth);
                ctx.fillText(`${time.toFixed(1)}s`, x, canvas.height - 8);
            });
            
            // Draw dB scale with color gradient
            drawDBScale(ctx, canvas.width, canvas.height);
            
        } catch (error) {
            console.error('Analysis error:', error);
            alert('An error occurred during analysis. Please try again.');
        } finally {
            isAnalyzing = false;
            analyzeButton.disabled = false;
            analyzeButton.textContent = 'Analyze Audio';
        }
    }

    // Keep the analyze button as a fallback
    analyzeButton.addEventListener('click', analyzeAudio);

    // Set up drag and drop
    setupDragAndDrop();

    // Theme switching functionality
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.add(savedTheme + '-theme');
    document.getElementById('theme-select').value = savedTheme;
    
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 100);

    document.getElementById('theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.classList.remove('light-theme', 'dark-theme', 'green-theme', 'orange-theme', 'purple-theme');
        document.body.classList.add(theme + '-theme');
        localStorage.setItem('theme', theme);
    });

    // Get color for decibel value
    function getColorForDecibel(db) {
        // Normalize dB value between -120 and 0
        const normalizedValue = (db + 120) / 120;
        
        // Create color stops similar to Spek
        if (normalizedValue < 0.2) {
            // Dark blue to blue
            return `rgb(0,0,${Math.floor(normalizedValue * 5 * 255)})`;
        } else if (normalizedValue < 0.4) {
            // Blue to magenta
            const val = Math.floor((normalizedValue - 0.2) * 5 * 255);
            return `rgb(${val},0,255)`;
        } else if (normalizedValue < 0.6) {
            // Magenta to red
            const val = Math.floor((0.6 - normalizedValue) * 5 * 255);
            return `rgb(255,0,${val})`;
        } else if (normalizedValue < 0.8) {
            // Red to yellow
            const val = Math.floor((normalizedValue - 0.6) * 5 * 255);
            return `rgb(255,${val},0)`;
        } else {
            // Yellow to white
            const val = Math.floor((normalizedValue - 0.8) * 5 * 255);
            return `rgb(255,255,${val})`;
        }
    }

    // Draw the dB scale with color gradient
    function drawDBScale(ctx, width, height) {
        const scaleWidth = 20;
        const rightPadding = 35;
        const x = width - rightPadding - scaleWidth;
        const y = canvas.spectrumY;
        const scaleHeight = canvas.spectrumHeight;
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + scaleHeight);
        const stops = [
            { pos: 0, db: 0 },
            { pos: 0.2, db: -24 },
            { pos: 0.4, db: -48 },
            { pos: 0.6, db: -72 },
            { pos: 0.8, db: -96 },
            { pos: 1.0, db: -120 }
        ];

        stops.forEach(stop => {
            gradient.addColorStop(stop.pos, getColorForDecibel(stop.db));
        });

        // Draw gradient bar
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, scaleWidth, scaleHeight);

        // Draw dB labels
        ctx.fillStyle = 'white';
        ctx.textAlign = 'right';
        ctx.font = '12px Arial';
        
        stops.forEach(stop => {
            const labelY = y + (stop.pos * scaleHeight);
            ctx.fillText(`${stop.db} dB`, x + scaleWidth + 25, labelY + 4);
        });
        
        ctx.textAlign = 'left';
    }

    // Process a chunk of audio and return frequency data
    async function processAudioChunk(chunk, sampleRate, fftSize) {
        return new Promise((resolve, reject) => {
            try {
                // Create a temporary offline context for this chunk
                const offlineCtx = new OfflineAudioContext(1, chunk.length, sampleRate);
                const buffer = offlineCtx.createBuffer(1, chunk.length, sampleRate);
                buffer.copyToChannel(chunk, 0);

                // Create analyzer
                const analyzer = offlineCtx.createAnalyser();
                analyzer.fftSize = fftSize;
                analyzer.smoothingTimeConstant = 0;
                analyzer.minDecibels = -120;
                analyzer.maxDecibels = 0;

                // Create source and connect
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(analyzer);
                analyzer.connect(offlineCtx.destination);

                // Get frequency data after rendering
                offlineCtx.startRendering().then(() => {
                    const frequencyData = new Float32Array(analyzer.frequencyBinCount);
                    analyzer.getFloatFrequencyData(frequencyData);
                    resolve(frequencyData);
                }).catch(reject);

                // Start the source
                source.start(0);
            } catch (error) {
                reject(error);
            }
        });
    }
});

// Menu toggle functionality
function toggleMenu() {
    const menuIcon = document.querySelector('.menu-icon');
    const settingsPanel = document.querySelector('.settings-panel');
    
    menuIcon.classList.toggle('active');
    settingsPanel.classList.toggle('open');
}
