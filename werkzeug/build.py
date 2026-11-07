"""Baut index.html des Familienkochbuchs aus app.js/app.css + Rezeptdatei.
Aufruf:  python3 werkzeug/build.py /pfad/zu/familienkochbuch.json
Die Rezeptdatei (mit Quell-Chat-Links 'quelle') bleibt im Claude-Projekt; ins Repo kommt nur die Seite ohne 'quelle'."""
import json, sys, os, hashlib, copy
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = copy.deepcopy(json.load(open(sys.argv[1], encoding='utf-8')))
for r in data['rezepte']:
    r.pop('quelle', None)
ids = {r['id'] for r in data['rezepte']}
for r in data['rezepte']:
    assert all(p in ids for p in r.get('passt_zu', [])), r['id']
js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
ver = lambda f: hashlib.md5(open(os.path.join(root, f), 'rb').read()).hexdigest()[:8]
title = 'Kochbuch'
page = f'''<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{title}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#F2F2F7">
<title>Familienkochbuch</title>
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="app.css?v={ver('app.css')}">
</head><body>
<header><button id="back" hidden>‹ Zurück</button><div><h1 id="title">Familienkochbuch</h1><div id="sub"></div></div>
<button id="gear" class="hbtn" aria-label="Einstellungen">⚙️</button></header>
<div id="timers"></div>
<main id="main"></main>
<div id="cook" hidden></div>
<nav>
  <button data-v="liste"><span class="ico">📖</span>Rezepte</button>
  <button data-v="favoriten"><span class="ico">⭐</span>Favoriten</button>
  <button data-v="einkauf"><span class="ico">🛒</span>Einkauf<span class="badge" id="shopBadge" hidden></span></button>
</nav>
<script>window.KB={js(data)};</script>
<script src="app.js?v={ver('app.js')}"></script>
</body></html>
'''
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(page)
json.dump({"name": "Familienkochbuch", "short_name": title, "start_url": "./", "scope": "./", "display": "standalone",
           "background_color": "#F2F2F7", "theme_color": "#F2F2F7",
           "icons": [{"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                     {"src": "icon-180.png", "sizes": "180x180", "type": "image/png"}]},
          open(os.path.join(root, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('gebaut:', len(data['rezepte']), 'Rezepte')
