# 📚 Folio
> Stop copying metadata, start writing your thoughts. Folio automates the creation of perfect book and movie notes within Obsidian.

[English] | [简体中文](./README_zh.md)
## 💡 What is Folio?

Folio is an Obsidian plugin designed to supercharge your media note-taking efficiency. Its primary selling point is eliminating the friction between discovering a work and actually writing about it.

By merging rich, structured metadata from global sources (like Douban or IMDB) with your own **custom templates**, Folio instantly creates a professional-grade foundation for your reviews. You get the best of both worlds: standardized, detailed data on one side, and your personalized note layout on the other. Once the note is added, your only job is to focus your attention on thinking and writing down your own unique ideas.

---

## ✨ Features

- 📑 **Data-Driven Templates**: The plugin handles the boring stuff. By defining your own note template, you can set placeholder fields (e.g., `{{title}}`, `{{author}}`, `{{cover_url}}`). Folio fetches this exact data from external sources and injects it into your template, ensuring every new note looks exactly how you like it, instantly.
- 🌏 **Smart Multi-Source Routing**: No need to tell the plugin where to look. It automatically detects Chinese (CJK) or Latin characters in your query to intelligently route requests to the most relevant database—Douban for Chinese media, and IMDB or Open Library for English/Western media.
- ⚡ **Frictionless Workflow**: One command (`Folio: Add Note`) to rule them all. Find a book, add it to Obsidian, and have your note ready for writing in seconds. It completely removes the manual copy-pasting required to build a structured media log.
- 🛠️ **Fully Customizable System**: Make the plugin conform to your Zettelkasten or organization method. Choose your specific inbox folder, set request delays to respect rate limits, and design multiple templates for different media types.
- 💾 **Local-First Cache**: Fast performance, always. Folio includes built-in JSON caching. Once a book or movie is fetched, its metadata is stored locally in your vault, preventing redundant API calls and ensuring your note-creation workflow remains snappy.
---

## 📦 Installation

1.  **Build from source**:
    ```bash
    npm install
    npm run build
    ```
2.  **Copy files**:
    Create a folder in your vault: `<vault>/.obsidian/plugins/folio/`.
    Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
3.  **Enable**:
    Go to **Settings → Community Plugins**, click **Reload**, find **Folio**, and toggle it on.

---
## ⚙️ Configuration

Go to **Settings → Folio** to configure the following:

| Setting | Description |
| :--- | :--- |
| **Firecrawl API key** | *Optional*. Required for fetching detailed Douban data. [Get a key](https://www.firecrawl.dev/) |
| **Inbox folder** | The subfolder where new notes will be created (e.g., `inbox`). |
| **Request delay** | Seconds between requests (Default: 2) to avoid rate limiting. |


## 🚀 Usage

1.  Open the **Command Palette** (`Ctrl/Cmd + P`).
2.  Run the command: `Folio: Add Note`.
3.  Enter your query in the modal:
    * **Search**: Title, author, or keywords.
    * **ISBN**: For exact book lookups (bypasses title search).
4.  **Source Logic**:
    * **CJK Characters**: Searches Douban + Google Books.
    * **Latin Characters**: Searches IMDB + Open Library.
    * **ISBN**: Parallel search across all compatible sources.

---
## ⚠️ Network Disclosure
This plugin connects to the following external services:
* **Services**: Douban, IMDB, Open Library, Google Books, and optionally Firecrawl.
* **Privacy**: Only search queries and IDs are sent to these services. No local vault data or personal notes are ever uploaded.

---
## 🛠️ Troubleshooting

* **Empty Douban Fields**: Ensure your Firecrawl API key is valid and entered correctly.
* **Folder Error**: Ensure the "Inbox folder" defined in settings actually exists in your vault.
* **Stale Data**: Delete entries in `.obsidian/plugins/folio/cache.json` to force a re-fetch.

---

## 🤝 Contributing & Support

Contributions are welcome! If you'd like to help:
1. Fork the repository.
2. Create a feature branch.
3. Submit a Pull Request.

**Love the plugin?** Consider [buying me a coffee](**NO I DONT HAVE ONE YET.**) or leaving a ⭐ on GitHub!

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
