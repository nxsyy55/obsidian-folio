"""Tests for notes.py — pure renderer, no network calls."""
import re
from pathlib import Path

import yaml

from notes import render_book_note, render_movie_note, write_note


def _parse_frontmatter(content):
    """Extract and parse YAML frontmatter from a note string."""
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    assert match, "No frontmatter found"
    return yaml.safe_load(match.group(1))


def test_book_frontmatter_fields():
    metadata = {
        "title": "三体",
        "author": ["刘慈欣"],
        "score": "9.4",
        "datePublished": "2008-01-01",
        "publisher": "重庆出版社",
        "isbn": "9787536692930",
        "url": "https://book.douban.com/subject/1220562/",
    }
    content = render_book_note(metadata)
    fm = _parse_frontmatter(content)
    assert fm["title"] == "三体"
    assert fm["type"] == "book"
    assert str(fm["score"]) == "9.4"
    assert str(fm["datePublished"]) == "2008-01-01"
    assert fm["publisher"] == "重庆出版社"
    assert str(fm["isbn"]) == "9787536692930"
    assert fm["url"] == "https://book.douban.com/subject/1220562/"


def test_book_author_yaml_list():
    metadata = {
        "title": "Test",
        "author": ["Author A", "Author B"],
    }
    content = render_book_note(metadata)
    fm = _parse_frontmatter(content)
    assert isinstance(fm["author"], list)
    assert fm["author"] == ["Author A", "Author B"]


def test_book_no_series_omitted():
    metadata = {"title": "Test", "author": ["Author"], "series": None}
    content = render_book_note(metadata)
    fm = _parse_frontmatter(content)
    assert "series" not in fm


def test_book_title_with_colon():
    metadata = {"title": "三体: 地球往事", "author": ["刘慈欣"]}
    content = render_book_note(metadata)
    fm = _parse_frontmatter(content)
    assert fm["title"] == "三体: 地球往事"


def test_book_tags_include_year():
    from datetime import datetime
    current_year = datetime.now().year
    metadata = {"title": "Test", "author": [], "datePublished": "2008-01-01"}
    content = render_book_note(metadata)
    assert f"#read/{current_year}" in content


def test_movie_frontmatter_fields():
    metadata = {
        "title": "盗梦空间",
        "type": "movie",
        "director": ["克里斯托弗·诺兰"],
        "genre": ["科幻", "动作"],
        "score": "9.4",
        "datePublished": "2010-09-01",
        "url": "https://movie.douban.com/subject/1292052/",
    }
    content = render_movie_note(metadata)
    fm = _parse_frontmatter(content)
    assert fm["title"] == "盗梦空间"
    assert fm["type"] == "movie"
    assert isinstance(fm["director"], list)
    assert isinstance(fm["genre"], list)
    assert str(fm["score"]) == "9.4"


def test_movie_teleplay_has_tv_tag():
    metadata = {
        "title": "请回答1988",
        "type": "teleplay",
        "director": ["申元昊"],
        "genre": ["剧情"],
        "score": "9.7",
        "datePublished": "2015-11-06",
        "url": "https://movie.douban.com/subject/4840388/",
    }
    content = render_movie_note(metadata)
    assert "#tv" in content


def test_movie_no_imdb_omitted():
    metadata = {
        "title": "Test Movie",
        "type": "movie",
        "IMDb": None,
        "genre": [],
        "director": [],
    }
    content = render_movie_note(metadata)
    fm = _parse_frontmatter(content)
    assert "IMDb" not in fm


def test_write_note_creates_file(vault):
    content = "---\ntitle: Test\n---\n\nBody text\n"
    filepath = vault / "inbox" / "test.md"
    result = write_note(content, filepath)
    assert result is True
    assert filepath.exists()
    assert filepath.read_text(encoding="utf-8") == content


def test_write_note_creates_parent_dirs(vault):
    content = "---\ntitle: Test\n---\n"
    filepath = vault / "inbox" / "subdir" / "nested.md"
    result = write_note(content, filepath)
    assert result is True
    assert filepath.exists()
