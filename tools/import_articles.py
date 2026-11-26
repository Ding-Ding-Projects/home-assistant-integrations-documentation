"""Snapshot source documents from the Git objects pinned in the catalog."""
import argparse
import io
import json
import re
import subprocess
import tarfile
import zipfile

import yaml
from pathlib import Path

INCLUDE = re.compile(r'{%\s*include\s+([\w./-]+)')


def git_documents(repo, revision, *paths):
    archive = subprocess.check_output(['git', '-C', repo, 'archive', revision, '--', *paths])
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        return {entry.name: source.extractfile(entry).read() for entry in source if entry.isfile()}


# Feature names differ from manifest domains. These pages identify the
# integration in their title, description, or component implementation path.
MATERIAL_FEATURES = {
    'ac_defender': 'defenders/ac-defender.md',
    'heat_defender': 'defenders/heat-defender.md',
    'auto_update': 'updates/README.md',
    'dim_sum': 'language-and-voice/dim-sum-surprise.md',
    'editor_drafts': 'automations/drafts-import-export.md',
    'google_setup': 'setup/google-setup.md',
    'guided_setup': 'setup/guided-setup.md',
    'integration_transfer': 'integrations/export-import.md',
    'minecraft_manager': 'minecraft-server/README.md',
    'ollama_suite': 'ollama/README.md',
    'passkey': 'access/passkeys.md',
    'problem_log': 'help-and-privacy/problem-log.md',
    'quick_action': 'automations/quick-actions.md',
    'ttc': 'transit/ttc.md',
    'wall_tablet': 'interface/wall-tablets.md',
}


def snapshot(official, packages, material):
    catalog = json.loads(Path('catalog.json').read_text())
    revisions = catalog['revisions']
    upstream = git_documents(official, revisions['Articles'], 'source/_integrations', 'source/_includes', 'source/blueprints/integrations', 'LICENSE.md')
    package = git_documents(packages, revisions['Package'], 'integrations', 'LICENSE')
    files = {'license/official.txt': upstream['LICENSE.md'], 'license/package.txt': package['LICENSE']}
    material_base = 'https://github.com/Ding-Ding-Projects/home-assistant-material/blob/'
    material_paths = {}
    for row in catalog['integrations']:
        if 'Material' not in row['sources']:
            continue
        address = row.get('documentation', '')
        if address.startswith(material_base + 'main/docs/') and address.endswith('.md'):
            material_paths[row['domain']] = address.removeprefix(material_base + 'main/')
        elif row['domain'] in MATERIAL_FEATURES:
            material_paths[row['domain']] = 'docs/features/' + MATERIAL_FEATURES[row['domain']]
    material_docs = git_documents(material, revisions['Material'], 'LICENSE', 'NOTICE.md', *sorted(set(material_paths.values())))
    files['license/material.txt'] = material_docs['LICENSE']
    files['license/material-notice.txt'] = material_docs['NOTICE.md']
    index = {}
    domains = {row['domain'] for row in catalog['integrations']}
    for path, contents in sorted(upstream.items()):
        if not path.startswith('source/_integrations/') or not path.endswith('.markdown'):
            continue
        slug = Path(path).stem
        if slug.startswith('_'):
            continue
        metadata = yaml.safe_load(contents.decode().split('---',2)[1])
        domain = metadata.get('ha_domain') or slug
        if domain not in domains:
            continue
        key = 'documents/official/' + slug
        files[key] = contents
        source = 'https://github.com/home-assistant/home-assistant.io/blob/' + revisions['Articles'] + '/' + path
        index.setdefault(domain, []).append({'group': 'official', 'source': source, 'key': key, 'slug': slug})
    for row in catalog['integrations']:
        domain = row['domain']
        if domain in index:
            index[domain].sort(key=lambda doc: (doc['slug'] != domain, doc['slug']))
        elif row['sources'].get('Package'):
            folder = row['sources']['Package'].split('/')[-1]
            path = f'integrations/{folder}/README.md'
            key = 'documents/package/' + domain
            files[key] = package[path]
            source = row['sources']['Package'].replace('/tree/', '/blob/') + '/README.md'
            index[domain] = [{'group': 'package', 'source': source, 'key': key, 'slug': domain}]
        elif domain in material_paths:
            path = material_paths[domain]
            key = 'documents/material/' + domain
            files[key] = material_docs[path]
            source = material_base + revisions['Material'] + '/' + path
            index[domain] = [{'group': 'material', 'source': source, 'key': key, 'slug': domain}]
    for path, contents in upstream.items():
        if path.startswith('source/blueprints/integrations/'):
            files['blueprints/' + path.removeprefix('source/blueprints/integrations/')] = contents
    pending = list(files.values())
    while pending:
        for include in INCLUDE.findall(pending.pop().decode()):
            key = 'includes/' + include
            if key not in files and 'source/_includes/' + include in upstream:
                files[key] = upstream['source/_includes/' + include]
                pending.append(files[key])
    files['index.json'] = json.dumps(index, sort_keys=True).encode()
    Path('articles').mkdir(exist_ok=True)
    with zipfile.ZipFile('articles/sources.zip', 'w') as output:
        for path, data in sorted(files.items()):
            output.writestr(zipfile.ZipInfo(path), data, compress_type=zipfile.ZIP_DEFLATED)
    print(f'Snapshotted {sum(map(len,index.values()))} documents across {len(index)} domains and {sum(p.startswith("includes/") for p in files)} includes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('official', type=Path)
    parser.add_argument('packages', type=Path)
    parser.add_argument('material', type=Path)
    snapshot(**vars(parser.parse_args()))
