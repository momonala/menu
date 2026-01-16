"""Data models for menu translation application."""

from pydantic import BaseModel
from pydantic import Field


class OpenAIDishResponse(BaseModel):
    """Represents a dish in the OpenAI API response."""

    name: str
    english_name: str | None = None
    description: str
    pronunciation: str
    original_text: str
    price: str | None = None
    price_numeric: float | None = None
    allergies: list[str] = []


class OpenAIResponse(BaseModel):
    """Represents the complete OpenAI API response."""

    source_language: str
    country: str
    dishes: list[OpenAIDishResponse]
    original_currency: str | None = None


class MenuDish(BaseModel):
    """Represents a single dish from a translated menu."""

    name: str
    english_name: str
    description: str
    image_urls: list[str] | None = None
    original_text: str
    pronunciation: str
    price: str | None = None
    converted_price: float | None = None
    allergies: list[str] = []


class MenuTranslation(BaseModel):
    """Represents a complete translated menu."""

    dishes: list[MenuDish]
    source_language: str
    country: str
    original_currency: str | None = None
    exchange_rate_to_eur: float | None = None
    target_currency: str = Field(default="EUR")
