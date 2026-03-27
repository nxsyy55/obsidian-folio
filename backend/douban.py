import requests
import json
import os
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from firecrawl import Firecrawl

load_dotenv()
_firecrawl_app = Firecrawl(api_key=os.getenv("FIRECRAWL_API_KEY"))


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def _scrape_page(url, schema=None):
    """Fetch a page via Firecrawl.

    If schema is provided, uses Firecrawl's structured extraction.
    Otherwise, returns raw HTML.

    Args:
        url: The page URL to scrape.
        schema: Optional JSON schema for structured extraction.

    Returns:
        Extraction result dict or raw HTML string, or empty string/None on failure.
    """
    try:
        if schema:
            result = _firecrawl_app.scrape(
                url, formats=[{"type": "json", "prompt": "Extract the details according to the schema", "schema": schema}]
            )
            # Handle Pydantic model vs dict
            if isinstance(result, dict):
                data = result.get("json", {})
            else:
                try:
                    data = result.model_dump().get("json", {})
                except Exception:
                    data = getattr(result, "json", {})
            
            if callable(data):
                data = {}
            return data if isinstance(data, dict) else {}
        else:
            result = _firecrawl_app.scrape(url, formats=["html"])
            if isinstance(result, dict):
                return result.get("html", "")
            if hasattr(result, "html"):
                return result.html or ""
            return ""
    except Exception as e:
        print(f"Warning: Firecrawl failed for {url}: {e}")
        return {} if schema else ""


BOOK_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "The title of the book"},
        "subTitle": {"type": "string", "description": "The sub-title of the book"},
        "originalTitle": {"type": "string", "description": "The original title of the book"},
        "series": {"type": "string", "description": "The series the book belongs to"},
        "author": {"type": "array", "items": {"type": "string"}, "description": "List of authors"},
        "score": {"type": "string", "description": "Douban rating score"},
        "datePublished": {"type": "string", "description": "Publication date"},
        "translator": {"type": "array", "items": {"type": "string"}, "description": "List of translators"},
        "publisher": {"type": "string", "description": "The publisher"},
        "producer": {"type": "string", "description": "The producer/publishing house"},
        "isbn": {"type": "string", "description": "The ISBN-10 or ISBN-13"},
        "totalPage": {"type": "string", "description": "Total number of pages"},
        "price": {"type": "string", "description": "The price of the book"},
    },
    "required": ["title"],
}

MOVIE_SCHEMA = {
  "type": "object",
  "properties": {
    "title": {"type": "string", "description": "The Chinese title of the movie"},
    "originalTitle": {"type": "string", "description": "The original title of the movie"},
    "genre": {"type": "array", "items": {"type": "string"}, "description": "Genres"},
    "datePublished": {"type": "string", "description": "Release date"},
    "director": {"type": "array", "items": {"type": "string"}, "description": "Directors"},
    "score": {"type": "string", "description": "Douban rating score"},
    "country": {"type": "array", "items": {"type": "string"}, "description": "Countries/Regions of origin"},
    "IMDb": {"type": "string", "description": "IMDb ID"},
    "time": {"type": "string", "description": "Duration/Runtime"},
  },
  "required": ["title"]
}


def search_douban(query, media_type=None):
    """Search Douban for subjects matching the query.

    Args:
        query: Search string.
        media_type: Optional filter, e.g. "book", "movie", "teleplay".

    Returns:
        A list of dicts with keys: id, title, sub_title, type, year.
    """
    headers = {"User-Agent": DEFAULT_USER_AGENT}
    results = []

    # Determine which endpoints to hit
    endpoints = []
    if media_type == "book":
        endpoints = [("https://book.douban.com/j/subject_suggest", "book")]
    elif media_type in ("movie", "teleplay"):
        endpoints = [("https://movie.douban.com/j/subject_suggest", "movie")]
    else:
        # Search both
        endpoints = [
            ("https://book.douban.com/j/subject_suggest", "book"),
            ("https://movie.douban.com/j/subject_suggest", "movie"),
        ]

    for url, source in endpoints:
        try:
            resp = requests.get(url, params={"q": query}, headers=headers, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            continue

        for item in data:
            # book.douban.com uses "type": "b", movie uses "movie"/"teleplay" etc.
            raw_type = item.get("type", "")
            if raw_type == "b":
                item_type = "book"
            elif raw_type in ("movie", "teleplay", "tv"):
                item_type = raw_type
            else:
                item_type = source  # fallback to endpoint source

            entry = {
                "id": str(item.get("id", "")),
                "title": item.get("title", ""),
                "sub_title": item.get("sub_title", item.get("author_name", "")),
                "type": item_type,
                "year": item.get("year", ""),
            }
            if media_type and entry["type"] != media_type:
                continue
            results.append(entry)

    return results


def search_by_isbn(isbn, headers=None, cookies=None):
    """Look up a book on Douban by its ISBN.

    Args:
        isbn: The ISBN string.
        headers: Optional request headers dict.
        cookies: Optional cookies dict.

    Returns:
        A dict with id, title, type or None if not found.
    """
    url = f"https://book.douban.com/isbn/{isbn}/"
    req_headers = {"User-Agent": DEFAULT_USER_AGENT}
    if headers:
        req_headers.update(headers)
    try:
        resp = requests.get(
            url, headers=req_headers, cookies=cookies, timeout=15, allow_redirects=True
        )
        resp.raise_for_status()
    except Exception:
        return None

    # Extract doubanId from the final redirected URL
    final_url = resp.url
    match = re.search(r"/subject/(\d+)/", final_url)
    if not match:
        return None
    douban_id = match.group(1)

    # Extract title from the page
    soup = BeautifulSoup(resp.text, "html.parser")
    title_tag = soup.select_one("h1 span")
    title = title_tag.get_text(strip=True) if title_tag else ""

    return {"id": douban_id, "title": title, "type": "book"}


def _load_cache(cache_file):
    """Load the JSON cache from disk."""
    if cache_file and os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_cache(cache_file, cache):
    """Write the JSON cache back to disk."""
    if not cache_file:
        return
    try:
        dirname = os.path.dirname(cache_file)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _normalize_author(name):
    """Normalize author format from '[英] 乔治·奥威尔' to '英/乔治·奥威尔'."""
    name = name.strip()
    m = re.match(r"\[(.+?)\]\s*(.+)", name)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    return name


def _normalize_date(date_str):
    """Normalize date strings to YYYY-MM-DD format.

    Handles formats like: "2010-4-1", "2010-4", "2010年4月", "2010年4月1日".
    """
    if not date_str:
        return ""
    date_str = date_str.strip()

    # Try YYYY-M-D or YYYY-M format
    m = re.match(r"(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$", date_str)
    if m:
        year = m.group(1)
        month = m.group(2).zfill(2)
        day = m.group(3).zfill(2) if m.group(3) else "01"
        return f"{year}-{month}-{day}"

    # Try Chinese format: 2010年4月1日 or 2010年4月
    m = re.match(r"(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?", date_str)
    if m:
        year = m.group(1)
        month = m.group(2).zfill(2)
        day = m.group(3).zfill(2) if m.group(3) else "01"
        return f"{year}-{month}-{day}"

    return date_str


def _get_info_text(info_div, label):
    """Get the plain text that follows a <span class="pl"> label inside #info.

    Handles the pattern: <span class="pl">LABEL</span> text_node
    """
    if not info_div:
        return ""
    pl = info_div.find("span", class_="pl", string=re.compile(re.escape(label)))
    if not pl:
        return ""
    # The text might be in the next sibling text node, or in an <a> tag
    next_sib = pl.next_sibling
    while next_sib:
        if isinstance(next_sib, str):
            text = next_sib.strip()
            if text:
                return text
        elif next_sib.name == "a":
            return next_sib.get_text(strip=True)
        elif next_sib.name == "br":
            break
        next_sib = next_sib.next_sibling
    return ""


def _get_info_links(info_div, label):
    """Collect text from <a> tags following a label span inside #info.

    Used for fields like authors, translators where multiple <a> links follow the label.
    """
    if not info_div:
        return []
    pl = info_div.find("span", class_="pl", string=re.compile(re.escape(label)))
    if not pl:
        return []

    results = []
    # Walk through siblings after the label span
    next_sib = pl.next_sibling
    while next_sib:
        if hasattr(next_sib, "name"):
            if next_sib.name == "a":
                text = next_sib.get_text(strip=True)
                if text:
                    results.append(text)
            elif next_sib.name == "br":
                break
            elif next_sib.name == "span" and "pl" in next_sib.get("class", []):
                break
        next_sib = next_sib.next_sibling
    return results


def fetch_book_detail(douban_id, headers=None, cookies=None, config=None):
    """Fetch and parse book metadata from Douban.

    Args:
        douban_id: The Douban subject ID.
        headers: Optional request headers dict.
        cookies: Optional cookies dict.
        config: Optional config dict with cache_file and request_delay.

    Returns:
        A dict of book metadata, or None on failure.
    """
    config = config or {}
    cache_file = config.get("cache_file")
    delay = config.get("request_delay", 2)

    cache_key = f"book_{douban_id}"
    cache = _load_cache(cache_file)
    if not isinstance(cache, dict):
        cache = {}
    if cache_key in cache:
        return cache[cache_key]

    time.sleep(delay)

    url = f"https://book.douban.com/subject/{douban_id}/"

    # Fetch structured data via Firecrawl
    data = _scrape_page(url, schema=BOOK_SCHEMA)
    if not isinstance(data, dict) or not data.get("title"):
        # Fallback to HTML scrape if extraction failed or returned nothing
        html = _scrape_page(url)
        if not html:
            return None
        soup = BeautifulSoup(html, "html.parser")
        info_div = soup.select_one("#info")

        data = {
            "title": (soup.select_one("h1 span").get_text(strip=True) if soup.select_one("h1 span") else ""),
            "subTitle": _get_info_text(info_div, "副标题:"),
            "originalTitle": _get_info_text(info_div, "原作名:"),
            "series": _get_info_text(info_div, "丛书:"),
            "author": [_normalize_author(a) for a in _get_info_links(info_div, "作者")],
            "score": (soup.select_one("strong.rating_num").get_text(strip=True) if soup.select_one("strong.rating_num") else ""),
            "datePublished": _normalize_date(_get_info_text(info_div, "出版年:")),
            "translator": _get_info_links(info_div, "译者"),
            "publisher": _get_info_text(info_div, "出版社:"),
            "producer": _get_info_text(info_div, "出品方:"),
            "isbn": _get_info_text(info_div, "ISBN:"),
            "totalPage": _get_info_text(info_div, "页数:"),
            "price": _get_info_text(info_div, "定价:"),
        }

    # Normalize author names in extracted data
    if isinstance(data, dict):
        if "author" in data and isinstance(data["author"], list):
            data["author"] = [_normalize_author(a) for a in data["author"]]
        
        # Normalize date in extracted data
        if "datePublished" in data:
            data["datePublished"] = _normalize_date(data["datePublished"])

    result = {
        "doubanId": str(douban_id),
        "title": data.get("title", "") if isinstance(data, dict) else "",
        "subTitle": data.get("subTitle", "") if isinstance(data, dict) else "",
        "originalTitle": data.get("originalTitle", "") if isinstance(data, dict) else "",
        "series": data.get("series", "") if isinstance(data, dict) else "",
        "type": "book",
        "author": data.get("author", []) if isinstance(data, dict) else [],
        "score": data.get("score", "") if isinstance(data, dict) else "",
        "datePublished": data.get("datePublished", "") if isinstance(data, dict) else "",
        "translator": data.get("translator", []) if isinstance(data, dict) else [],
        "publisher": data.get("publisher", "") if isinstance(data, dict) else "",
        "producer": data.get("producer", "") if isinstance(data, dict) else "",
        "isbn": data.get("isbn", "") if isinstance(data, dict) else "",
        "url": url,
        "totalPage": data.get("totalPage", "") if isinstance(data, dict) else "",
        "price": data.get("price", "") if isinstance(data, dict) else "",
    }

    cache[cache_key] = result
    _save_cache(cache_file, cache)

    return result


def _split_title_original(full_title):
    """Split 'Chinese Title OriginalTitle (Year)' into (title, original_title)."""
    # Remove trailing year+markers like "‎ (1994)"
    full_title = re.sub(r"\s*\u200e?\s*\(\d{4}\)\s*$", "", full_title).strip()

    # Split on boundary between CJK and non-CJK
    cjk_pattern = re.compile(
        "^([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u00b7\uff1a\u201c\u201d"
        "\u2018\u2019\uff01\uff1f\u3001\u2014\u2026]+)\\s+(.+)$"
    )
    m = cjk_pattern.match(full_title)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return full_title, ""


def fetch_movie_detail(douban_id, headers=None, cookies=None, config=None):
    """Fetch movie/TV metadata from Douban.

    Uses the subject_abstract API first (reliable, no anti-bot), then
    falls back to page scraping for additional fields if possible.

    Args:
        douban_id: The Douban subject ID.
        headers: Optional request headers dict.
        cookies: Optional cookies dict.
        config: Optional config dict with cache_file and request_delay.

    Returns:
        A dict of movie metadata, or None on failure.
    """
    config = config or {}
    cache_file = config.get("cache_file")
    delay = config.get("request_delay", 2)

    cache_key = f"movie_{douban_id}"
    cache = _load_cache(cache_file)
    if not isinstance(cache, dict):
        cache = {}
    if cache_key in cache:
        return cache[cache_key]

    time.sleep(delay)

    url = f"https://movie.douban.com/subject/{douban_id}/"
    req_headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Referer": "https://movie.douban.com/",
    }

    # Primary: use the subject_abstract API (works without cookies)
    abstract_url = f"https://movie.douban.com/j/subject_abstract?subject_id={douban_id}"
    try:
        resp = requests.get(abstract_url, headers=req_headers, timeout=15)
        resp.raise_for_status()
        data = resp.json().get("subject", {})
    except Exception as e:
        print(f"Warning: Failed to fetch movie abstract for {douban_id}: {e}")
        return None

    if not data:
        print(f"Warning: No data returned for movie {douban_id}.")
        return None

    # Parse title and original title from the combined title field
    # Format: "肖申克的救赎 The Shawshank Redemption‎ (1994)"
    raw_title = data.get("title", "")
    title, original_title = _split_title_original(raw_title)

    # Type detection
    is_tv = data.get("is_tv", False)
    episodes = data.get("episodes_count", "")
    media_type = "teleplay" if (is_tv or episodes) else "movie"

    # Build result from abstract API
    # Try to get score from API rating field (e.g. {"value": "9.4", ...})
    api_score = str(data.get("rating", {}).get("value", "") or "")
    result = {
        "title": title,
        "type": media_type,
        "originalTitle": original_title,
        "genre": data.get("types", []),
        "datePublished": data.get("release_year", ""),
        "director": data.get("directors", []),
        "score": api_score,
        "url": url,
        "country": [c.strip() for c in data.get("region", "").split("/") if c.strip()],
        "IMDb": "",  # Not available in abstract API
        "time": data.get("duration", ""),
    }

    # Try to get additional fields from page scraping (language, IMDb, full release date)
    try:
        time.sleep(delay)
        # Try structured extraction first
        data_extracted = _scrape_page(url, schema=MOVIE_SCHEMA)
        if isinstance(data_extracted, dict) and data_extracted.get("title"):
            # Update result with extracted data
            result.update({
                "originalTitle": data_extracted.get("originalTitle", result["originalTitle"]),
                "genre": data_extracted.get("genre", result["genre"]),
                "datePublished": data_extracted.get("datePublished", result["datePublished"]),
                "director": data_extracted.get("director", result["director"]),
                "score": data_extracted.get("score", result["score"]),
                "country": data_extracted.get("country", result["country"]),
                "IMDb": data_extracted.get("IMDb", result["IMDb"]),
                "time": data_extracted.get("time", result["time"]),
            })
        else:
            # Fallback to HTML scrape
            html = _scrape_page(url)
            if html:
                soup = BeautifulSoup(html, "html.parser")
                info_div = soup.select_one("#info")

                if info_div:
                    # Got the full page — supplement with richer data
                    if not result["score"]:
                        score_tag = soup.select_one("strong.rating_num")
                        if score_tag:
                            result["score"] = score_tag.get_text(strip=True)

                    imdb = _get_info_text(info_div, "IMDb:")
                    if imdb:
                        result["IMDb"] = imdb

                    # Better release date from structured data
                    date_tags = soup.select('span[property="v:initialReleaseDate"]')
                    if date_tags:
                        raw = date_tags[0].get_text(strip=True)
                        date_match = re.match(r"(\d{4}-\d{2}-\d{2})", raw)
                        if date_match:
                            result["datePublished"] = date_match.group(1)

                    # Better country from structured data
                    country_text = _get_info_text(info_div, "制片国家/地区:")
                    if country_text:
                        result["country"] = [c.strip() for c in country_text.split("/") if c.strip()]
    except Exception as e:
        print(f"Warning: Failed to supplement movie data for {douban_id}: {e}")

    cache[cache_key] = result
    _save_cache(cache_file, cache)

    return result
