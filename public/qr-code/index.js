// Theme handling
document.addEventListener('DOMContentLoaded', () => {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.add('loaded');
    document.body.classList.add(savedTheme + '-theme');
    document.getElementById('theme-select').value = savedTheme;

    // Initialize QR code
    generateQRCode();
    updateSliderValue();

    // Add event listeners for QR code actions
    document.getElementById('copy-qr').addEventListener('click', copyQRCode);
    document.getElementById('save-qr').addEventListener('click', saveQRCode);
});

// Update slider value display
function updateSliderValue() {
    const slider = document.getElementById('qr-size');
    const valueDisplay = slider.parentElement.querySelector('.slider-value');
    valueDisplay.textContent = `${slider.value}px`;
}

// Menu toggle
function toggleMenu() {
    const menuIcon = document.querySelector('.menu-icon');
    const settingsPanel = document.querySelector('.settings-panel');
    
    menuIcon.classList.toggle('active');
    settingsPanel.classList.toggle('open');
}

// Theme switching
document.getElementById('theme-select').addEventListener('change', (e) => {
    const theme = e.target.value;
    document.body.classList.remove('light-theme', 'dark-theme', 'green-theme', 'orange-theme', 'purple-theme');
    document.body.classList.add(theme + '-theme');
    localStorage.setItem('theme', theme);
});

// QR Code generation
const textInput = document.getElementById('text-input');
const qrSize = document.getElementById('qr-size');
const qrErrorCorrection = document.getElementById('qr-error-correction');
const qrContainer = document.getElementById('qr-code');
const errorMessage = document.getElementById('error-message');
let currentQR = null;
let lastSize = 128;
let debounceTimer;

// Event listeners for real-time updates
textInput.addEventListener('input', generateQRCode);

qrSize.addEventListener('input', () => {
    updateSliderValue();
    const currentSize = parseInt(qrSize.value);
    
    // Only update if the size has changed by at least 8 pixels
    if (Math.abs(currentSize - lastSize) >= 8) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            generateQRCode();
            lastSize = currentSize;
        }, 0);
    }
});

qrSize.addEventListener('mouseup', () => {
    const step = 32;
    const value = parseInt(qrSize.value);
    const roundedValue = Math.round(value / step) * step;
    qrSize.value = roundedValue;
    updateSliderValue();
    generateQRCode();
    lastSize = roundedValue;
});

qrErrorCorrection.addEventListener('change', generateQRCode);

function generateQRCode() {
    const text = textInput.value.trim();
    const size = parseInt(qrSize.value);
    const errorCorrection = qrErrorCorrection.value;

    if (!text) {
        showError('Please enter some text or URL');
        return;
    }

    try {
        // Clear previous QR code
        qrContainer.innerHTML = '';
        
        // Create new QR code
        currentQR = new QRCode(qrContainer, {
            text: text,
            width: size,
            height: size,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel[errorCorrection]
        });
        
        hideError();
    } catch (error) {
        showError('Error generating QR code: ' + error.message);
    }
}

// Copy QR code to clipboard
async function copyQRCode() {
    try {
        const qrImage = qrContainer.querySelector('img');
        if (!qrImage) {
            showError('No QR code to copy');
            return;
        }

        // Create a canvas to draw the QR code
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = qrImage.width;
        canvas.height = qrImage.height;
        ctx.drawImage(qrImage, 0, 0);

        // Convert canvas to blob
        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);
                showError('QR code copied to clipboard!');
                setTimeout(hideError, 2000);
            } catch (err) {
                showError('Failed to copy QR code: ' + err.message);
            }
        });
    } catch (error) {
        showError('Error copying QR code: ' + error.message);
    }
}

// Save QR code as image
function saveQRCode() {
    try {
        const qrImage = qrContainer.querySelector('img');
        if (!qrImage) {
            showError('No QR code to save');
            return;
        }

        // Get the text input value and sanitize it for filename
        let filename = textInput.value.trim();
        if (!filename) {
            filename = 'qr-code';
        } else {
            // Remove invalid filename characters and limit length
            filename = filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
            if (filename.length > 50) {
                filename = filename.substring(0, 50);
            }
        }

        // Create a temporary link element
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = qrImage.src;
        link.click();
    } catch (error) {
        showError('Error saving QR code: ' + error.message);
    }
}

// Error handling
function showError(message) {
    errorMessage.style.display = 'block';
    errorMessage.querySelector('p').textContent = message;
}

function hideError() {
    errorMessage.style.display = 'none';
}
