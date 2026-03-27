"""Tests for douban.py — live Douban + Firecrawl API calls."""
import json
import os
import re

from douban import (
    _normalize_author,
    _normalize_date,
    _split_title_original,
    fetch_book_detail,
    fetch_movie_detail,
    search_by_isbn,
    search_douban,
)


def test_normalize_date_various_formats():
    assert _normalize_date("2010-4-1") == "2010-04-01"
    assert _normalize_date("2010-4") == "2010-04-01"
    assert _normalize_date("2010年4月") == "2010-04-01"
    assert _normalize_date("2010年4月1日") == "2010-04-01"
    assert _normalize_date("2008-01-01") == "2008-01-01"


def test_normalize_author_brackets():
    assert _normalize_author("[英] 乔治·奥威尔") == "英/乔治·奥威尔"
    assert _normalize_author("刘慈欣") == "刘慈欣"


def test_split_title_original():
    title, original = _split_title_original("三体 The Three-Body Problem")
    assert title == "三体"
    assert original == "The Three-Body Problem"


def test_search_book_returns_list():
    results = search_douban("三体", "book")
    assert isinstance(results, list)
    assert len(results) > 0
    assert "id" in results[0]
    assert "title" in results[0]


def test_search_movie_returns_list():
    results = search_douban("盗梦空间", "movie")
    assert isinstance(results, list)
    assert len(results) > 0


def test_search_by_isbn():
    result = search_by_isbn("9787536692930")
    assert result is not None
    assert "id" in result
    assert result["id"]  # non-empty Douban ID


def test_fetch_book_detail_fields(config):
    metadata = fetch_book_detail("1220562", config=config)
    assert metadata is not None
    assert metadata.get("title")  # non-empty title
    assert "author" in metadata
    assert "isbn" in metadata
    assert "score" in metadata


def test_fetch_book_caches_result(config):
    # First fetch — populates cache
    fetch_book_detail("1220562", config=config)
    cache_path = config["cache_file"]
    assert os.path.exists(cache_path)
    mtime_after_first = os.path.getmtime(cache_path)

    # Second fetch — should be a cache hit, file mtime unchanged
    fetch_book_detail("1220562", config=config)
    mtime_after_second = os.path.getmtime(cache_path)
    assert mtime_after_first == mtime_after_second


def test_fetch_movie_detail_fields(config):
    metadata = fetch_movie_detail("1292052", config=config)
    assert metadata is not None
    assert "title" in metadata
    assert "genre" in metadata
    assert "director" in metadata


def test_fetch_movie_date_normalized(config):
    metadata = fetch_movie_detail("1292052", config=config)
    assert metadata is not None
    date = metadata.get("datePublished", "")
    assert isinstance(date, str)
    # If a date is returned, it must start with a 4-digit year
    if date:
        assert re.match(r"\d{4}", date), f"Expected date starting with year, got: {date!r}"
