/**
 * What's On the Menu? Frontend Application
 * @module app
 */

"use strict";

// ============================================================================
// Configuration & Constants
// ============================================================================

const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    VALID_FILE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    PROGRESS_CIRCLE_RADIUS: 28,
    STORAGE_KEYS: {
        CURRENCY: "menuTranslatorCurrency",
        MODEL: "menuTranslatorModel",
        INCLUDE_IMAGES: "menuTranslatorIncludeImages",
    },
    DEFAULTS: {
        CURRENCY: "EUR",
        MODEL: "gpt-5-mini",
        INCLUDE_IMAGES: true,
    },
};

// ============================================================================
// Allergy Icons (SVG)
// ============================================================================

const ALLERGY_ICONS = {
    peanuts: {
        label: "May contain peanuts",
        svg: `<svg class="allergy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2C8.5 2 6.5 4.5 6.5 7.5C6.5 9.5 7.5 11 9 12C7.5 13 6.5 14.5 6.5 16.5C6.5 19.5 8.5 22 12 22C15.5 22 17.5 19.5 17.5 16.5C17.5 14.5 16.5 13 15 12C16.5 11 17.5 9.5 17.5 7.5C17.5 4.5 15.5 2 12 2Z" />
            <path d="M9 5.5C9.5 4.5 10.5 4 12 4C13.5 4 14.5 4.5 15 5.5" />
            <path d="M8.5 7.5C9 8.5 10.5 9 12 9C13.5 9 15 8.5 15.5 7.5" />
            <path d="M9 18.5C9.5 19.5 10.5 20 12 20C13.5 20 14.5 19.5 15 18.5" />
            <path d="M8.5 16.5C9 15.5 10.5 15 12 15C13.5 15 15 15.5 15.5 16.5" />
            <path d="M10 12L14 12" />
        </svg>`,
    },
    gluten: {
        label: "May contain gluten",
        svg: `<svg class="allergy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 21V10" />
            <path d="M12 10C12 10 8 8 8 5C8 5 10 6 12 6C14 6 16 5 16 5C16 8 12 10 12 10Z" />
            <path d="M9 13C9 13 6 12 6 9" />
            <path d="M15 13C15 13 18 12 18 9" />
            <path d="M9 17C9 17 5 16 5 13" />
            <path d="M15 17C15 17 19 16 19 13" />
        </svg>`,
    },
    meat: {
        label: "Contains meat",
        svg: `<svg class="allergy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12C4 7 8 4 14 4C18 4 20 6 20 10C20 16 16 20 10 20C6 20 4 17 4 12Z" />
            <path d="M8 9C10 8 13 9 15 11" />
            <path d="M7 13C9 12 12 13 14 15" />
            <circle cx="16" cy="7" r="1.5" />
        </svg>`,
    },
};

// ============================================================================
// State Management
// ============================================================================

const state = {
    abortController: null,
    lastTranslationData: null,
    timerInterval: null,
    timerStartTime: null,
    galleryImages: [],
    galleryCurrentIndex: 0,
    galleryTouchStartX: null,
    galleryTouchStartY: null,
    galleryIsDragging: false,
    galleryDragOffset: 0,
    galleryDragStartTime: null,
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
    uploadArea: document.getElementById("upload-area"),
    uploadSection: document.getElementById("upload-section"),
    fileInput: document.getElementById("file-input"),
    uploadContent: document.getElementById("upload-content"),
    uploadProgress: document.getElementById("upload-progress"),
    progressCircle: document.getElementById("progress-circle"),
    timerText: document.getElementById("timer-text"),
    errorMessage: document.getElementById("error-message"),
    results: document.getElementById("results"),
    dishesContainer: document.getElementById("dishes-container"),
    sourceLanguage: document.getElementById("source-language"),
    exchangeRate: document.getElementById("exchange-rate"),
    dishCount: document.getElementById("dish-count"),
    newUploadBtn: document.getElementById("new-upload-btn"),
    mainContainer: document.getElementById("main-container"),
    mainHeader: document.getElementById("main-header"),
    settingsButton: document.getElementById("settings-button"),
    settingsModal: document.getElementById("settings-modal"),
    closeSettings: document.getElementById("close-settings"),
    currencySelect: document.getElementById("currency-select"),
    modelSelect: document.getElementById("model-select"),
    includeImagesToggle: document.getElementById("include-images-toggle"),
    saveSettings: document.getElementById("save-settings"),
    galleryModal: document.getElementById("image-gallery-modal"),
    galleryImage: document.getElementById("gallery-image"),
    gallerySlider: document.getElementById("gallery-slider"),
    galleryImageContainer: document.getElementById("gallery-image-container"),
    galleryClose: document.getElementById("gallery-close"),
    galleryPrev: document.getElementById("gallery-prev"),
    galleryNext: document.getElementById("gallery-next"),
    galleryCurrent: document.getElementById("gallery-current"),
    galleryTotal: document.getElementById("gallery-total"),
    progressMessage: document.getElementById("progress-message"),
    progressHint: document.getElementById("progress-hint"),
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape HTML to prevent XSS attacks.
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
    if (typeof text !== "string") {
        return "";
    }
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sleep for specified milliseconds.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate file type.
 * @param {File} file - File to validate
 * @returns {boolean} True if valid
 */
function isValidFileType(file) {
    return CONFIG.VALID_FILE_TYPES.includes(file.type);
}

/**
 * Validate file size.
 * @param {File} file - File to validate
 * @returns {boolean} True if valid
 */
function isValidFileSize(file) {
    return file.size <= CONFIG.MAX_FILE_SIZE;
}

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Get value from localStorage with fallback.
 * @param {string} key - Storage key
 * @param {string} defaultValue - Default value if not found
 * @returns {string} Stored or default value
 */
function getStorageItem(key, defaultValue) {
    try {
        return localStorage.getItem(key) || defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Set value in localStorage.
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
function setStorageItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage unavailable - fail silently
    }
}

const getCurrency = () => getStorageItem(CONFIG.STORAGE_KEYS.CURRENCY, CONFIG.DEFAULTS.CURRENCY);
const setCurrency = (v) => setStorageItem(CONFIG.STORAGE_KEYS.CURRENCY, v);
const getModel = () => getStorageItem(CONFIG.STORAGE_KEYS.MODEL, CONFIG.DEFAULTS.MODEL);
const setModel = (v) => setStorageItem(CONFIG.STORAGE_KEYS.MODEL, v);

function getIncludeImages() {
    try {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.INCLUDE_IMAGES);
        if (stored === null) {
            return CONFIG.DEFAULTS.INCLUDE_IMAGES;
        }
        return stored === "true";
    } catch {
        return CONFIG.DEFAULTS.INCLUDE_IMAGES;
    }
}

function setIncludeImages(v) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.INCLUDE_IMAGES, String(v));
    } catch {
        // Storage unavailable - fail silently
    }
}

/**
 * Initialize settings selectors.
 */
function initSettings() {
    if (elements.currencySelect) {
        elements.currencySelect.value = getCurrency();
    }
    if (elements.modelSelect) {
        elements.modelSelect.value = getModel();
    }
    if (elements.includeImagesToggle) {
        elements.includeImagesToggle.checked = getIncludeImages();
    }
}

// ============================================================================
// UI State Management
// ============================================================================

/**
 * Show upload progress indicator.
 */
function showProgress() {
    elements.uploadContent.classList.add("hidden");
    elements.uploadProgress.classList.remove("hidden");
    elements.uploadArea.setAttribute("aria-busy", "true");
    startTimer();
}

/**
 * Hide upload progress indicator.
 */
function hideProgress() {
    elements.uploadContent.classList.remove("hidden");
    elements.uploadProgress.classList.add("hidden");
    elements.uploadArea.setAttribute("aria-busy", "false");
    stopTimer();
    // Reset progress message and hint to default
    updateProgressMessage("Processing menu...", "Grab a drink while you wait...");
}

/**
 * Update the progress message text.
 * @param {string} message - Progress message to display
 * @param {string} [hint] - Optional hint text to display below (supports HTML)
 */
function updateProgressMessage(message, hint) {
    if (elements.progressMessage) {
        elements.progressMessage.textContent = message;
    }
    if (elements.progressHint && hint !== undefined) {
        elements.progressHint.innerHTML = hint;
    }
}

/**
 * Start the timer for upload progress.
 */
function startTimer() {
    stopTimer();
    state.timerStartTime = Date.now();
    const circumference = 2 * Math.PI * CONFIG.PROGRESS_CIRCLE_RADIUS;
    
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.timerStartTime) / 1000);
        const seconds = elapsed % 60;
        const minutes = Math.floor(elapsed / 60);
        
        let displayText;
        if (minutes > 0) {
            displayText = `${minutes}m ${seconds}s`;
        } else {
            displayText = `${seconds}s`;
        }
        elements.timerText.textContent = displayText;
        
        if (elapsed <= 60) {
            const progress = elapsed / 60;
            const offset = circumference * (1 - progress);
            elements.progressCircle.style.strokeDashoffset = offset;
            elements.progressCircle.classList.remove("text-green-600", "timer-pulse", "animate-pulse");
            elements.progressCircle.classList.add("text-blue-600");
        } else {
            elements.progressCircle.style.strokeDashoffset = 0;
            elements.progressCircle.classList.remove("text-blue-600");
            elements.progressCircle.classList.add("text-green-600", "timer-pulse");
        }
    }, 100);
}

/**
 * Stop the timer.
 */
function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    state.timerStartTime = null;
    
    if (elements.progressCircle) {
        const circumference = 2 * Math.PI * CONFIG.PROGRESS_CIRCLE_RADIUS;
        elements.progressCircle.style.strokeDashoffset = circumference;
        elements.progressCircle.classList.remove("text-green-600", "timer-pulse", "animate-pulse");
        elements.progressCircle.classList.add("text-blue-600");
    }
    
    if (elements.timerText) {
        elements.timerText.textContent = "0s";
    }
}

/**
 * Show error message.
 * @param {string} message - Error message to display
 */
function showError(message) {
    const errorText = document.getElementById("error-text");
    if (errorText) {
        errorText.textContent = message;
    }
    elements.errorMessage.classList.remove("hidden");
}

/**
 * Hide error message.
 */
function hideError() {
    elements.errorMessage.classList.add("hidden");
}

/**
 * Hide results section.
 */
function hideResults() {
    elements.results.classList.add("hidden");
}

// ============================================================================
// File Upload Handlers
// ============================================================================

/**
 * Handle drag over event.
 * @param {DragEvent} e - Drag event
 */
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.add("upload-area-active");
    elements.uploadArea.setAttribute("aria-dropeffect", "copy");
}

/**
 * Handle drag leave event.
 * @param {DragEvent} e - Drag event
 */
function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.remove("upload-area-active");
    elements.uploadArea.removeAttribute("aria-dropeffect");
}

/**
 * Handle drop event.
 * @param {DragEvent} e - Drop event
 */
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.uploadArea.classList.remove("upload-area-active");
    elements.uploadArea.removeAttribute("aria-dropeffect");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

/**
 * Handle file input change.
 * @param {Event} e - Change event
 */
function handleFileInputChange(e) {
    if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
        // Reset input to allow re-uploading the same file
        e.target.value = "";
    }
}

/**
 * Handle keyboard navigation for upload area.
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyPress(e) {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        elements.fileInput.click();
    }
}

// ============================================================================
// API Communication
// ============================================================================

/**
 * Retry API call with exponential backoff.
 * @param {Function} fn - Function to retry
 * @param {number} attempts - Number of retry attempts
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise<any>} Result of function
 */
async function retryWithBackoff(fn, attempts = CONFIG.RETRY_ATTEMPTS, delay = CONFIG.RETRY_DELAY) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === attempts - 1) {
                throw error;
            }
            if (error.name === "AbortError") {
                throw error;
            }
            await sleep(delay * Math.pow(2, i));
        }
    }
}

/**
 * Upload and translate menu image (stage 1 - translation only).
 * @param {File} file - Image file to upload
 * @returns {Promise<Object>} Translation result (without images)
 */
async function translateMenu(file) {
    updateProgressMessage("Translating menu with AI...", "Order a drink, this'll be a minute or two.");
    
    const formData = new FormData();
    formData.append("image", file);
    formData.append("currency", getCurrency());
    formData.append("model", getModel());

    const response = await fetch("/api/translate", {
        method: "POST",
        body: formData,
        signal: state.abortController.signal,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage = data.message || `Translation failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.status === "success") {
        return data.data;
    }

    throw new Error(data.message || "Unknown error occurred");
}

/**
 * Fetch images for dishes with progress updates (stage 2).
 * @param {Array} dishes - Array of dish objects
 * @param {string} language - Source language for search
 * @param {boolean} includeImages - Whether to fetch images
 * @returns {Promise<Object>} Map of dish names to image URL arrays
 */
async function fetchImagesForDishes(dishes, language, includeImages) {
    if (!includeImages || dishes.length === 0) {
        return Object.fromEntries(dishes.map(dish => [dish.name, null]));
    }

    const totalDishes = dishes.length;
    const imagesData = {};

    // Fetch images one by one to show progress
    for (let i = 0; i < dishes.length; i++) {
        const dish = dishes[i];
        updateProgressMessage(
            `Fetching images for ${i + 1}/${totalDishes} dishes...`,
            `We need another minute... I bet you wish you learned how to speak ${language} now, eh?<br>Image search can be disabled in Settings.`
        );

        try {
            const response = await fetch("/api/fetch-images", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    dishes: [dish],
                    language: language,
                    include_images: true,
                }),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                console.warn(`Failed to fetch images for ${dish.name}: ${response.status}`);
                imagesData[dish.name] = null;
                continue;
            }

            const data = await response.json();
            if (data.status === "success") {
                imagesData[dish.name] = data.images[dish.name] || null;
            } else {
                imagesData[dish.name] = null;
            }
        } catch (error) {
            if (error.name === "AbortError") {
                throw error;
            }
            console.warn(`Image fetch failed for ${dish.name}:`, error.message);
            imagesData[dish.name] = null;
        }
    }

    return imagesData;
}

/**
 * Handle file upload with validation and two-stage processing.
 * Stage 1: Translation (menu text extraction)
 * Stage 2: Image fetching (with progress updates)
 * @param {File} file - File to process
 */
async function handleFile(file) {
    // Cancel previous request if any
    if (state.abortController) {
        state.abortController.abort();
    }
    state.abortController = new AbortController();

    // Validate file type
    if (!isValidFileType(file)) {
        showError("Invalid file type. Please upload a JPG, PNG, or WEBP image.");
        return;
    }

    // Validate file size
    if (!isValidFileSize(file)) {
        showError(`File size exceeds ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB limit.`);
        return;
    }

    hideError();
    hideResults();
    restoreOriginalLayout();
    showProgress();

    try {
        // Stage 1: Translation
        const translationData = await retryWithBackoff(() => translateMenu(file));

        // Stage 2: Fetch images (if enabled)
        const includeImages = getIncludeImages();
        if (includeImages && translationData.dishes.length > 0) {
            try {
                const imagesData = await fetchImagesForDishes(
                    translationData.dishes,
                    translationData.source_language,
                    includeImages
                );

                // Merge image URLs into dishes
                translationData.dishes = translationData.dishes.map(dish => ({
                    ...dish,
                    image_urls: imagesData[dish.name] || null,
                }));
            } catch (imageError) {
                if (imageError.name === "AbortError") {
                    throw imageError;
                }
                // Image fetching failed, but we still have translation data
                console.warn("Image fetching failed, displaying results without images:", imageError);
            }
        }

        displayResults(translationData);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }
        const errorMessage = error.message || "Failed to translate menu. Please try again.";
        showError(errorMessage);
        console.error("Translation error:", error);
    } finally {
        hideProgress();
        state.abortController = null;
    }
}

// ============================================================================
// Settings Modal
// ============================================================================

/**
 * Open settings modal.
 */
function openSettings() {
    elements.settingsModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    // Prevent mobile browsers from auto-focusing select elements
    if (elements.currencySelect) {
        elements.currencySelect.blur();
    }
    if (elements.modelSelect) {
        elements.modelSelect.blur();
    }
}

/**
 * Close settings modal.
 */
function closeSettingsModal() {
    elements.settingsModal.classList.add("hidden");
    document.body.style.overflow = "";
    elements.settingsButton.focus();
}

/**
 * Handle save settings.
 */
function handleSaveSettings() {
    if (elements.currencySelect) {
        setCurrency(elements.currencySelect.value);
    }
    if (elements.modelSelect) {
        setModel(elements.modelSelect.value);
    }
    if (elements.includeImagesToggle) {
        setIncludeImages(elements.includeImagesToggle.checked);
    }
    closeSettingsModal();
    if (elements.results && !elements.results.classList.contains("hidden")) {
        if (state.lastTranslationData) {
            displayResults(state.lastTranslationData);
        }
    }
}

// ============================================================================
// Audio Feedback
// ============================================================================

/**
 * Play a simple bell sound using Web Audio API.
 */
function playBellSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.type = "sine";
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.warn("Could not play bell sound:", error);
    }
}

// ============================================================================
// Price Formatting
// ============================================================================

/**
 * Format price with currency symbol.
 * @param {number|null} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string|null} Formatted price string
 */
function formatPrice(amount, currency) {
    if (amount === null || amount === undefined) {
        return null;
    }

    const symbols = {
        EUR: "€",
        USD: "$",
        GBP: "£",
        JPY: "¥",
        CAD: "C$",
        AUD: "A$",
        CHF: "CHF",
        CNY: "¥",
        INR: "₹",
    };

    const symbol = symbols[currency] || currency;
    const isIntegerCurrency = currency === "JPY" || currency === "INR";

    if (isIntegerCurrency) {
        return `${symbol}${Math.round(amount).toLocaleString()}`;
    }

    return `${symbol}${amount.toFixed(2)}`;
}

// ============================================================================
// Results Display
// ============================================================================

/**
 * Display translation results.
 * @param {Object} data - Translation data
 */
function displayResults(data) {
    state.lastTranslationData = data;
    elements.sourceLanguage.textContent = `Detected: ${data.source_language}`;
    elements.dishesContainer.innerHTML = "";

    const targetCurrency = data.target_currency || getCurrency();
    const originalCurrency = data.original_currency;
    const exchangeRate = data.exchange_rate_to_eur;

    if (exchangeRate && originalCurrency && originalCurrency !== targetCurrency) {
        const rateText = `1 ${originalCurrency} = ${exchangeRate.toFixed(6)} ${targetCurrency}`;
        elements.exchangeRate.textContent = rateText;
        elements.exchangeRate.classList.remove("hidden");
    } else {
        elements.exchangeRate.classList.add("hidden");
    }

    // Update dish count
    const dishCount = data.dishes?.length || 0;
    if (elements.dishCount) {
        elements.dishCount.textContent = `${dishCount} dish${dishCount !== 1 ? "es" : ""} found`;
    }

    if (!data.dishes || data.dishes.length === 0) {
        elements.dishesContainer.innerHTML =
            '<p class="text-gray-600 text-center py-8">No dishes found in the menu.</p>';
        elements.results.classList.remove("hidden");
        optimizeLayoutForResults();
        return;
    }

    data.dishes.forEach((dish, index) => {
        const dishCard = createDishCard(dish, targetCurrency, originalCurrency, exchangeRate, index);
        elements.dishesContainer.appendChild(dishCard);
    });

    elements.results.classList.remove("hidden");
    optimizeLayoutForResults();
    smoothScrollToResults();
    playBellSound();
}

/**
 * Smooth scroll to results section.
 * Uses native scrollIntoView which respects prefers-reduced-motion.
 */
function smoothScrollToResults() {
    elements.results?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Optimize layout for results display (mobile optimizations).
 * Only hides upload section - header stays constant.
 */
function optimizeLayoutForResults() {
    elements.uploadSection.classList.add("hidden");
}

/**
 * Restore original layout when starting new upload.
 * Only shows upload section - header stays constant.
 */
function restoreOriginalLayout() {
    elements.uploadSection.classList.remove("hidden");
}

/**
 * Start a new upload - reset view to initial state.
 */
function startNewUpload() {
    hideResults();
    hideError();
    restoreOriginalLayout();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Create dish card element.
 * @param {Object} dish - Dish data
 * @param {string} targetCurrency - Target currency code
 * @param {string|null} originalCurrency - Original currency code
 * @param {number|null} exchangeRate - Exchange rate
 * @param {number} index - Dish index for animation
 * @returns {HTMLElement} Dish card element
 */
function createDishCard(dish, targetCurrency, originalCurrency, exchangeRate, index) {
    const dishCard = document.createElement("article");
    dishCard.className = "dish-card bg-white rounded-3xl p-4 md:p-6 shadow-lg";
    dishCard.style.animationDelay = `${index * 0.1}s`;
    dishCard.classList.add("fade-in");

    const imageHtml = createImageHtml(dish);
    const priceHtml = createPriceHtml(dish, targetCurrency, originalCurrency);
    const allergyHtml = createAllergyHtml(dish);

    dishCard.innerHTML = `
        ${imageHtml}
        <div class="space-y-3">
            <div class="dish-header">
                <h3 class="text-2xl font-semibold text-gray-900 mb-1">${escapeHtml(dish.name)}</h3>
                ${allergyHtml}
            </div>
            <p class="text-xl font-medium text-blue-600 mb-2">${escapeHtml(dish.english_name || dish.name)}</p>
            <p class="text-sm text-gray-500 italic mb-3 font-light">
                <span class="font-medium">Pronounced:</span> ${escapeHtml(dish.pronunciation)}
            </p>
            <p class="dish-description text-xs text-gray-700 mb-4 font-light">${escapeHtml(dish.description)}</p>
            ${priceHtml}
        </div>
    `;

    return dishCard;
}

/**
 * Create image HTML for dish card.
 * @param {Object} dish - Dish data
 * @returns {string} Image HTML string (empty if images disabled)
 */
function createImageHtml(dish) {
    if (!getIncludeImages()) {
        return "";
    }

    const imageUrls = dish.image_urls || (dish.image_url ? [dish.image_url] : null);
    
    if (imageUrls && imageUrls.length > 0) {
        const firstImageUrl = imageUrls[0];
        const imageUrlsJson = JSON.stringify(imageUrls);
        return `
            <img src="${escapeHtml(firstImageUrl)}" 
                 alt="${escapeHtml(dish.name)}" 
                 class="dish-image w-full h-52 object-cover rounded-2xl mb-5 cursor-pointer transition-opacity hover:opacity-90"
                 loading="lazy"
                 data-image-urls='${escapeHtml(imageUrlsJson)}'
                 data-dish-name="${escapeHtml(dish.name)}"
                 onerror="this.parentElement.querySelector('.image-placeholder')?.classList.remove('hidden'); this.style.display='none';">
            <div class="image-placeholder hidden w-full h-52 bg-gray-100 rounded-2xl mb-5 flex items-center justify-center">
                <p class="text-gray-400 text-sm font-light">Image unavailable</p>
            </div>
        `;
    }

    return `
        <div class="w-full h-52 bg-gray-100 rounded-2xl mb-5 flex items-center justify-center">
            <p class="text-gray-400 text-sm font-light">No image available</p>
        </div>
    `;
}

/**
 * Create allergy icons HTML for dish card.
 * @param {Object} dish - Dish data
 * @returns {string} Allergy icons HTML string (empty if no allergies)
 */
function createAllergyHtml(dish) {
    const allergies = dish.allergies || [];
    if (allergies.length === 0) {
        return "";
    }

    const icons = allergies
        .filter((allergy) => ALLERGY_ICONS[allergy])
        .map((allergy) => {
            const icon = ALLERGY_ICONS[allergy];
            return `<span class="allergy-badge" title="${escapeHtml(icon.label)}" aria-label="${escapeHtml(icon.label)}">${icon.svg}</span>`;
        })
        .join("");

    if (!icons) {
        return "";
    }

    return `<div class="allergy-icons">${icons}</div>`;
}

/**
 * Create price HTML for dish card.
 * @param {Object} dish - Dish data
 * @param {string} targetCurrency - Target currency code
 * @param {string|null} originalCurrency - Original currency code
 * @returns {string} Price HTML string
 */
function createPriceHtml(dish, targetCurrency, originalCurrency) {
    if (!dish.price) {
        return "";
    }

    const originalPriceFormatted = escapeHtml(dish.price);
    let displayPrice = originalPriceFormatted;

    if (
        dish.converted_price !== null &&
        dish.converted_price !== undefined &&
        originalCurrency &&
        originalCurrency !== targetCurrency
    ) {
        const convertedPriceFormatted = formatPrice(dish.converted_price, targetCurrency);
        displayPrice = `<span class="text-blue-600">${originalPriceFormatted}</span> → <span class="text-green-600">${convertedPriceFormatted}</span>`;
    } else if (dish.converted_price !== null && dish.converted_price !== undefined) {
        const convertedPriceFormatted = formatPrice(dish.converted_price, targetCurrency);
        displayPrice = `<span class="text-green-600">${convertedPriceFormatted}</span>`;
    } else {
        displayPrice = `<span class="text-blue-600">${originalPriceFormatted}</span>`;
    }

    return `<div class="pt-3 border-t border-gray-200"><p class="text-2xl font-semibold text-gray-900">${displayPrice}</p></div>`;
}

// ============================================================================
// Image Gallery
// ============================================================================

/**
 * Open image gallery modal.
 * @param {string[]} imageUrls - Array of image URLs
 * @param {number} startIndex - Starting image index
 */
function openImageGallery(imageUrls, startIndex = 0) {
    if (!imageUrls || imageUrls.length === 0) {
        return;
    }

    state.galleryImages = imageUrls;
    state.galleryCurrentIndex = Math.max(0, Math.min(startIndex, imageUrls.length - 1));
    
    updateGalleryImage(true);
    elements.galleryModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    
    // Prevent default image drag behavior
    if (elements.galleryImage) {
        elements.galleryImage.addEventListener("dragstart", (e) => e.preventDefault());
        elements.galleryImage.addEventListener("contextmenu", (e) => e.preventDefault());
    }
}

/**
 * Close image gallery modal.
 */
function closeImageGallery() {
    elements.galleryModal.classList.add("hidden");
    document.body.style.overflow = "";
    state.galleryImages = [];
    state.galleryCurrentIndex = 0;
    state.galleryIsDragging = false;
    state.galleryDragOffset = 0;
    state.galleryTouchStartX = null;
    state.galleryTouchStartY = null;
    
    if (elements.gallerySlider) {
        elements.gallerySlider.style.transform = "translateX(0)";
        elements.gallerySlider.classList.remove("gallery-sliding");
    }
}

/**
 * Update gallery image display with smooth transition.
 */
function updateGalleryImage(immediate = false) {
    if (state.galleryImages.length === 0) {
        return;
    }

    const currentUrl = state.galleryImages[state.galleryCurrentIndex];
    
    // Reset transform
    if (elements.gallerySlider) {
        if (immediate) {
            elements.gallerySlider.style.transform = "translateX(0)";
            elements.gallerySlider.classList.remove("gallery-sliding");
        } else {
            elements.gallerySlider.style.transform = "translateX(0)";
        }
    }
    
    state.galleryDragOffset = 0;
    
    // Fade out, change image, fade in (only if not immediate)
    if (elements.galleryImage) {
        if (!immediate) {
            elements.galleryImage.style.opacity = "0";
            
            setTimeout(() => {
                elements.galleryImage.src = currentUrl;
                elements.galleryImage.alt = `Image ${state.galleryCurrentIndex + 1} of ${state.galleryImages.length}`;
                
                // Fade in after image loads
                const fadeIn = () => {
                    elements.galleryImage.style.opacity = "1";
                };
                
                if (elements.galleryImage.complete) {
                    // Image already loaded (cached)
                    fadeIn();
                } else {
                    elements.galleryImage.onload = fadeIn;
                    elements.galleryImage.onerror = fadeIn; // Fade in even on error
                }
            }, 150);
        } else {
            // Immediate update - no fade
            elements.galleryImage.src = currentUrl;
            elements.galleryImage.alt = `Image ${state.galleryCurrentIndex + 1} of ${state.galleryImages.length}`;
            elements.galleryImage.style.opacity = "1";
        }
    }
    
    if (elements.galleryCurrent) {
        elements.galleryCurrent.textContent = state.galleryCurrentIndex + 1;
    }
    if (elements.galleryTotal) {
        elements.galleryTotal.textContent = state.galleryImages.length;
    }

    if (elements.galleryPrev) {
        elements.galleryPrev.style.opacity = state.galleryCurrentIndex === 0 ? "0.5" : "1";
        elements.galleryPrev.style.pointerEvents = state.galleryCurrentIndex === 0 ? "none" : "auto";
    }
    if (elements.galleryNext) {
        elements.galleryNext.style.opacity = state.galleryCurrentIndex === state.galleryImages.length - 1 ? "0.5" : "1";
        elements.galleryNext.style.pointerEvents = state.galleryCurrentIndex === state.galleryImages.length - 1 ? "none" : "auto";
    }
}

/**
 * Navigate to next image in gallery with smooth animation.
 */
function galleryNext() {
    if (state.galleryImages.length === 0) {
        return;
    }
    if (state.galleryCurrentIndex >= state.galleryImages.length - 1) {
        return;
    }
    state.galleryCurrentIndex = state.galleryCurrentIndex + 1;
    updateGalleryImage();
}

/**
 * Navigate to previous image in gallery with smooth animation.
 */
function galleryPrev() {
    if (state.galleryImages.length === 0) {
        return;
    }
    if (state.galleryCurrentIndex <= 0) {
        return;
    }
    state.galleryCurrentIndex = state.galleryCurrentIndex - 1;
    updateGalleryImage();
}

/**
 * Handle touch/mouse start for swipe detection.
 * @param {TouchEvent|MouseEvent} e - Touch or mouse event
 */
function handleGalleryDragStart(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    state.galleryTouchStartX = clientX;
    state.galleryTouchStartY = clientY;
    state.galleryIsDragging = true;
    state.galleryDragOffset = 0;
    state.galleryDragStartTime = Date.now();
    
    if (elements.gallerySlider) {
        elements.gallerySlider.classList.add("gallery-sliding");
    }
    
    if (e.touches) {
        e.preventDefault();
    }
}

/**
 * Handle touch/mouse move for swipe with smooth following.
 * @param {TouchEvent|MouseEvent} e - Touch or mouse event
 */
function handleGalleryDragMove(e) {
    if (!state.galleryIsDragging || state.galleryTouchStartX === null) {
        return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const diffX = state.galleryTouchStartX - clientX;
    const diffY = state.galleryTouchStartY - clientY;
    
    // Only handle horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.touches) {
            e.preventDefault();
        }
        
        // Calculate drag offset with resistance at edges
        let offset = diffX;
        
        // Add resistance at boundaries
        if (state.galleryCurrentIndex === 0 && offset < 0) {
            offset = offset * 0.3; // Resist dragging past first image
        } else if (state.galleryCurrentIndex === state.galleryImages.length - 1 && offset > 0) {
            offset = offset * 0.3; // Resist dragging past last image
        }
        
        state.galleryDragOffset = offset;
        
        // Update transform in real-time for smooth following
        if (elements.gallerySlider) {
            elements.gallerySlider.style.transform = `translateX(${offset}px)`;
        }
    }
}

/**
 * Handle touch/mouse end for swipe with smooth animation.
 * @param {TouchEvent|MouseEvent} e - Touch or mouse event
 */
function handleGalleryDragEnd(e) {
    if (!state.galleryIsDragging) {
        return;
    }
    
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    
    const diffX = state.galleryTouchStartX - clientX;
    const diffY = state.galleryTouchStartY - clientY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    state.galleryIsDragging = false;
    
    // Determine if we should change images
    const threshold = 100; // Minimum swipe distance
    const velocityThreshold = 0.3; // Minimum velocity for quick swipe
    
    if (absDiffX > absDiffY && absDiffX > threshold) {
        // Swipe detected - change image
        if (diffX > 0) {
            // Swiped left - next image
            galleryNext();
        } else {
            // Swiped right - previous image
            galleryPrev();
        }
    } else if (absDiffX > 30) {
        // Small swipe - check velocity
        const timeDiff = Date.now() - (state.galleryDragStartTime || Date.now());
        const velocity = absDiffX / Math.max(timeDiff, 1);
        
        if (velocity > velocityThreshold) {
            // Quick swipe - change image
            if (diffX > 0) {
                galleryNext();
            } else {
                galleryPrev();
            }
        } else {
            // Slow swipe - snap back
            updateGalleryImage();
        }
    } else {
        // No significant swipe - snap back
        updateGalleryImage();
    }
    
    state.galleryTouchStartX = null;
    state.galleryTouchStartY = null;
    state.galleryDragOffset = 0;
    
    if (elements.gallerySlider) {
        elements.gallerySlider.classList.remove("gallery-sliding");
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Initialize event listeners.
 */
function initEventListeners() {
    if (!elements.uploadArea || !elements.fileInput) {
        console.error("Required upload elements not found");
        return;
    }

    // File input change - the main handler for file selection
    elements.fileInput.addEventListener("change", handleFileInputChange);
    
    // Keyboard accessibility for upload area
    elements.uploadArea.addEventListener("keydown", handleKeyPress);
    
    // Drag and drop support
    elements.uploadArea.addEventListener("dragover", handleDragOver);
    elements.uploadArea.addEventListener("dragleave", handleDragLeave);
    elements.uploadArea.addEventListener("drop", handleDrop);
    
    // Note: No click handler needed - native <label for="file-input"> behavior
    // automatically opens the file picker when the label is clicked

    // Image gallery: delegate click events to dish images
    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("dish-image")) {
            const imageUrlsJson = e.target.getAttribute("data-image-urls");
            if (imageUrlsJson) {
                try {
                    const imageUrls = JSON.parse(imageUrlsJson);
                    openImageGallery(imageUrls, 0);
                } catch (error) {
                    console.error("Failed to parse image URLs:", error);
                }
            }
        }
    });

    // New upload button
    if (elements.newUploadBtn) {
        elements.newUploadBtn.addEventListener("click", startNewUpload);
    }

    // Settings modal events
    elements.settingsButton.addEventListener("click", openSettings);
    elements.closeSettings.addEventListener("click", closeSettingsModal);
    elements.saveSettings.addEventListener("click", handleSaveSettings);

    // Close modal on backdrop click
    elements.settingsModal.addEventListener("click", (e) => {
        if (e.target === elements.settingsModal) {
            closeSettingsModal();
        }
    });

    // Close modal on Escape key
    elements.settingsModal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSettingsModal();
        }
    });

    // Gallery modal events
    if (elements.galleryClose) {
        elements.galleryClose.addEventListener("click", closeImageGallery);
    }
    if (elements.galleryPrev) {
        elements.galleryPrev.addEventListener("click", galleryPrev);
    }
    if (elements.galleryNext) {
        elements.galleryNext.addEventListener("click", galleryNext);
    }
    if (elements.galleryImageContainer) {
        // Touch events for mobile
        elements.galleryImageContainer.addEventListener("touchstart", handleGalleryDragStart, { passive: false });
        elements.galleryImageContainer.addEventListener("touchmove", handleGalleryDragMove, { passive: false });
        elements.galleryImageContainer.addEventListener("touchend", handleGalleryDragEnd, { passive: false });
        
        // Mouse events for desktop drag
        elements.galleryImageContainer.addEventListener("mousedown", (e) => {
            if (!elements.galleryModal.classList.contains("hidden")) {
                e.preventDefault();
                handleGalleryDragStart(e);
            }
        });
    }
    
    // Global mouse events for drag (only active when gallery is open)
    document.addEventListener("mousemove", (e) => {
        if (state.galleryIsDragging && !elements.galleryModal.classList.contains("hidden")) {
            handleGalleryDragMove(e);
        }
    });
    
    document.addEventListener("mouseup", (e) => {
        if (state.galleryIsDragging && !elements.galleryModal.classList.contains("hidden")) {
            handleGalleryDragEnd(e);
        }
    });
    if (elements.galleryModal) {
        elements.galleryModal.addEventListener("click", (e) => {
            if (e.target === elements.galleryModal) {
                closeImageGallery();
            }
        });
    }

    // Gallery keyboard navigation
    document.addEventListener("keydown", (e) => {
        if (!elements.galleryModal || elements.galleryModal.classList.contains("hidden")) {
            return;
        }

        if (e.key === "Escape") {
            closeImageGallery();
        } else if (e.key === "ArrowLeft") {
            galleryPrev();
        } else if (e.key === "ArrowRight") {
            galleryNext();
        }
    });
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize application.
 */
function init() {
    initSettings();
    initEventListeners();
}

// Start application when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
