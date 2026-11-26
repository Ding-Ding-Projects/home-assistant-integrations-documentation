# Offline reader sources

The build reads `articles/sources.zip` locally. It contains the unmodified Markdown documents, their pinned Git source addresses, shared integration includes, blueprint examples, and the original licenses. Install the reader dependencies once in your Python environment.

```sh
python -m pip install -r requirements.txt
python tools/build.py
python tools/verify.py
```

To refresh the snapshot after updating the catalog, use Git checkouts containing the revisions recorded in `catalog.json`.

```sh
python tools/import_articles.py /path/to/home-assistant.io /path/to/home-assistant-integrations /path/to/home-assistant-material
```

Readers group the main integration article with any platform-specific articles for the same domain. The package README supplies the article for package-only domains. Material feature documents supplement domains whose manifest cites a project document or whose dedicated feature page identifies the integration. Readers include the pinned Material license and project notice. Remaining domains retain their local manifest reference. Each document includes the unchanged source, a plain-text citation, and attribution. Diagrams and external images appear as captions when the source supplies alternative text. Publishing templates that depend on live upstream datasets may have no local values.
