// calculate new bpm based on how much the song is pitched

const solve = (oldBpm, pitchChange, newBpm) => {
    let result;
    if (isNaN(oldBpm)) {
        result = newBpm / (2 ** (pitchChange / 1200));
        // console.log("oldBpm: ", result);
    }
    else if (isNaN(pitchChange)) {
        result = 1200 * Math.log2(newBpm / oldBpm);
        // console.log("pitchChange: ", result);
    }
    else if (isNaN(newBpm)) {
        result = oldBpm * (2 ** (pitchChange / 1200));
        // console.log("newBpm: ", result);
    }

    // round to decimal places specified in the settings
    dp = parseInt(document.getElementById('decimal-places').value);
    return result.toFixed(dp);
}

function calculate() {
    // read values from the input fields and parse them as numbers
    const old_bpm = parseFloat(document.getElementById('old-bpm').value);
    const pitch = parseFloat(document.getElementById('pitch').value);
    const new_bpm = parseFloat(document.getElementById('new-bpm').value);
    // call the solve function with the three values
    const result = solve(old_bpm, pitch, new_bpm);

    // display result in the field that was left empty out of the three
    if (result === "NaN") {
        console.log("result is NaN");
    }
    else if (isNaN(old_bpm)) {
        document.getElementById('old-bpm').value = result;
    }
    else if (isNaN(pitch)) {
        document.getElementById('pitch').value = result;
    }
    else if (isNaN(new_bpm)) {
        document.getElementById('new-bpm').value = result;
    }
}

// a queue that holds the order of the last edited input field
let lastEdited = [
    "old-bpm",
    "pitch",
    "new-bpm"
];

function updateLastEdited(inputId) {
    // Remove if already in queue
    lastEdited = lastEdited.filter(id => id !== inputId);
    // Add to front
    lastEdited.unshift(inputId);
    // Keep only last 3 items
    if (lastEdited.length > 3) {
        lastEdited.pop();
    }
}

function handleInputChange(event) {

    // Update last edited queue
    updateLastEdited(event.target.id);

    // set the item last in the queue to empty
    if (lastEdited.length > 2) {
        document.getElementById(lastEdited[2]).value = null;
    }
    // calculate 
    calculate();
}

function handleInputChangeDecimal(event) {
    // set the item last in the queue to empty
    if (lastEdited.length > 2) {
        document.getElementById(lastEdited[2]).value = null;
    }
    // calculate 
    calculate();
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

function decimal_selector() {
    // called when input field is changed. If the value is not a number, set it to 0
    const dp = parseInt(document.getElementById('decimal-places').value);
    if (isNaN(dp)) {
        document.getElementById('decimal-places').value = 0;
    }
}

// Add event listeners
document.getElementById('old-bpm').addEventListener('input', handleInputChange);
document.getElementById('pitch').addEventListener('input', handleInputChange);
document.getElementById('new-bpm').addEventListener('input', handleInputChange);
document.getElementById('decimal-places').addEventListener('input', handleInputChangeDecimal);

