"""Brave Search API image search service."""

import logging
import time

import requests
from joblib import Memory

from src.config import CACHE_DIR

logger = logging.getLogger(__name__)


class ImageSearchError(Exception):
    """Raised when image search fails."""


memory = Memory(CACHE_DIR / "image_search_brave", verbose=0)

BRAVE_API_BASE_URL = "https://api.search.brave.com/res/v1/images/search"

BRAVE_LANGUAGE_TO_PARAMS = {
    "Arabic": {
        "search_lang": "ar",
        "country": "SA",
    },
    "Basque": {
        "search_lang": "eu",
        "country": "ES",
    },
    "Bengali": {
        "search_lang": "bn",
        "country": "IN",
    },
    "Bulgarian": {
        "search_lang": "bg",
        "country": "ALL",
    },
    "Catalan": {
        "search_lang": "ca",
        "country": "ES",
    },
    "Chinese (Simplified)": {
        "search_lang": "zh-hans",
        "country": "CN",
    },
    "Chinese (Traditional)": {
        "search_lang": "zh-hant",
        "country": "TW",
    },
    "Croatian": {
        "search_lang": "hr",
        "country": "ALL",
    },
    "Czech": {
        "search_lang": "cs",
        "country": "ALL",
    },
    "Danish": {
        "search_lang": "da",
        "country": "DK",
    },
    "Dutch": {
        "search_lang": "nl",
        "country": "NL",
    },
    "English": {
        "search_lang": "en",
        "country": "US",
    },
    "English (United Kingdom)": {
        "search_lang": "en-gb",
        "country": "GB",
    },
    "Estonian": {
        "search_lang": "et",
        "country": "ALL",
    },
    "Finnish": {
        "search_lang": "fi",
        "country": "FI",
    },
    "French": {
        "search_lang": "fr",
        "country": "FR",
    },
    "Galician": {
        "search_lang": "gl",
        "country": "ES",
    },
    "German": {
        "search_lang": "de",
        "country": "DE",
    },
    "Greek": {
        "search_lang": "el",
        "country": "GR",
    },
    "Gujarati": {
        "search_lang": "gu",
        "country": "IN",
    },
    "Hebrew": {
        "search_lang": "he",
        "country": "ALL",
    },
    "Hindi": {
        "search_lang": "hi",
        "country": "IN",
    },
    "Hungarian": {
        "search_lang": "hu",
        "country": "ALL",
    },
    "Icelandic": {
        "search_lang": "is",
        "country": "ALL",
    },
    "Italian": {
        "search_lang": "it",
        "country": "IT",
    },
    "Japanese": {
        "search_lang": "jp",  # Brave-specific (not ISO)
        "country": "JP",
    },
    "Kannada": {
        "search_lang": "kn",
        "country": "IN",
    },
    "Korean": {
        "search_lang": "ko",
        "country": "KR",
    },
    "Latvian": {
        "search_lang": "lv",
        "country": "ALL",
    },
    "Lithuanian": {
        "search_lang": "lt",
        "country": "ALL",
    },
    "Malay": {
        "search_lang": "ms",
        "country": "MY",
    },
    "Malayalam": {
        "search_lang": "ml",
        "country": "IN",
    },
    "Marathi": {
        "search_lang": "mr",
        "country": "IN",
    },
    "Norwegian Bokmål": {
        "search_lang": "nb",
        "country": "NO",
    },
    "Polish": {
        "search_lang": "pl",
        "country": "PL",
    },
    "Portuguese (Brazil)": {
        "search_lang": "pt-br",
        "country": "BR",
    },
    "Portuguese (Portugal)": {
        "search_lang": "pt-pt",
        "country": "PT",
    },
    "Punjabi": {
        "search_lang": "pa",
        "country": "IN",
    },
    "Romanian": {
        "search_lang": "ro",
        "country": "ALL",
    },
    "Russian": {
        "search_lang": "ru",
        "country": "RU",
    },
    "Serbian": {
        "search_lang": "sr",
        "country": "ALL",
    },
    "Slovak": {
        "search_lang": "sk",
        "country": "ALL",
    },
    "Slovenian": {
        "search_lang": "sl",
        "country": "ALL",
    },
    "Spanish": {
        "search_lang": "es",
        "country": "ES",
    },
    "Swedish": {
        "search_lang": "sv",
        "country": "SE",
    },
    "Tamil": {
        "search_lang": "ta",
        "country": "IN",
    },
    "Telugu": {
        "search_lang": "te",
        "country": "IN",
    },
    "Thai": {
        "search_lang": "th",
        "country": "ALL",
    },
    "Turkish": {
        "search_lang": "tr",
        "country": "TR",
    },
    "Ukrainian": {
        "search_lang": "uk",
        "country": "ALL",
    },
    "Vietnamese": {
        "search_lang": "vi",
        "country": "ALL",
    },
}


@memory.cache
def cached_brave_search(dish_name: str, language: str, api_key: str) -> list[str]:
    """Cached Brave Search API image search.

    Args:
        dish_name: Name of the dish to search for.
        language: Language of the dish.
        api_key: Brave Search API key.

    Returns:
        List of image URLs (may be empty if no suitable images found).

    Raises:
        ImageSearchError: If the API request fails.
    """
    headers = {
        "X-Subscription-Token": api_key,
        "Accept": "application/json",
    }

    search_lang = BRAVE_LANGUAGE_TO_PARAMS.get(language, {}).get("search_lang")
    country = BRAVE_LANGUAGE_TO_PARAMS.get(language, {}).get("country")
    query = f"{dish_name}"
    # if we cant search by language, append the language to the search query
    if not search_lang:
        query = f"{query} food {language}"

    params = {
        "q": query,
        "count": 10,
        "search_lang": search_lang or "en",
        "country": country or "ALL",
        "spellcheck_off": "true",
    }

    try:
        response = requests.get(BRAVE_API_BASE_URL, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        raise ImageSearchError(f"Brave API request failed for '{params=}': {e}") from e
    except ValueError as e:
        raise ImageSearchError(f"Invalid JSON response from Brave API for '{params=}': {e}") from e

    # Check for API-level errors
    if "error" in data:
        raise ImageSearchError(f"Brave API error for '{params=}': {data['error']}")

    results = data.get("results", [])
    if not results:
        logger.warning(f"No images found for {params=}")

    image_urls = []
    for result in results:
        properties = result.get("properties", {})
        width, height = properties.get("width", 0), properties.get("height", 0)
        if width < 200 or height < 200:
            logger.debug(f"Skipping small image {width}x{height}: {properties.get('url')}")
            continue
        image_url = properties.get("url")
        if image_url:
            image_urls.append(image_url)

    if not image_urls:
        logger.warning(f"No valid image URLs for {params=}")

    logger.info(f"{len(image_urls)} images found for Brave Image Search: {params=}")
    time.sleep(0.7)
    return image_urls
