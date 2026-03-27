"""Tests for vault_tool.py — full pipeline e2e."""
import re
from types import SimpleNamespace

import yaml

from vault_tool import cmd_book, cmd_movie, sanitize_filename


def _parse_frontmatter(text):
    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    assert match, "No YAML frontmatter found"
    return yaml.safe_load(match.group(1))


def test_cmd_book_by_id(vault, config):
    args = SimpleNamespace(isbn=None, id="1220562", title="三体", type="book")
    cmd_book(args, config)
    notes = list((vault / "inbox").glob("*.md"))
    assert len(notes) == 1


def test_cmd_book_by_isbn(vault, config):
    args = SimpleNamespace(isbn="9787536692930", id=None, title=None, type="book")
    cmd_book(args, config)
    # Note filename derived from fetched title
    notes = list((vault / "inbox").glob("*.md"))
    assert len(notes) == 1


def test_cmd_book_note_is_valid_yaml(vault, config):
    args = SimpleNamespace(isbn=None, id="1220562", title="三体", type="book")
    cmd_book(args, config)
    notes = list((vault / "inbox").glob("*.md"))
    assert len(notes) == 1
    content = notes[0].read_text(encoding="utf-8")
    fm = _parse_frontmatter(content)
    assert fm["type"] == "book"
    assert fm["title"]


def test_cmd_movie_by_id(vault, config):
    args = SimpleNamespace(id="1292052", title="盗梦空间", type=None)
    cmd_movie(args, config)
    notes = list((vault / "inbox").glob("*.md"))
    assert len(notes) == 1


def test_cmd_movie_teleplay(vault, config):
    args = SimpleNamespace(id="4840388", title="请回答1988", type="teleplay")
    cmd_movie(args, config)
    notes = list((vault / "inbox").glob("*.md"))
    assert len(notes) == 1
    content = notes[0].read_text(encoding="utf-8")
    assert "#tv" in content


def test_sanitize_filename():
    result = sanitize_filename("三体: 地球往事")
    assert ":" not in result
    assert result.strip() != ""
