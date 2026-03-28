#!/usr/bin/env python3
"""
vault_tool.py — Obsidian vault helper for book/movie note creation.

Replaces the Douban plugin + QuickAdd with a single CLI tool.
Fetches metadata from Douban, creates notes with auto-tags,
and merges KOReader highlights.

Usage:
    python vault_tool.py book "百年孤独"
    python vault_tool.py book --isbn 9787544253994
    python vault_tool.py movie "盗梦空间"
    python vault_tool.py movie "3年A班" --type teleplay
"""

import argparse
import json
import os
import sys
import subprocess
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv

# Module imports (same directory)
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

load_dotenv(os.environ.get("ENV_FILE") or None)

from douban import search_douban, search_by_isbn, fetch_book_detail, fetch_movie_detail
from notes import render_book_note, render_movie_note, write_note



def load_config():
    """Load config.json from the backend directory."""
    config_path = SCRIPT_DIR / "config.json"
    if not config_path.exists():
        print(f"Error: config.json not found at {config_path}")
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def migrate_douban_cookies(config):
    """Auto-migrate cookies from the Douban plugin on first run."""
    if config.get("douban_headers"):
        return config

    vault_path = Path(config["vault_path"])  # already injected from env in main()
    plugin_data = vault_path / ".obsidian" / "plugins" / "obsidian-douban-plugin" / "data.json"

    if not plugin_data.exists():
        print("Note: No Douban plugin config found. Using default headers.")
        config["douban_headers"] = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.186 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        return config

    with open(plugin_data, "r", encoding="utf-8") as f:
        plugin_config = json.load(f)

    headers_str = plugin_config.get("loginHeadersContent", "")
    if headers_str:
        try:
            headers = json.loads(headers_str)
            # Replace the Obsidian user-agent with a clean Chrome one
            # (Douban blocks the Obsidian UA)
            headers["User-Agent"] = (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.6613.186 Safari/537.36"
            )
            config["douban_headers"] = headers
            # Extract cookies from Cookie header
            cookie_str = headers.get("Cookie", "")
            if cookie_str:
                cookies = {}
                for pair in cookie_str.split(";"):
                    pair = pair.strip()
                    if "=" in pair:
                        k, v = pair.split("=", 1)
                        cookies[k.strip()] = v.strip()
                config["douban_cookies"] = cookies
            print("Migrated Douban cookies from plugin config.")
        except json.JSONDecodeError:
            print("Warning: Could not parse Douban plugin headers.")

    # Save migrated config
    config_path = SCRIPT_DIR / "config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    return config


def open_in_obsidian(vault_name, file_path):
    """Open a note in Obsidian via URI protocol."""
    # file_path should be relative to vault root, e.g. "ReadNotes/1984"
    encoded_vault = urllib.parse.quote(vault_name)
    encoded_file = urllib.parse.quote(file_path)
    uri = f"obsidian://open?vault={encoded_vault}&file={encoded_file}"
    try:
        subprocess.Popen(["cmd", "/c", "start", "", uri])
        print(f"Opened in Obsidian: {file_path}")
    except Exception as e:
        print(f"Could not open Obsidian: {e}")
        print(f"URI: {uri}")


def disambiguate(results, query):
    """Let user pick from multiple search results."""
    if not results:
        print(f"No results found for '{query}'.")
        return None

    if len(results) == 1:
        r = results[0]
        print(f"Found: {r['title']} ({r['type']}, {r.get('year', '?')})")
        return r

    # Non-interactive mode (e.g. called from Obsidian plugin): emit JSON and exit
    if not sys.stdin.isatty():
        print(f"CANDIDATES_JSON: {json.dumps(results, ensure_ascii=False)}")
        sys.exit(0)

    print(f"\nFound {len(results)} results for '{query}':")
    for i, r in enumerate(results, 1):
        sub = f" / {r['sub_title']}" if r.get("sub_title") else ""
        print(f"  [{i}] {r['title']}{sub} ({r['type']}, {r.get('year', '?')})")

    while True:
        try:
            choice = input(f"Pick one [1-{len(results)}] (0 to cancel): ").strip()
            idx = int(choice)
            if idx == 0:
                return None
            if 1 <= idx <= len(results):
                return results[idx - 1]
        except (ValueError, EOFError):
            pass
        print("Invalid choice. Try again.")


def cmd_book(args, config):
    """Handle the 'book' subcommand."""
    vault_path = Path(config["vault_path"])
    inbox_dir = vault_path / config["inbox_dir"]
    # Book pages work without auth — don't pass migrated headers/cookies
    # (expired Douban cookies can actually cause blocks)
    headers = None
    cookies = None

    # Search
    if args.isbn:
        print(f"Searching Douban by ISBN: {args.isbn}...")
        result = search_by_isbn(args.isbn, headers=headers, cookies=cookies)
        if not result:
            print("ISBN not found on Douban.")
            return
    elif args.id:
        print(f"Fetching book ID: {args.id}...")
        result = {"id": args.id, "type": "book", "title": args.title or ""}
    else:
        print(f"Searching Douban for book: {args.title}...")
        results = search_douban(args.title, media_type="book")
        result = disambiguate(results, args.title)
        if not result:
            return

    # Fetch detail
    douban_id = result["id"]
    print(f"Fetching metadata for ID {douban_id}...")
    metadata = fetch_book_detail(douban_id, headers=headers, cookies=cookies, config=config)
    if not metadata:
        print("Failed to fetch book details.")
        return

    # Render note
    content = render_book_note(metadata)
    title = metadata.get("title", args.title if not args.isbn else str(args.isbn))
    filename = sanitize_filename(title) + ".md"
    filepath = inbox_dir/ filename

    # Write
    write_note(content, filepath)


def cmd_movie(args, config):
    """Handle the 'movie' subcommand."""
    vault_path = Path(config["vault_path"])
    inbox_dir = vault_path / config["inbox_dir"]
    # Pass cookies only for movie page scraping fallback (abstract API doesn't need them)
    headers = config.get("douban_headers", {}) or None
    cookies = config.get("douban_cookies", {}) or None

    # Search
    if args.id:
        print(f"Fetching movie ID: {args.id}...")
        result = {"id": args.id, "type": args.type or "movie", "title": args.title or ""}
    else:
        print(f"Searching Douban for: {args.title}...")
        media_type = args.type if args.type else None
        # For movies, search without type filter to get all results, then user picks
        results = search_douban(args.title, media_type=media_type)
        result = disambiguate(results, args.title)
        if not result:
            return

    # Override type if user specified
    if args.type:
        result["type"] = args.type

    # Fetch detail
    douban_id = result["id"]
    print(f"Fetching metadata for ID {douban_id}...")
    metadata = fetch_movie_detail(douban_id, headers=headers, cookies=cookies, config=config)
    if not metadata:
        print("Failed to fetch movie details.")
        return

    # Override type from user flag
    if args.type:
        metadata["type"] = args.type

    # Render note
    content = render_movie_note(metadata)
    title = metadata.get("title", args.title)
    filename = sanitize_filename(title) + ".md"
    filepath = inbox_dir / filename

    # Write
    write_note(content, filepath)


def sanitize_filename(name):
    """Remove characters that are invalid in filenames."""
    invalid_chars = r'<>:"/\|?*'
    for ch in invalid_chars:
        name = name.replace(ch, "")
    return name.strip()


def main():
    parser = argparse.ArgumentParser(
        description="Obsidian vault tool — fetch metadata, create notes, merge highlights."
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # book
    book_parser = subparsers.add_parser("book", help="Create a book note from Douban")
    book_parser.add_argument("title", nargs="?", default=None, help="Book title to search")
    book_parser.add_argument("--isbn", help="Search by ISBN instead of title")
    book_parser.add_argument("--id", help="Douban subject ID (skips search, fetches directly)")
    book_parser.add_argument("--type", default="book", help="Override type (default: book)")

    # movie
    movie_parser = subparsers.add_parser("movie", help="Create a movie/TV note from Douban")
    movie_parser.add_argument("title", nargs="?", default=None, help="Movie/show title to search")
    movie_parser.add_argument("--type", help="Override type (movie/teleplay)")
    movie_parser.add_argument("--id", help="Douban subject ID (skips search, fetches directly)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "book" and not args.title and not args.isbn and not args.id:
        print("Error: provide a title, --isbn, or --id")
        sys.exit(1)

    if args.command == "movie" and not args.title and not args.id:
        print("Error: provide a title or --id")
        sys.exit(1)

    # Load config and inject vault_path from env
    config = load_config()
    vault_path_str = os.environ.get("OBSIDIAN_VAULT_PATH")
    if not vault_path_str:
        print("Error: OBSIDIAN_VAULT_PATH is not set. Add it to your .env file.")
        sys.exit(1)
    config["vault_path"] = vault_path_str
    config = migrate_douban_cookies(config)

    # Resolve cache_file relative to backend/ directory (next to this script)
    if config.get("cache_file"):
        config["cache_file"] = str(SCRIPT_DIR / config["cache_file"])

    # Dispatch
    if args.command == "book":
        cmd_book(args, config)
    elif args.command == "movie":
        cmd_movie(args, config)


if __name__ == "__main__":
    main()
