"""Render pinned Markdown locally. Never load an asset or execute upstream markup."""
import json
import re
import zipfile
from functools import cache
from html import escape
from pathlib import Path

import liquid
import mistune
import nh3
import yaml

ARCHIVE = Path(__file__).resolve().parents[1] / 'articles/sources.zip'
TAGS = set('a p div section br hr em strong b i s code pre ul ol li dl dt dd h2 h3 h4 h5 h6 blockquote table thead tbody tr th td details summary sup sub kbd'.split())
INCLUDE = re.compile(r'{%\s*include\s+([\w./-]+)(.*?)%}', re.S)
TAG = re.compile(r'{%\s*(\w+)\b(.*?)%}', re.S)
CODE = re.compile(r'(?ms)^([ \t]*)(`{3,}|~{3,})[^\n]*\n.*?^\1\2[ \t]*$|(?<!`)(`+)(?!`).*?\3(?!`)')
LIQUID = liquid.Environment()
LIQUID.add_filter('push', lambda values, value: [*values, value])


@cache
def archive():
    return zipfile.ZipFile(ARCHIVE)


@cache
def resource(path):
    return archive().read(path).decode()


@cache
def index():
    return json.loads(resource('index.json'))


@cache
def article_domains():
    return {
        document['slug']: domain
        for domain, documents in index().items()
        for document in documents if document['group'] == 'official'
    }


def local_attribute(tag, name, value):
    if (tag, name) != ('a', 'href'):
        return None
    # Generate a fresh local route exclusively from the pinned source index.
    match = re.fullmatch(r'(?:https://www\.home-assistant\.io)?/integrations/([a-z0-9_.-]+)/?(?:[?#][^\s]*)?', value)
    if match:
        domain = article_domains().get(match[1])
        if domain:
            return f'../{domain}/'
    return None


def sanitize(body):
    return nh3.clean(
        MARKDOWN(body), tags=TAGS, attributes={'a': {'href'}},
        attribute_filter=local_attribute, link_rel=None,
    )


class Reader(mistune.HTMLRenderer):
    def link(self, text, url, title=None):
        return f'<a href="{escape(url, quote=True)}">{text}</a>'

    def image(self, text, url, title=None):
        return '<em>' + (text or escape(title or 'Illustration')) + '</em>'

    def heading(self, text, level, **attrs):
        level = max(2, level)
        return f'<h{level}>{text}</h{level}>\n'


MARKDOWN = mistune.create_markdown(renderer=Reader(escape=False), plugins=['table', 'strikethrough'])


def expand(source, page, arguments=None, depth=0):
    # Protect examples before processing documentation tags, including Jinja
    # examples that use the same delimiters as the publishing templates.
    saved = []
    def save(match):
        saved.append(match.group())
        return f'ATLASCODEBLOCK{len(saved)}END'
    source = re.sub(r'{%\s*(?:raw|endraw)\s*%}', '', source)
    text = CODE.sub(save, source)
    def include(match):
        path, declaration = match.groups()
        if depth >= 10 or 'includes/' + path not in archive().NameToInfo:
            return ''
        values = {}
        for key, quoted, bare in re.findall(r'(\w+)=(?:"([^"]*)"|([^\s]+))', declaration):
            value = quoted or bare
            values[key] = page.get(value[5:]) if value.startswith('page.') else value
        return expand(resource('includes/' + path), page, values, depth + 1)
    text = INCLUDE.sub(include, text)

    def tag(match):
        name, args = match.group(1), match.group(2).strip()
        if name == 'term':
            return args.strip('"\'')
        if name == 'my':
            label = re.search(r'title="([^"]+)"', args)
            return label[1] if label else args.split()[0].replace('_',' ').capitalize() if args else ''
        if name in {'configuration', 'configuration_basic'}:
            return '\n\n```yaml\n'
        if name in {'endconfiguration', 'endconfiguration_basic'}:
            return '\n```\n\n'
        if name in {'note','important','tip','warning','caution','labs'}:
            return '\n\n**' + name.capitalize() + '**\n\n'
        if name in {'details','example','tabbed_block','tab'}:
            title = re.search(r'"([^"]+)"',args)
            return '\n\n#### ' + (title[1] if title else name.capitalize()) + '\n\n'
        if name in {'raw','endraw','icon','enddetails','endexample','endnote','endimportant','endtip','endwarning','endcaution','endlabs','endtabbed_block','endtab'}:
            return ''
        if name == 'blueprint_example':
            blueprint = re.search(r'blueprint="([\w./-]+)"',args)
            if blueprint and 'blueprints/' + blueprint[1] in archive().NameToInfo:
                return '\n\n```yaml\n' + resource('blueprints/' + blueprint[1]).rstrip() + '\n```\n\n'
        return match.group()
    text = TAG.sub(tag, text)
    if depth:
        try:
            text = LIQUID.from_string(text).render(page=page, include=arguments or {})
        except liquid.exceptions.LiquidError:
            # Some Jekyll plugins require data fetched at upstream build time.
            # Keep their source readable when the pinned checkout cannot resolve it.
            pass
    else:
        for key in ('title','ha_domain','ha_integration_type'):
            text = re.sub(r'{{\s*page\.' + key + r'\s*}}',lambda _: str(page.get(key,'')),text)
    for i, snippet in enumerate(saved,1):
        text = text.replace(f'ATLASCODEBLOCK{i}END', snippet)
    return text


def render_document(row, document, multiple):
    domain = row['domain']
    source = resource(document['key'])
    if document['group'] == 'official':
        _, metadata, body = source.split('---',2)
        page = yaml.safe_load(metadata)
        page.setdefault('title',row['name'])
        page.setdefault('ha_domain',domain)
        if row.get('supported_by'):
            page.setdefault('ha_supporting_domain',row['supported_by'])
            page.setdefault('ha_supporting_integration',row['supported_by'].replace('_',' ').title())
        page.setdefault('ha_integration_type',row.get('integration_type','integration'))
        body = expand(body,page)
        credit = 'Adapted from Home Assistant Documentation by its contributors under CC BY-NC-SA 4.0.'
    else:
        body = source
        origin = 'Home Assistant Material feature documentation' if document['group'] == 'material' else 'the integration package README'
        credit = f'Adapted from {origin} by Ding-Ding-Projects and its contributors under the Apache License, Version 2.0.'
    fragment = sanitize(body)
    heading = '<h2>' + escape(document['slug'].replace('_',' ').title()) + '</h2>' if multiple else ''
    return (
        heading + '<div class="reader-body">' + fragment + '</div><section><h2>Original source and license</h2>'
        + f'<p>{credit} This local edition reformats the source for offline reading.</p>'
        + f'<p><code>{escape(document["source"])}</code></p>'
        + f'<details><summary>Original Markdown source</summary><pre>{escape(source)}</pre></details>'
        + '</section>'
    )


def article(row):
    documents = index().get(row['domain'], [])
    if not documents:
        return ''
    body = ''.join(render_document(row, document, len(documents) > 1) for document in documents)
    license_text = resource('license/' + documents[0]['group'] + '.txt')
    if documents[0]['group'] == 'material':
        notice = escape(resource('license/material-notice.txt'))
        body += f'<details><summary>Project notice</summary><pre>{notice}</pre></details>'
    return body + f'<details><summary>Source license</summary><pre>{escape(license_text)}</pre></details>'
