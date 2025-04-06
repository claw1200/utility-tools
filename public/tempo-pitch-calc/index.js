// calculate new bpm based on how much the song is pitched

const solve = (oldBpm, pitchChange, newBpm, pitchType) => {
    let result;

    if (pitchType === "semitones") {
        pitchChange = pitchChange * 100; // convert to cents for calculation
    }
    else if (pitchType === "ratio") {
        pitchChange = 1200 * Math.log2(pitchChange); // convert to cents for calculation
    }

    
    if (isNaN(oldBpm)) {
        result = newBpm / (2 ** (pitchChange / 1200));
        // console.log("oldBpm: ", result);
    }
    else if (isNaN(pitchChange)) {
        result = 1200 * Math.log2(newBpm / oldBpm);
        if (pitchType === "semitones") { 
            result = result / 100; // convert back to semitones
        }
        else if (pitchType === "ratio") {
            result = 2 ** (result / 1200); // convert back to ratio
        }
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
    const pitchType = document.getElementById('pitch-notation-select').value;
    // call the solve function with the three values
    const result = solve(old_bpm, pitch, new_bpm, pitchType);

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

function handleInputChangeNotation(event) {

    lastEdited = [
        "old-bpm",
        "new-bpm",
        "pitch"
    ];
    
    // update html label to show the correct unit
    const pitchType = event.target.value;
    const pitchLabel = document.getElementById('pitch-label');
    if (pitchType === "semitones") {
        pitchLabel.innerHTML = "semitones";
    }
    else if (pitchType === "cents") {
        pitchLabel.innerHTML = "cents";
    }
    else if (pitchType === "ratio") {
        pitchLabel.innerHTML = "ratio";
    }
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
document.getElementById('old-bpm').addEventListener('input', handleInputChange);
document.getElementById('pitch').addEventListener('input', handleInputChange);
document.getElementById('new-bpm').addEventListener('input', handleInputChange);
document.getElementById('decimal-places').addEventListener('input', handleInputChangeDecimal);
document.getElementById('theme-select').addEventListener('change', theme_updated);
document.getElementById('pitch-notation-select').addEventListener('change', handleInputChangeNotation);

// wait for the DOM to load before running the function
document.addEventListener('DOMContentLoaded', function() {
    get_theme_cookie();
    document.body.classList.add('loaded');
});

// window.addEventListener('pageshow', function(event) {
//     if (event.persisted) {
//         window.location.reload();
//     }
// }
// );