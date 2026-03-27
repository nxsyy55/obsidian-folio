from datetime import datetime
import re
import sys


def _yaml_value(value, force_quote=False):
    """Format a value for YAML output. Quote only when necessary."""
    if value is None or value == "":
        return ""
    s = str(value)
    if force_quote:
        return f'"{s}"'
    # Quote strings that start with special YAML indicators or contain
    # characters that would break YAML parsing
    if (s.startswith(("{", "[", "'", '"', "&", "*", "!", "|", ">", "%", "@", "`"))
            or s.startswith(("- ", "? "))
            or re.search(r'[\#\[\]\{\}]|: ', s)):
        return f'"{s}"'
    return s


def _yaml_list(items):
    """Format a list of items as YAML list lines (each indented with 2 spaces)."""
    if not items:
        return ""
    lines = []
    for item in items:
        lines.append(f"  - {item}")
    return "\n" + "\n".join(lines)



def render_book_note(metadata):
    """Render a complete Obsidian markdown note for a book."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_year = datetime.now().year

    title = metadata.get("title", "")
    series = metadata.get("series", "")
    authors = metadata.get("author", [])
    score = metadata.get("score", "")
    date_published = metadata.get("datePublished", "")
    translators = metadata.get("translator", [])
    publisher = metadata.get("publisher", "")
    isbn = metadata.get("isbn", "")
    url = metadata.get("url", "")

    # Build frontmatter
    lines = []
    lines.append("---")
    lines.append(f"title: {_yaml_value(title)}")
    lines.append("type: book")

    # author - always YAML list
    if authors:
        lines.append(f"author: {_yaml_list(authors)}")
    else:
        lines.append("author: ")

    # series - omit if empty
    if series:
        lines.append(f"series: {_yaml_value(series)}")

    lines.append(f"score: {_yaml_value(score)}")
    lines.append(f"datePublished: {_yaml_value(date_published)}")
    lines.append(f"publisher: {_yaml_value(publisher)}")

    # translator - YAML list, omit if empty
    if translators:
        lines.append(f"translator: {_yaml_list(translators)}")

    lines.append(f"isbn: {_yaml_value(isbn)}")
    lines.append(f"url: {_yaml_value(url)}")
    lines.append(f"createTime: {now}")
    lines.append("")
    lines.append("---")

    # Tags section
    lines.append("")
    lines.append("## 标签")
    lines.append("")
    lines.append(f"#read/{current_year} #to-do")
    lines.append("")

    # Review section
    lines.append("## 读后感")
    lines.append("")
    lines.append("")
    lines.append("")

    # Excerpts section
    lines.append("## 摘录")
    lines.append("")

    return "\n".join(lines) + "\n"


def render_movie_note(metadata):
    """Render a complete Obsidian markdown note for a movie/teleplay."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_year = datetime.now().year

    title = metadata.get("title", "")
    media_type = metadata.get("type", "movie")
    original_title = metadata.get("originalTitle", "")
    genres = metadata.get("genre", [])
    date_published = metadata.get("datePublished", "")
    directors = metadata.get("director", [])
    score = metadata.get("score", "")
    url = metadata.get("url", "")
    countries = metadata.get("country", [])
    imdb = metadata.get("IMDb", "")
    duration = metadata.get("time", "")

    # Build frontmatter
    lines = []
    lines.append("---")
    lines.append(f"title: {_yaml_value(title)}")
    lines.append(f"type: {media_type}")

    # originalTitle - omit if empty or same as title
    if original_title and original_title != title:
        lines.append(f"originalTitle: {_yaml_value(original_title)}")

    # genre - YAML list
    if genres:
        lines.append(f"genre:{_yaml_list(genres)}")
    else:
        lines.append("genre:")

    lines.append(f"datePublished: {_yaml_value(date_published)}")

    # director - YAML list
    if directors:
        lines.append(f"director:{_yaml_list(directors)}")
    else:
        lines.append("director:")

    lines.append(f"score: {_yaml_value(score)}")
    lines.append(f"url: {_yaml_value(url)}")

    # country - YAML list
    if countries:
        lines.append(f"country:{_yaml_list(countries)}")
    else:
        lines.append("country:")

    # IMDb - omit if empty
    if imdb:
        lines.append(f"IMDb: {_yaml_value(imdb)}")

    lines.append(f"time: {_yaml_value(duration)}")
    lines.append(f"createTime: {now}")
    lines.append("---")
    lines.append("")

    # Tags section
    tags = [f"#watch/{current_year}"]
    for g in genres:
        tags.append(f"#{g}")
    if media_type == "teleplay":
        tags.append("#tv")
    tags.append("#to-do")

    lines.append("## 标签")
    lines.append("")
    lines.append(" ".join(tags))
    lines.append("")

    # Review section
    lines.append("## 观后感")
    lines.append("")
    lines.append("")

    return "\n".join(lines) + "\n"


def write_note(content, filepath):
    """Write note content to a file. Prompts before overwriting existing files.

    Args:
        content: The markdown string to write.
        filepath: A pathlib.Path object for the target file.

    Returns:
        True on success, False if skipped.
    """
    if filepath.exists() and sys.stdin.isatty():
        try:
            answer = input(f"File already exists: {filepath.name}. Overwrite? [y/N] ")
        except EOFError:
            pass
        else:
            if answer.strip().lower() != "y":
                return False

    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")
    print(f"Created: {filepath}")
    return True
