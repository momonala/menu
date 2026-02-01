"""Flask application for menu translation."""

import logging
from pathlib import Path

from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request

from src.config import DEFAULT_OPENAI_MODEL
from src.config import DEFAULT_TARGET_CURRENCY
from src.config import FLASK_PORT
from src.config import MAX_UPLOAD_SIZE_MB
from src.image_validation import ImageValidationError
from src.image_validation import save_uploaded_image
from src.services.forex_service import get_exchange_rate
from src.services.forex_service import get_supported_currencies
from src.services.image_search_brave import ImageSearchError
from src.services.image_search_brave import cached_brave_search
from src.services.openai_service import TranslationError
from src.services.openai_service import translate_menu_image
from src.values import BRAVE_API_KEY

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("werkzeug").setLevel(logging.WARNING)

project_root = Path(__file__).parent.parent
app = Flask(
    __name__,
    template_folder=str(project_root / "templates"),
    static_folder=str(project_root / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE_MB * 1024 * 1024


@app.route("/")
def index():
    """Serve the main page."""
    return render_template("index.html")


@app.route("/status")
def status():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


@app.route("/api/translate", methods=["POST"])
def translate_menu():
    """Translate a menu image (without images).

    Returns:
        JSON response with translated menu data (dishes without image_urls).
    """
    if "image" not in request.files:
        return jsonify({"status": "error", "message": "No image file provided"}), 400

    file = request.files["image"]
    target_currency = request.form.get("currency", DEFAULT_TARGET_CURRENCY)
    model = request.form.get("model", DEFAULT_OPENAI_MODEL)
    file_content = file.read()
    filename = file.filename
    image_path = None
    try:
        image_path = save_uploaded_image(file_content, filename)
    except ImageValidationError as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    try:
        translation = translate_menu_image(image_path, target_currency, model)

        # Return dishes without images - frontend will fetch them separately
        dishes_data = []
        for dish in translation.dishes:
            dish.image_urls = None
            dishes_data.append(dish.model_dump())

        return jsonify(
            {
                "status": "success",
                "data": {
                    "source_language": translation.source_language,
                    "dishes": dishes_data,
                    "original_currency": translation.original_currency,
                    "exchange_rate_to_eur": translation.exchange_rate_to_eur,
                    "target_currency": translation.target_currency,
                },
            }
        )
    except TranslationError as e:
        logger.error(f"Translation error: {e}")
        return jsonify({"status": "error", "message": f"Translation failed: {e}"}), 500
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({"status": "error", "message": "An unexpected error occurred during translation"}), 500
    finally:
        if image_path:
            image_path.unlink(missing_ok=True)


@app.route("/api/currencies")
def currencies():
    """Return list of supported currencies (code + name) from the exchange rate API."""
    currencies = get_supported_currencies()
    return jsonify({"status": "success", "currencies": currencies})


@app.route("/api/exchange-rate")
def exchange_rate():
    """Return exchange rate between two currencies.

    Query params: from (source currency code), to (target currency code).
    Returns JSON { "status": "success", "rate": <float> } or 400 on error.
    """
    from_currency = request.args.get("from", "").strip().upper()
    to_currency = request.args.get("to", "").strip().upper()
    if not from_currency or not to_currency:
        return jsonify({"status": "error", "message": "Missing 'from' or 'to' currency parameter"}), 400
    try:
        rate = get_exchange_rate(from_currency, to_currency)
        return jsonify({"status": "success", "rate": rate})
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/api/fetch-images", methods=["POST"])
def fetch_images():
    """Fetch images for dishes.

    Expected JSON body:
        {
            "dishes": [{"name": "Dish Name", ...}, ...],
            "language": "English",
            "include_images": true
        }

    Returns:
        JSON response with image URLs for each dish.
    """
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "No JSON data provided"}), 400

    dishes = data.get("dishes", [])
    language = data.get("language", "English")
    include_images = data.get("include_images", True)

    if not include_images:
        return jsonify(
            {"status": "success", "images": {dish.get("name"): None for dish in dishes if dish.get("name")}}
        )

    images_data = {}
    for dish in dishes:
        dish_name = dish.get("name")
        if not dish_name:
            continue

        try:
            search_results = cached_brave_search(dish_name, language, BRAVE_API_KEY)
            if search_results:
                images_data[dish_name] = search_results
            else:
                placeholder_url = f"https://via.placeholder.com/400x300?text={dish_name.replace(' ', '+')}"
                images_data[dish_name] = [placeholder_url]
        except ImageSearchError as e:
            logger.warning(f"Image search failed for '{dish_name}': {e}")
            images_data[dish_name] = None

    return jsonify({"status": "success", "images": images_data})


def main():
    """Run the Flask application."""
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=False)


if __name__ == "__main__":
    main()
