# dtwnty online — configurazione Cloudflare

Il progetto è in `C:\Users\ricca\Repo\web-apps\dtwnty`.
Il frontend React resta su GitHub Pages. Il backend è un Cloudflare Worker con un Durable Object SQLite per stanza. Mappe, token, credenziali e memoria personale sono salvati nel database interno della stanza. Non sono necessari R2, D1, KV, bucket o un dominio personalizzato. Usa il piano Workers Free: non occorre attivare R2 né aggiungere una carta per questo progetto.

## 1. Accesso e prerequisiti

Installa Node.js 22.18+ oppure una versione LTS successiva. Apri PowerShell:

```powershell
cd C:\Users\ricca\Repo\web-apps\dtwnty
npm ci
npx wrangler login
```

Completa personalmente l'accesso Cloudflare nella finestra del browser. Mantieni il piano Workers Free; salta completamente la configurazione R2. Il progetto utilizza solo Workers e Durable Objects con backend SQLite, disponibili sul piano gratuito entro le relative quote.

## 2. Autorizza l'origine della webapp

Apri `wrangler.jsonc` e modifica `vars.ALLOWED_ORIGINS`. Esempio:

```json
"vars": {
  "ALLOWED_ORIGINS": "https://TUO-UTENTE.github.io,http://127.0.0.1:5173,http://localhost:5173"
}
```

Sostituisci `TUO-UTENTE` con il tuo utente GitHub. Inserisci l'origine, **senza** `/dtwnty/` e senza slash finale. Se il frontend usa un dominio diverso, inserisci quell'origine HTTPS. Più origini sono separate da una virgola.

Il binding `ROOMS` e la migrazione SQLite `v1` sono già configurati. Non deve esserci alcun binding R2/ASSETS. Il primo deploy crea automaticamente il namespace Durable Objects: non devi crearlo a mano. Mantieni la migrazione nei deploy successivi.

## 3. Pubblica il Worker e imposta la chiave master

```powershell
npm run worker:check
npm run worker:deploy
npx wrangler secret put CREATE_ROOM_KEY
```

All'ultimo comando inserisci una chiave lunga e casuale scelta da te. Non usare la password Cloudflare: questa è una chiave dell'app, che autorizza la creazione di nuove stanze. Sarà richiesta soltanto al master nel pannello online. Non inserirla nei file del frontend, nelle variabili `VITE_*`, nei link di invito o in Git.

Wrangler mostrerà l'indirizzo assegnato al Worker, ad esempio `https://dtwnty-rooms.TUO-SOTTODOMINIO.workers.dev`. Copia l'indirizzo effettivamente restituito. Prima di impostare la chiave, il Worker rifiuta la creazione di stanze.

## 4. Collega il frontend

Apri dtwnty e il pannello **Gioca online**. Nel campo **Server Cloudflare** incolla l'URL del Worker, senza percorsi aggiuntivi.

Puoi usare direttamente questo campo: non serve ricompilare il frontend ogni volta che cambia il server. In alternativa, imposta `VITE_ROOM_SERVER` seguendo `.env.example`, poi esegui nuovamente la build. Questa variabile contiene solo l'URL pubblico, mai la chiave master. Nel workflow GitHub Pages puoi impostarla nello step di build se desideri un valore predefinito sulla versione pubblicata.

Per pubblicare la webapp su GitHub Pages, carica il progetto nel tuo repository e scegli **Settings → Pages → Source → GitHub Actions**. Il workflow incluso pubblica `dist/` sul branch `main`. Il Worker si pubblica separatamente con il comando precedente.

## 5. Prima partita

1. Nell'editor locale carica mappa, occlusion map e token. Configura griglia e portata della luce.
2. Apri **Gioca online**, verifica il server, inserisci la chiave creazione e premi **Crea stanza dal tavolo attuale**.
3. Il master vede l'intero tavolo e un codice di 8 caratteri. **Copia invito** copia un link con codice stanza e server; non contiene credenziali master.
4. Gli altri aprono il link, espandono **Gioca online**, inseriscono il proprio nome e premono **Entra nella stanza**.
5. Il master usa **Assegna personaggi** per assegnare i token giocatore ai partecipanti. Nessun token assegnato significa nessuna luce personale.
6. Ogni partecipante sposta soltanto i propri personaggi. Il server aggiorna luce e visuale al rilascio del token. Porte e finestre illuminate sono cliccabili; il master può gestirle tutte.
7. Ogni giocatore conserva le proprie zone esplorate in penombra. Gli altri giocatori e i nemici sono trasmessi solo se attualmente visibili. Le visuali dei propri eventuali più personaggi vengono unite.
8. Per modificare mappe, aggiungere token o cambiare impostazioni, il master torna all'editor locale, esegue le modifiche, preme **Rientra** e poi **Pubblica modifiche dal tavolo locale**. I normali spostamenti, le assegnazioni e le aperture si sincronizzano direttamente senza questo passaggio.

Per provare più identità sullo stesso computer usa profili browser diversi o una finestra privata per il giocatore. La credenziale di rientro è conservata nel browser: **Rientra** recupera la stessa identità e la sua esplorazione. Una disconnessione di rete viene ritentata automaticamente. Il solo nome non permette di recuperare un'identità dopo la cancellazione dei dati del browser. La chiave creazione non recupera l'accesso master a una stanza esistente.

## 6. Prova completamente locale

Non serve pubblicare su Cloudflare. Copia `.dev.vars.example` in `.dev.vars` e imposta una chiave di test. In due terminali:

```powershell
npm run worker:dev
```

```powershell
npm run dev
```

Il backend usa `http://127.0.0.1:8787`, il frontend `http://127.0.0.1:5173`. La porta 8080 non viene usata. Lo stato del simulatore si trova in `.wrangler/`, escluso da Git.

Per i test automatici online avvia il backend locale con la chiave riservata ai test:

```powershell
npm run worker:dev -- --var CREATE_ROOM_KEY:local-test-only
```

In un altro terminale:

```powershell
npm run test:online
```

Il test crea stanze SQLite locali usa e getta e controlla due giocatori, assegnazioni, immagini oscurate sul server, rifiuto dei comandi non autorizzati e notifiche WebSocket. Non puntarlo al servizio di produzione. Per il controllo dei moduli e della build:

```powershell
npm test
npm run build
npm run worker:check
npm run worker:dry-run
```

## Limiti di questa prima versione

- Massimo 12 identità giocatore per stanza, 100 token e circa 12 MB di tavolo preparato. Le immagini online vengono normalizzate a PNG, massimo 1200 px per lato; i token a 256 px. Le coordinate logiche della mappa restano quelle originali.
- La stanza scade 7 giorni dopo la creazione. Un allarme rimuove il database della stanza e le connessioni; l'eliminazione può avvenire dopo la scadenza se Cloudflare ritarda l'esecuzione. Non usare una stanza come unico archivio della campagna: conserva anche l'esportazione locale del master.
- I partecipanti conoscono i nomi degli altri partecipanti, ma non le posizioni dei token fuori vista. Il server non invia ai giocatori la mappa originale, la occlusion map, la memoria degli altri o le credenziali di altre identità. Immagini già viste in passato non possono essere revocate dal browser del giocatore.
- La fog disattivata dal master rivela intenzionalmente tutto. La vista master online è sempre completa. Non ci sono account, recupero via email o gestione dei posti occupati da credenziali perse: in quel caso si può creare una nuova stanza.
- Come nella versione locale, non sono imposti collisioni dei token, turni o distanze massime di movimento: spostare un personaggio in un'altra zona rivela la visuale della nuova posizione.
- Due modifiche simultanee confliggenti vengono rifiutate con un messaggio e un aggiornamento del tavolo; l'utente può ripetere la propria azione.
- La prima versione privilegia l'isolamento dei dati rispetto alla banda: aggiorna via HTTP le visuali personali e usa WebSocket per notificare i cambiamenti. Le immagini oscurate vengono composte nel Durable Object; prestazioni e costi vanno verificati con il tuo gruppo sul servizio pubblicato.

## Problemi comuni

- **Origine non autorizzata:** correggi `ALLOWED_ORIGINS` con l'origine esatta del frontend e ripubblica il Worker.
- **Chiave creazione non valida:** verifica il secret `CREATE_ROOM_KEY` e la chiave inserita nel pannello. I giocatori non ne hanno bisogno.
- **Failed to fetch:** verifica URL HTTPS del Worker, connessione e origini autorizzate; da GitHub Pages non puoi usare il backend HTTP del tuo PC.
- **Visuale completamente buia:** assegna almeno un token giocatore a quell'identità; verifica che il token non sia dentro un muro rosso o un'apertura chiusa.
- **Stanza piena:** il limite conta le identità create, non solo le connessioni attive. Usa **Rientra** per recuperare l'identità precedente.

Riferimenti ufficiali: [Durable Objects](https://developers.cloudflare.com/durable-objects/get-started/), [WebSocket con ibernazione](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/), [Storage SQLite dei Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Configurazione Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).


## Archivio senza R2

Le immagini vengono deduplicate per contenuto e archiviate in BLOB da 256 KiB, sotto il limite di 2 MB per riga. Posizioni, aperture e memorie personali vengono salvate separatamente dalle immagini in una transazione SQLite: un salvataggio fallito non lascia uno stato parziale. Gli asset non più usati vengono rimossi quando il master sostituisce il tavolo.

Le quote di storage e richieste del piano gratuito continuano ad applicarsi: questo cambiamento elimina il requisito R2, non rende illimitata la piattaforma. La guida ufficiale dei [limiti](https://developers.cloudflare.com/durable-objects/platform/limits/) e la pagina [Durable Objects](https://www.cloudflare.com/products/durable-objects/) descrivono disponibilità e piano gratuito.

Questa versione non importa automaticamente eventuali vecchie stanze conservate da una precedente installazione R2. Per iniziare crea una nuova stanza dal tavolo locale o da un JSON esportato. Non modificare la migrazione SQLite `v1`: il backend delle stanze era già SQLite, ora viene usato anche per le immagini.
