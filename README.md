# Convertix

Convertisseur de fichiers par glisser-déposer qui tourne entièrement dans le navigateur. Aucun fichier n'est envoyé à un serveur : les conversions se font sur l'appareil, en JavaScript et en WebAssembly.

**En ligne : https://convertix-eh9.pages.dev**

L'interface reprend un tableau des départs d'aéroport à palettes. Chaque fichier déposé devient un « vol » (CX 001…) avec un format de départ, une destination et un statut : PRÊT, EMBARQ xx %, ARRIVÉ ou ANNULÉ.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Formats pris en charge](#formats-pris-en-charge)
- [Lecteur intégré](#lecteur-intégré)
- [Réglages](#réglages)
- [Confidentialité](#confidentialité)
- [Limites connues](#limites-connues)
- [Développement](#développement)
- [Tests](#tests)
- [Déploiement](#déploiement)
- [Architecture](#architecture)
- [Ajouter un format](#ajouter-un-format)

## Fonctionnalités

- **Ajout de fichiers :** glisser-déposer n'importe où sur la page, dépôt d'un dossier entier, ou bouton de choix.
- **Collage avec ⌘V / Ctrl+V :** les fichiers sont acceptés tels quels. Le texte collé est reconnu comme JSON, HTML, Markdown, CSV ou texte brut.
- **Conversion en lot :** chaque fichier a sa propre destination, et « Tout vers » les règle tous d'un coup. Les résultats se téléchargent un par un ou ensemble dans un ZIP.
- **Reconversion :** un résultat peut repartir vers un autre format sans repasser par le disque.
- **Outils PDF :** fusion de plusieurs PDF en un seul, assemblage d'images en un PDF, découpe page par page, allègement.
- **Aperçus :** vignette de l'image, de la première page d'un PDF ou d'une image de la vidéo.
- **Exemples intégrés :** le bouton « Essayer avec des exemples » charge une image, un CSV et un fichier Markdown.
- **Affichage :** l'interface s'adapte au mobile, et les animations sont coupées si le système demande moins de mouvement.

## Formats pris en charge

| Famille | Départ | Arrivée |
|---|---|---|
| Images | PNG JPG WEBP AVIF GIF BMP SVG ICO HEIC TIFF TGA | PNG JPG WEBP AVIF* GIF BMP ICO TIFF SVG PDF Base64 |
| PDF | PDF | PNG JPG WEBP (page par page), TXT, MD, HTML, PDF découpé en pages, PDF allégé |
| Documents | DOCX, MD, HTML, TXT | PDF, HTML, MD, TXT |
| Données | CSV TSV JSON (et JSON Lines) XLSX XLS ODS XML YAML | XLSX CSV TSV JSON YAML XML ODS HTML MD SQL |
| Audio | MP3 WAV OGG M4A AAC FLAC OPUS WMA AIFF | MP3 WAV OGG FLAC M4A OPUS |
| Vidéo | MP4 WEBM MOV MKV AVI M4V WMV FLV 3GP MPEG | MP4 WEBM MOV MKV AVI GIF animé, MP3 WAV M4A, image PNG/JPG |
| Archives | ZIP | extraction de toutes les entrées |
| Autres | tout fichier | ZIP, Base64 |

\* AVIF n'est proposé que si le navigateur sait l'encoder (Chrome, Edge).

Quand une donnée hiérarchique (JSON, YAML, XML) part vers un tableau, elle est aplatie : `client.adresse.ville` devient une colonne. L'export SQL produit un `CREATE TABLE` suivi des `INSERT`.

## Lecteur intégré

Le bouton **Lire** ouvre un fichier, d'origine ou converti, sans le convertir.

| Type | Affichage |
|---|---|
| Images | Ajusté à l'écran ou en taille réelle. HEIC et TIFF sont décodés avant l'affichage. |
| PDF | Page par page, flèches du clavier, zoom |
| Audio | Lecteur avec forme d'onde cliquable pour se déplacer |
| Vidéo | Lecteur avec réglage de la vitesse |
| DOCX, Markdown, HTML | Rendu dans un cadre isolé (`iframe sandbox`) où aucun script ne s'exécute, avec bascule vers le code source |
| Données | Tableau filtrable (1000 premières lignes) |
| ZIP | Liste des entrées, chacune peut s'ouvrir |
| Texte | Numéros de ligne, retour à la ligne, bouton copier |
| Autres | Vue hexadécimale |

Si le navigateur ne sait pas lire un fichier audio ou vidéo (MKV ou AVI dans Safari, par exemple), le lecteur propose d'ajouter au tableau une conversion en MP4 ou en MP3.

## Réglages

Le panneau **Réglages** est mémorisé dans le navigateur (`localStorage`, clé `convertix:opts`).

- **Images :** qualité, largeur et hauteur maximales, échelle, rotation, miroirs, noir et blanc, couleur de fond pour remplir la transparence.
- **PDF :** netteté des pages exportées en image (72 à 288 ppp).
- **Audio :** débit, fréquence, mono, normalisation du volume.
- **Vidéo :** largeur maximale, images par seconde, compression (CRF), instant de la capture d'image, suppression du son.
- **Découpe audio et vidéo :** début et durée.
- **Données et noms :** séparateur CSV (`;` pour Excel en français), modèle de nom des fichiers produits avec `{nom}`, `{n}` (numéro de vol) et `{date}`.

## Confidentialité

- Aucun fichier ne quitte l'appareil, et il n'y a ni compte, ni cookie, ni outil de mesure d'audience.
- Le site télécharge seulement deux ressources externes : les polices Google Fonts, et le cœur de ffmpeg depuis jsDelivr à la première conversion audio ou vidéo.
- `public/_headers` ajoute les en-têtes `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` et `Permissions-Policy`.
- Les documents HTML ou Word sont convertis via `DOMParser` ou affichés dans un `iframe` sans droits : leur contenu ne s'exécute jamais.

## Limites connues

- **Audio et vidéo :** la première conversion télécharge le cœur de ffmpeg.wasm (environ 31 Mo), qui est ensuite mis en cache. La version utilisée tourne sur un seul cœur du processeur, donc une vidéo longue est lente à convertir. Les conversions ffmpeg passent l'une après l'autre.
- **PDF créés à partir de texte :** les polices intégrées de jsPDF ne couvrent que l'alphabet latin et ses accents. Les autres caractères (arabe, chinois, emojis) deviennent « ? ».
- **DOCX, HTML ou Markdown vers PDF :** la mise en page est simplifiée. Les titres, paragraphes, listes, citations et blocs de code sont repris, et les tableaux deviennent des lignes séparées par « | ». Les images, les colonnes et les styles sont ignorés.
- **Mémoire :** la taille maximale d'un fichier dépend de la mémoire du navigateur. La vidéo est la plus gourmande, car ffmpeg.wasm garde le fichier entier en mémoire.

## Développement

Il faut Node 20 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # produit dist/
npm run preview    # sert dist/ en local
```

## Tests

`scripts/e2e.mjs` pilote le Chrome installé sur la machine avec `playwright-core`. Pour chaque fichier du dossier de test, il ajoute une ligne par destination possible et lance toutes les conversions. Il ouvre ensuite chaque résultat et le fichier d'origine dans le lecteur, puis signale les échecs et les erreurs de page.

```bash
npm run build && npm run preview &
node scripts/e2e.mjs http://localhost:4173 ./fixtures
ONLY=pdf,docx node scripts/e2e.mjs https://convertix-eh9.pages.dev ./fixtures   # seulement certaines extensions
```

Le dossier de test doit contenir un fichier par format de départ à vérifier, par exemple `photo.png`, `rapport.pdf`, `doc.docx`, `gens.csv`, `data.json`, `son.wav` et `clip.mp4`. Le chemin de Chrome se règle avec la variable `CHROME`. Sans elle, le script cherche Chrome à son emplacement habituel sur macOS.

Dernier passage complet sur le site en ligne : 14 fichiers de départ, 101 conversions, aucun échec.

## Déploiement

Le site est hébergé sur **Cloudflare Pages** (projet `convertix`).

- **Automatique :** chaque push sur `main` lance `.github/workflows/deploy.yml`, qui fait `npm ci`, construit le site puis le publie avec `wrangler pages deploy`. Le workflow lit la clé dans le secret `CLOUDFLARE_API_TOKEN` du dépôt, qui n'a besoin que de la permission *Account → Cloudflare Pages → Edit*.
- **Manuel :** relancer le workflow depuis l'onglet Actions (`workflow_dispatch`), ou publier depuis sa machine :

  ```bash
  npm run build && npx wrangler pages deploy dist --project-name convertix --branch main
  ```

## Architecture

Le site est statique, écrit en JavaScript sans framework et construit avec Vite. Les bibliothèques lourdes sont chargées par `import()` dynamique au moment où on en a besoin : la page d'accueil reste légère.

```
index.html          Structure de la page : en-tête, zone de dépôt, tableau, destinations, réglages
src/
  main.js           Interface : animation des palettes, tableau des vols, file d'attente, réglages,
                    glisser-déposer, collage, actions groupées, notifications
  formats.js        Familles de formats, destinations possibles, extension → famille, utilitaires
  convert.js        Moteurs de conversion, un par famille (images, PDF, documents, données, audio/vidéo)
  viewer.js         Lecteur universel (<dialog>), une vue par type de fichier
  style.css         Design complet : couleurs, palettes, tableau, lecteur, points de rupture 960 px et 560 px
public/_headers     En-têtes HTTP servis par Cloudflare Pages
scripts/e2e.mjs     Test de bout en bout de toutes les conversions
vite.config.js      Cible ES2022, workers en modules, ffmpeg exclu de la pré-optimisation
```

| Bibliothèque | Rôle |
|---|---|
| `pdfjs-dist` | Lecture et rendu des PDF, extraction du texte |
| `jspdf` | Création de PDF (images, documents) |
| `pdf-lib` | Fusion et découpe de PDF |
| `mammoth` | DOCX vers HTML |
| `marked` / `turndown` | Markdown vers HTML et retour |
| `xlsx` (SheetJS) | Lecture et écriture XLSX, XLS, ODS |
| `js-yaml` | YAML |
| `heic2any` | Décodage des photos HEIC d'iPhone |
| `jszip` | Création et extraction de ZIP |
| `@ffmpeg/ffmpeg` | Audio, vidéo, GIF animés et TIFF/TGA, via WebAssembly |

Une conversion suit toujours ce chemin : `main.js` appelle `convert(item, cible, réglages, contexte)` dans `convert.js`. Cette fonction choisit le moteur d'après la famille du fichier et renvoie une liste de résultats `{ blob, name }`, qui s'affichent dans la ligne du vol.

## Ajouter un format

1. **`src/formats.js` :** associer l'extension de départ à sa famille dans `EXT_FAMILY`, et ajouter la destination à la famille dans `FAMILIES`.
2. **`src/convert.js` :** traiter la nouvelle destination dans le moteur de la famille, par exemple `encodeImage` pour les images ou `convertAV` pour l'audio et la vidéo.
3. **`src/viewer.js` :** si le lecteur ne sait pas encore ouvrir ce type de fichier, ajouter sa vue.
4. **Tests :** ajouter un fichier d'exemple au dossier de test et lancer `scripts/e2e.mjs`.
