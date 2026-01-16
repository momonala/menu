"""OpenAI Vision API service for menu translation."""

import base64
import logging
import time
from pathlib import Path

from joblib import Memory
from openai import Client

from src.config import CACHE_DIR
from src.config import DEFAULT_OPENAI_MODEL
from src.config import DEFAULT_TARGET_CURRENCY
from src.datamodels import MenuDish
from src.datamodels import MenuTranslation
from src.datamodels import OpenAIResponse
from src.services.forex_service import get_exchange_rate
from src.values import OPENAI_API_KEY

logger = logging.getLogger(__name__)

memory = Memory(CACHE_DIR / "openai_translations", verbose=0)


class TranslationError(Exception):
    """Exception raised for translation errors."""


# Model pricing per 1M tokens (input, output)
MODEL_PRICING = {
    "gpt-4.1-nano": {"input": 0.20, "output": 0.80},
    "gpt-5-mini": {"input": 0.25, "output": 2.00},
    "gpt-4.1-mini": {"input": 0.80, "output": 3.20},
    "gpt-5.2": {"input": 1.75, "output": 14.00},
    "gpt-4.1": {"input": 3.00, "output": 12.00},
    "gpt-5.2-pro": {"input": 21.00, "output": 168.00},
}


def calculate_request_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate the cost of an OpenAI API request.

    Args:
        model: Model name (e.g., "gpt-5-mini").
        prompt_tokens: Number of input tokens.
        completion_tokens: Number of output tokens.

    Returns:
        Total cost in USD.
    """
    pricing = MODEL_PRICING.get(model, MODEL_PRICING.get("gpt-5-mini"))
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return input_cost + output_cost


def _log_usage(model: str, usage, finish_reason: str, elapsed_time: float) -> None:
    """Log OpenAI API usage, cost, and timing."""
    prompt_tokens = usage.prompt_tokens
    completion_tokens = usage.completion_tokens
    total_tokens = usage.total_tokens
    cost = calculate_request_cost(model, prompt_tokens, completion_tokens)

    logger.info(
        f"Token usage - Model: {model}, Input: {prompt_tokens}, Output: {completion_tokens}, "
        f"Total: {total_tokens}, Cost: ${cost:.6f}, Finish: {finish_reason}, Time: {elapsed_time:.2f}s"
    )


def build_prompt(target_currency: str) -> str:
    """Build the OpenAI prompt with target currency.

    Args:
        target_currency: Target currency code (e.g., EUR, USD, GBP).

    Returns:
        Formatted prompt string.
    """
    return """Analyze this menu image and extract all menu items. For each dish:
1. Translate the dish name to English
2. Provide a simple 1-3 sentence explanation of what the dish is, how its cooked or prepared, and any other relevant details.
3. Provide a pronunciation guide for the dish name (layman's how to say it, not the phonetic spelling)
4. Include the original text from the menu
5. Extract the price if visible (include currency symbol/number, or null if not available)
6. If a price is found, identify the currency code (e.g., USD, EUR, GBP, JPY, etc.)
7. Identify likely allergens from the following categories: "peanuts", "gluten", "meat". Only include allergens that are likely present based on the dish name and typical ingredients. Use an empty array if none apply.

Return a JSON object with this structure:
{
  "source_language": "detected language name",
  "country": "country name from menu (e.g., Vietnam, France, Italy, etc.)",
  "original_currency": "currency code from menu (e.g., USD, EUR, GBP) or null if no prices found",
  "dishes": [
    {
      "name": "Original dish name from menu. Do not include price, formatters, symbols or description here",
      "english_name": "English dish name in plain text. Do not include price, formatters, symbols or description here",
      "description": "1-3 sentence explanation",
      "pronunciation": "layman's pronunciation guide",
      "original_text": "original text from menu",
      "price": "price with currency symbol or null",
      "price_numeric": numeric_price_value or null,
      "allergies": ["peanuts", "gluten", "meat"] or []
    }
  ]
}

EXAMPLE RETURN JSON:
{
  "source_language": "Vietnamese",
  "country": "Vietnam",
  "original_currency": "VND",
  "dishes": [
    {
      "name": "Bắp non xào đông cô",
      "english_name": "Stir-fried baby corn with shiitake mushrooms",
      "description": "A simple Vietnamese stir-fry made with baby corn and shiitake mushrooms, quickly cooked over high heat with garlic and seasoning. It's usually served as a light vegetable side dish and may be finished with a mild savory sauce.",
      "pronunciation": "bup non xao dong co",
      "original_text": "Bắp non xào đông cô  - .....20.000đ",
      "price": "20.000đ",
      "price_numeric": 20000,
      "allergies": []
    }
  ]
}

Only include actual dishes/food items, not section headers or other text."""


def _call_openai_api(image_data_base64: str, prompt: str, model: str) -> OpenAIResponse:
    """Call OpenAI API with Pydantic structured output.

    Args:
        image_data_base64: Base64 encoded image data.
        prompt: Prompt text.
        model: Model name.

    Returns:
        Parsed OpenAIResponse Pydantic model.

    Raises:
        TranslationError: If response is invalid or truncated.
    """
    start_time = time.time()
    client = Client(api_key=OPENAI_API_KEY)

    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_data_base64}"},
                    },
                ],
            }
        ],
        response_format=OpenAIResponse,
    )

    elapsed_time = time.time() - start_time

    if not response.choices:
        raise TranslationError("OpenAI API returned no choices")

    choice = response.choices[0]
    finish_reason = choice.finish_reason

    _log_usage(model, response.usage, finish_reason, elapsed_time)

    if finish_reason == "length":
        raise TranslationError(
            f"Response truncated at token limit. "
            f"Received {response.usage.completion_tokens} output tokens. "
            f"Menu may be too complex or response too long."
        )

    parsed = choice.message.parsed
    if parsed is None:
        raise TranslationError(f"Failed to parse OpenAI response (finish_reason: {finish_reason})")

    return parsed


@memory.cache
def _cached_translate(image_data_base64: str, prompt: str, model: str) -> dict:
    """Cached translation - returns dict for pickle compatibility.

    Args:
        image_data_base64: Base64 encoded image data (cache key).
        prompt: Prompt text (cache key).
        model: Model name (cache key).

    Returns:
        OpenAIResponse as dict (for joblib pickle compatibility).
    """
    result = _call_openai_api(image_data_base64, prompt, model)
    return result.model_dump()


def translate_menu_image(
    image_path: Path,
    target_currency: str = DEFAULT_TARGET_CURRENCY,
    model: str = DEFAULT_OPENAI_MODEL,
) -> MenuTranslation:
    """Translate a menu image using OpenAI Vision API.

    Args:
        image_path: Path to the menu image file.
        target_currency: Target currency code for exchange rate.
        model: OpenAI model to use (e.g., "gpt-5-mini", "gpt-5.2", "gpt-5.2-pro").

    Returns:
        MenuTranslation object with translated dishes.

    Raises:
        TranslationError: If OpenAI response is invalid or missing required fields.
    """
    with image_path.open("rb") as f:
        image_bytes = f.read()

    image_data = base64.b64encode(image_bytes).decode("utf-8")
    prompt = build_prompt(target_currency)

    # Get cached result (dict) and reconstruct Pydantic model
    cached_dict = _cached_translate(image_data, prompt, model)
    openai_response = OpenAIResponse.model_validate(cached_dict)
    print(openai_response)

    logger.info(
        f"Number of dishes: {len(openai_response.dishes)}, Language: {openai_response.source_language}, Currency: {openai_response.original_currency}, Country: {openai_response.country}"
    )

    exchange_rate = None
    if openai_response.original_currency:
        if openai_response.original_currency == target_currency:
            exchange_rate = 1.0
        else:
            exchange_rate = get_exchange_rate(openai_response.original_currency, target_currency)
            if exchange_rate is None:
                logger.warning(
                    f"Failed to fetch exchange rate for {openai_response.original_currency} to {target_currency}. "
                    "Prices will not be converted."
                )

    dishes = []
    for dish in openai_response.dishes:
        converted_price = None
        if dish.price_numeric is not None and exchange_rate is not None:
            converted_price = dish.price_numeric * exchange_rate

        dishes.append(
            MenuDish(
                name=dish.name,
                english_name=dish.english_name or dish.name,
                description=dish.description,
                image_urls=None,
                original_text=dish.original_text,
                pronunciation=dish.pronunciation,
                price=dish.price,
                converted_price=converted_price,
                allergies=dish.allergies,
            )
        )

    return MenuTranslation(
        dishes=dishes,
        source_language=openai_response.source_language,
        country=openai_response.country,
        original_currency=openai_response.original_currency,
        exchange_rate_to_eur=exchange_rate,
        target_currency=target_currency,
    )
