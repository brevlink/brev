# Brev - Dashboard UI v2 - brief di implementazione

Attuato, in esercizio. Due cose sono cambiate dopo la stesura: i token sono confluiti in
un'unica sorgente condivisa con la landing (design/palette.css), e `--color-line` si è
separato in `--color-line` (bordi decorativi) e `--color-control` (bordi dei controlli
interattivi), per il requisito di contrasto sul confine dei controlli.

## 1. Obiettivo di questa passata (e solo di questa)

Rifare la veste e la struttura della dashboard (`dashboard/`): un design system di token
+ primitive di proprietà, e **tre schermate con routing vero** al posto della pagina unica
con sezioni ancorate all'hash.

**Questa passata è solo UI.** Nessuna funzionalità nuova, nessun cambio al backend,
nessuna dipendenza npm nuova.

## 2. Fuori scope - vietato in questa passata

- Statistiche, QR code, impostazioni account (cambio email, cancellazione, export CSV),
  stato del dominio più trasparente, 404 degradata per i link scaduti: sono **fasi
  successive**, non vanno toccate qui.
- Non si toccano: `backend/**`, `landing/**`, `Caddyfile`, `docker-compose.yml`,
  `.github/**`, migrazioni Alembic.
- Nessun `npm install`, nessuna dipendenza nuova: si usa React 19, react-router-dom 7 e
  Tailwind 4 già presenti in `dashboard/package.json`.
- Nessun commit su `main`, nessun push, nessun deploy. Si lavora sul branch `feat/ui-v2`.
- Non toccare la palette (vedi §3).

## 3. Vincoli di brand - non negoziabili

L'identità attuale (landing compresa) resta quella. I valori sono già nel codice
(`landing/src/pages/index.astro`):

- navy `#071936` (testo, superfici piene, bottone primario), navy attenuato `#38516f`
- beige `#f8f1e6`, `#efe6d4` (fondi), pericolo `#b42318`, esito positivo `#17683a`
- display: **Instrument Serif**; testo: **Inter**
- L'accento caldo `#d9c5a5` / `rgba(217,197,165,…)` **è troppo arancione e va ridotto**:
  sostituiscilo con una tinta beige più neutra, e usalo con parsimonia. Non è da
  eliminare: serve a dare calore al fondo.

Vietato: inventare una palette nuova, introdurre dark mode, cambiare i due font,
introdurre gradienti viola/blu "da SaaS".

## 4. Cosa costruire

### 4.1 Token (Tailwind v4, CSS-first)

`dashboard/src/index.css` oggi contiene solo `@import "tailwindcss";`. Aggiungi un blocco
`@theme` con **nomi semantici**, non `navy`/`beige`: chi scrive un componente deve
chiedere "superficie", non ricordare un esadecimale.

| token | valore | uso |
| --- | --- | --- |
| `--color-surface` | `#f8f1e6` | fondo pagina |
| `--color-surface-raised` | `rgba(255,250,241,0.38)` | pannelli e righe |
| `--color-surface-solid` | `#fffaf1` | superfici opache (dialog) |
| `--color-ink` | `#071936` | testo, bottone primario |
| `--color-ink-muted` | `#38516f` | testo secondario |
| `--color-line` | `rgba(7,25,54,0.14)` | bordi decorativi |
| `--color-control` | `rgba(7,25,54,0.5)` | bordi dei controlli interattivi |
| `--color-accent` | beige neutro (non arancione) | accento residuo |
| `--color-danger` | `#b42318` | errori |
| `--color-success` | `#17683a` | esiti positivi |
| `--font-display` | Instrument Serif | titoli |
| `--font-sans` | Inter | testo |

Aggiungi anche i token di forma: raggio (oggi 28px pannelli, 18px righe, `full` bottoni),
ombra e durata delle transizioni, così i valori smettono di essere ripetuti in ogni file.

### 4.2 Primitive di proprietà (`dashboard/src/components/ui/`)

Forma da shadcn/ui, **scritte a mano**: nessuna dipendenza nuova, niente Radix in questa
passata.

`Button` (primary, secondary, danger, ghost + size), `Input`, `Label`/`Field`,
`Panel`/`Card`, `DataRow`, `StatusBadge`, `Alert`, `EmptyState`, `Dialog` (riusa la logica
e l'accessibilità già presenti in `CreateLinkModal.jsx`), `PageHeader`, `NavTabs`.

Regole:
- ogni primitiva accetta `className` e lo fonde con le proprie classi;
- `data-slot` su ogni primitiva (stile shadcn: rende la manutenzione e il restyling
  mirato possibili senza toccare i file dei componenti);
- nessuna classe copiata identica in tre file diversi: se serve due volte, è una
  primitiva.

`styles/ui.js` **non deve restare** la lista di classi Tailwind: sostituiscilo con i token
e le primitive. Se un pacchetto di classi serve ancora in più punti, esponilo come
primitiva, non come stringa.

**Priorità:** token + primitive + *una* schermata fatta bene valgono più di tre schermate
approssimate. Se il tempo stringe, finisci prima il fondamento.

### 4.3 Struttura: da una pagina a hash a tre schermate

Oggi: un'unica rotta `/dashboard` che sceglie la sezione da `location.hash`
(`#links`, `#domains`, `#billing`, `#api-keys`), con un `<h1>` che cambia testo
(`dashboard/src/pages/Dashboard.jsx`, `dashboard/src/components/Layout.jsx`).

Target:

- `/dashboard/links` - lista, ricerca, paginazione, crea, modifica, copia, elimina
- `/dashboard/domains` - domini, verifica DNS, membri, inviti
- `/dashboard/account` - piano/billing e API keys; lascia il posto per le impostazioni
  che arriveranno dopo
- `/admin` resta com'è
- `/dashboard` e i vecchi hash **reindirizzano** alle nuove rotte: chi ha un bookmark
  `#domains` non deve rompersi
- invariati: `/login`, `/register`, `/verify-email`, `/reset-password`,
  `/invites/accept`, `/report`

La shell (`Layout.jsx`) diventa navigazione vera fra le tre sezioni, non ancore. Lo stato
attivo si legge dal path, non dall'hash. Il menu mobile deve continuare a funzionare.

Le rotte annidate funzionano anche in produzione: nginx serve la SPA con
`try_files $uri $uri/ /index.html`, quindi un hard refresh su `/app/dashboard/links` è
coperto. Non serve toccare Caddy o nginx.

### 4.4 Comportamento che non deve cambiare

Tutte le chiamate in `dashboard/src/api/client.js` e i loro payload; i blocchi di verifica
email (`VerifyEmailNotice`, 403 "verifica la mail"); i token nei link trasportati nel
fragment; i testi di stato già presenti (billing, dominio in verifica); l'accessibilità
esistente (`aria-label`, `role="status"`, gestione del focus).

## 5. Criteri di accettazione

1. `npm run build` verde e `npm run lint` pulito, eseguiti in `dashboard/`.
2. Le tre sezioni sono raggiungibili da rotte reali; `/dashboard` e i vecchi hash
   reindirizzano; nessun 404 interno.
3. `dashboard/src/styles/ui.js` non contiene più la definizione della veste.
4. Nessuna dipendenza aggiunta in `dashboard/package.json`; nessun file toccato fuori da
   `dashboard/**` e da questo brief.
5. Nessun cambiamento nei contratti API.
6. `git status` sul branch: solo file dentro `dashboard/` più questo brief.
