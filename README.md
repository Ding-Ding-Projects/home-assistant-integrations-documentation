# Home Assistant Integrations Documentation

An independent field guide covering Home Assistant's official integration directory, the components shipped with Home Assistant Material, and the Material integration package collection. Each guide links to its maintainer's documentation and source where available.

[Open the integration atlas](https://ding-ding-projects.github.io/home-assistant-integrations-documentation/)

## Coverage

The atlas publishes a distinct overview, setup guide and local reference reader for each domain in the combined catalog. Open an overview under `discover/<domain>/`, a guide under `integrations/<domain>/`, or a reader under `references/<domain>/`. Unknown third-party domains are outside the catalog. The source revisions are recorded in `catalog.json`.

## Build and verify

Run from the repository root with Python 3.

```sh
python tools/build.py
python tools/verify.py
```

The deployable site is in `docs/`. GitHub Pages serves that directory from `main`. For an offline copy, use a local static server or build the supplied container and run it locally.

```sh
docker build -t integration-atlas .
docker run --rm -p 127.0.0.1:8080:80 integration-atlas
```

To refresh the catalog, install PyYAML and pass paths to public source checkouts in this order. Review the revision changes, rebuild and verify before publishing.

```sh
python tools/catalog.py /path/to/home-assistant-core /path/to/home-assistant-material /path/to/integration-packages /path/to/home-assistant.io
```

## Attribution

Article excerpts and adaptations credit the Home Assistant documentation contributors and use CC BY-NC-SA 4.0. The license is included in `ARTICLE-LICENSE.md`. Each reader includes its source addresses. Illustrations were generated for this atlas. This independent project is unaffiliated with the Home Assistant project.
