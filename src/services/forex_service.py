"""Forex exchange rate service."""

import logging

import pycountry
import requests
from babel.numbers import get_currency_symbol
from babel import Locale
from joblib import Memory

from src.config import CACHE_DIR

logger = logging.getLogger(__name__)

memory = Memory(CACHE_DIR / "forex_rates", verbose=0)


def _flag_emoji(alpha_2: str) -> str:
    """Return regional indicator flag emoji for a 2-letter ISO 3166-1 alpha-2 code."""
    if len(alpha_2) != 2 or not alpha_2.isalpha():
        return ""
    return "".join(chr(0x1F1E6 - ord("A") + ord(c)) for c in alpha_2.upper())


@memory.cache
def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    """Cached exchange rate fetch from exchangerate-api.io.

    Args:
        from_currency: Source currency code (e.g., "USD").
        to_currency: Target currency code (e.g., "EUR").

    Returns:
        Exchange rate as float (e.g., 1.08 for USD to EUR).

    Raises:
        ValueError: If API request fails or returns invalid data.
    """
    if from_currency == to_currency:
        return 1.0

    url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"

    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()

        if "rates" not in data or to_currency not in data["rates"]:
            raise ValueError(f"Currency {to_currency} not found in exchange rate data")

        rate = float(data["rates"][to_currency])
        if rate <= 0:
            raise ValueError(f"Invalid exchange rate: {rate}")

        return rate
    except requests.RequestException as e:
        logger.error(f"Failed to fetch exchange rate: {e}")
        raise ValueError(f"Failed to fetch exchange rate: {e}") from e
    except (KeyError, ValueError, TypeError) as e:
        logger.error(f"Invalid exchange rate response: {e}")
        raise ValueError(f"Invalid exchange rate response: {e}") from e


@memory.cache
def get_supported_currency_codes() -> list[str]:
    """Fetch list of supported currency codes from the exchange rate API.

    Returns:
        Sorted list of ISO 4217 currency codes supported by the API.

    Raises:
        ValueError: If API request fails or returns invalid data.
    """
    url = "https://api.exchangerate-api.com/v4/latest/USD"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch currencies: {e}")
        raise ValueError(f"Failed to fetch currencies: {e}") from e

    if "rates" not in data or not isinstance(data["rates"], dict):
        raise ValueError("Invalid currency list response")

    return sorted(data["rates"].keys())


def get_supported_currencies() -> list[dict[str, str]]:
    """Fetch supported currencies from the API with display names, symbol, and flag emoji.

    Returns:
        List of {"code": str, "name": str, "emoji": str, "symbol": str} sorted by code.
        Name from pycountry; symbol from babel (locale en_US); emoji from first two letters.
    """
    locale = Locale("en_US")
    codes = get_supported_currency_codes()  # already sorted by code
    result = []
    for c in codes:
        currency = pycountry.currencies.get(alpha_3=c)
        name = currency.name if currency else c
        emoji = _flag_emoji(c[:2]) if len(c) >= 2 else ""
        try:
            symbol = get_currency_symbol(c, locale=locale) or f"{c} "
        except Exception:
            symbol = f"{c} "
        result.append({"code": c, "name": name, "emoji": emoji, "symbol": symbol})
    return result
