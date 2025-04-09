let movies = [];
let filteredMovies = [];
let currentMovie = null;
let currentPage = 0;
const moviesPerPage = 30;
let isLoading = false;
let allMoviesLoaded = false;
let config = {};

// Load movies from JSON file
function loadMovies() {
    return fetch('movies.json')
        .then(response => response.json())
        .then(data => {
            movies = data.movies; // Access the movies array from the data object
            filteredMovies = [...movies]; // Initialize filtered movies
            config = data.config; // Store config
            if (!config || !config.videoPlayerBaseUrl) {
                throw new Error('Missing video player configuration');
            }
            displayMovies(true);
            return movies; // Return movies for promise chaining
        })
        .catch(error => {
            console.error('Error loading movies:', error);
            return []; // Return empty array on error
        });
}

function displayMovies(isInitialLoad = false) {
    if (isLoading || (allMoviesLoaded && !isInitialLoad)) return;
    
    isLoading = true;
    const moviesRow = document.querySelector('.movies-row');
    
    if (isInitialLoad) {
        moviesRow.innerHTML = '';
        currentPage = 0;
        allMoviesLoaded = false;
    }

    const startIndex = currentPage * moviesPerPage;
    const endIndex = Math.min(startIndex + moviesPerPage, filteredMovies.length);
    
    if (startIndex >= filteredMovies.length) {
        allMoviesLoaded = true;
        isLoading = false;
        return;
    }

    for (let i = startIndex; i < endIndex; i++) {
        const movie = filteredMovies[i];
        const movieCard = document.createElement('div');
        movieCard.className = 'widget movie-card';
        movieCard.innerHTML = `
            <div class="image-container">
                <img src="${movie.images.coverSmall}" alt="${movie.title}">
            </div>
            <label>${movie.title}</label>
            <p>${movie.release_date}</p>
        `;
        movieCard.addEventListener('click', () => selectMovie(movie));
        moviesRow.appendChild(movieCard);
    }

    currentPage++;
    isLoading = false;
}

// Add scroll event listener for infinite loading
const moviesRow = document.querySelector('.movies-row');
moviesRow.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = moviesRow;
    
    // If we're near the bottom (within 300px), load more
    if (scrollHeight - scrollTop - clientHeight < 300) {
        displayMovies();
    }
});

function searchMovies() {
    const searchInput = document.getElementById('searchInput');
    const searchValue = searchInput.value.toLowerCase();
    
    // Reset the display when searching
    currentPage = 0;
    allMoviesLoaded = false;
    
    // Filter movies without modifying the original array
    filteredMovies = movies.filter(movie => 
        movie.title.toLowerCase().includes(searchValue)
    );
    
    displayMovies(true);
}

function selectMovie(movie) {
    currentMovie = movie;
    const videoPlayer = document.getElementById('videoPlayer');
    const currentMovieTitle = document.getElementById('currentMovieTitle');
    const currentMovieDescription = document.getElementById('currentMovieDescription');
    const mainWidget = document.querySelector('.main-widget');

    // Show the main widget
    mainWidget.classList.add('show');

    // Update the video player source using the config URL
    videoPlayer.src = `${config.videoPlayerBaseUrl}${movie.id}`;
    currentMovieTitle.textContent = movie.title;
    currentMovieDescription.textContent = movie.description || '';

    // Update URL with movie ID without reloading the page
    const newUrl = `${window.location.pathname}?id=${movie.id}`;
    window.history.pushState({ movieId: movie.id }, '', newUrl);

    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // reset all movie cards to visible
    const movieCards = document.querySelectorAll('.movie-card');
    movieCards.forEach(card => {
        card.style.display = 'block';
    });

    // clear search input
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
}

// Function to get URL parameters
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: params.get('id')
    };
}

// Theme handling
const themeSelect = document.getElementById('theme-select');
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
themeSelect.value = savedTheme;
applyTheme(savedTheme);

themeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
});

function applyTheme(theme) {
    body.className = theme + '-theme';
}

// Menu handling
function toggleMenu() {
    const settingsPanel = document.querySelector('.settings-panel');
    const menuIcon = document.getElementById('menu-icon');
    
    settingsPanel.classList.toggle('open');
    menuIcon.parentElement.classList.toggle('active');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const settingsPanel = document.querySelector('.settings-panel');
    const menuIcon = document.querySelector('.menu-icon');
    
    if (!settingsPanel.contains(e.target) && !menuIcon.contains(e.target)) {
        settingsPanel.classList.remove('open');
        menuIcon.classList.remove('active');
    }
});

// Search movies
document.getElementById('searchInput').addEventListener('input', searchMovies);

// Initialize theme when page loads
document.addEventListener('DOMContentLoaded', function() {
    get_theme_cookie();
    document.body.classList.add('loaded');
    
    // Load movies and then handle URL parameters
    loadMovies().then(loadedMovies => {
        // Check if there's a movie ID in the URL
        const { id } = getUrlParams();
        if (id) {
            const movie = loadedMovies.find(m => m.id.toString() === id.toString());
            if (movie) {
                selectMovie(movie);
            }
        }
    });
});

// Handle browser back/forward navigation
window.addEventListener('popstate', function(event) {
    const { id } = getUrlParams();
    if (id) {
        const movie = movies.find(m => m.id.toString() === id.toString());
        if (movie) {
            selectMovie(movie);
        }
    } else {
        // If no ID in URL, reset to initial state
        const mainWidget = document.querySelector('.main-widget');
        mainWidget.classList.remove('show');
    }
});

function get_theme_cookie() {
    const theme = localStorage.getItem('theme');
    if (theme) {
        document.body.className = theme + '-theme';
        document.getElementById('theme-select').value = theme;
    }
}

