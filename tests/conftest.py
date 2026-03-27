from pathlib import Path
from dotenv import load_dotenv
import pytest

# Load real credentials from backend/.env so FIRECRAWL_API_KEY is in os.environ
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")


@pytest.fixture
def vault(tmp_path):
    """Fresh temporary vault directory with inbox/ pre-created."""
    (tmp_path / "inbox").mkdir()
    return tmp_path


@pytest.fixture
def config(vault, tmp_path):
    """Minimal config dict pointing to the temp vault; request_delay=0."""
    return {
        "vault_path": str(vault),
        "vault_name": "TestVault",
        "inbox_dir": "inbox",
        "book_dir": "ReadNotes",
        "watch_dir": "WatchNotes",
        "cache_file": str(tmp_path / "cache.json"),
        "request_delay": 0,
    }
