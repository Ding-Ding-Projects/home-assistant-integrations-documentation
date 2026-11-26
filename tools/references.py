"""Render offline readers from the catalog's article excerpts and manifest data."""
from html import escape
from pathlib import Path
import re

from article_reader import article


def readable(value):
    return escape(value.replace('_', ' '))


def render_reference(row, shell, theme, style, catalog_names):
    domain = row['domain']
    name = escape(row['name'])
    base = '../../'
    guide = f'{base}integrations/{escape(domain)}/'
    crumbs = f'<nav><a href="{base}directory.html">Directory</a> / <a href="{guide}">{name} guide</a> / Reference</nav>'
    summary = escape(row.get('summary') or '')
    content = [
        crumbs,
        f'<article class="reading"><small>Integration reference</small><h1>{name}</h1><p>{summary}</p>',
    ]
    primary = article(row)
    if primary:
        content.append(primary)
    for heading, paragraph in ([] if primary else row.get('article_text', [])):
        content.append(f'<section><h2>{escape(heading)}</h2><p>{escape(paragraph)}</p></section>')

    content.append('<section><h2>Configuration details</h2>')
    if row.get('supported_by'):
        parent = row['supported_by']
        if parent in catalog_names:
            parent_label = escape(catalog_names[parent])
            destination = f'<a href="../{escape(parent)}/">{parent_label}</a>'
        else:
            destination = f'<code>{escape(parent)}</code>'
        content.append(f'<p>Set up {name} through its supporting integration, {destination}.</p>')
    elif row.get('config_flow'):
        menu = 'Create helper' if row.get('integration_type') == 'helper' else 'Add integration'
        content.append(f'<p>In Home Assistant, open <strong>Settings → Devices &amp; services</strong>, choose <strong>{menu}</strong>, and search for {name}.</p>')
    else:
        content.append(f'<p>The domain used to identify {name} in Home Assistant is <code>{escape(domain)}</code>.</p>')
    for step, fields in row.get('steps', {}).items():
        if fields:
            field_names = ', '.join(f'<code>{escape(field)}</code>' for field in fields)
            content.append(f'<p>The <strong>{readable(step)}</strong> configuration step lists {field_names}.</p>')
    for key, label in [('platforms', 'Entity platforms'), ('actions', 'Documented actions'), ('connectivity', 'Connection methods')]:
        if row.get(key):
            items = ''.join(f'<li>{readable(item)}</li>' for item in row[key])
            content.append(f'<h3>{label}</h3><ul class="chips">{items}</ul>')
    content.append('</section>')
    if row.get('topics'):
        items = ''.join(f'<li>{escape(topic)}</li>' for topic in row['topics'])
        content.append(f'<section><h2>Topics in the original article</h2><ul>{items}</ul></section>')

    citations = [('Home Assistant article', row.get('article')), ('Component documentation', row.get('documentation'))]
    citations.extend((f'{label} source', address) for label, address in row['sources'].items())
    addresses = set()
    citation_items = []
    for label, address in citations:
        if address and address.rstrip('/') not in addresses:
            citation_items.append(f'<dt>{escape(label)}</dt><dd><code>{escape(address)}</code></dd>')
            addresses.add(address.rstrip('/'))
    content.append('<section><h2>Source addresses</h2><dl>' + ''.join(citation_items) + '</dl></section>')
    content.append(f'<p><a href="{guide}">Return to the {name} guide →</a></p></article>')
    path = Path('docs/references') / domain
    path.mkdir(parents=True, exist_ok=True)
    page = shell(f'{row["name"]} reference', ''.join(content), base, style, theme, article_search=True)
    # Keep rendered code and original source exact without trailing blanks in Git.
    page = re.sub(r'[ \t]+(?=\r?$)', lambda m: ''.join(f'&#{ord(c)};' for c in m[0]), page, flags=re.M)
    page = re.sub(r'^[ \t]+', lambda m: m[0].replace('\t', '&#9;'), page, flags=re.M)
    (path / 'index.html').write_text(page, encoding='utf-8')
