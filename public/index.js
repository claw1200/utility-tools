
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
    document.widget.classList.add('loaded');
    
}

// Add event listeners
document.getElementById('theme-select').addEventListener('change', theme_updated);

// wait for the DOM to load before running the function
document.addEventListener('DOMContentLoaded', function() {
    get_theme_cookie();
    document.body.classList.add('loaded');
    document.widget.classList.add('loaded');
});

// window.addEventListener('pageshow', function(event) {
//     if (event.persisted) {
//         window.location.reload();
//     }
// }
// );

