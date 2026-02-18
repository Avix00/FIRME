# ArTen - Registro Visitatori

Un'applicazione web tablet-first per gestire gli ingressi e le uscite dei visitatori aziendali, con firma digitale e integrazione Google Sheets/Drive.

## Setup

### 1. Backend (Google Apps Script)
1. Crea un nuovo Google Sheet con 2 fogli: "Registro"
2. Intestazioni riga 1: `Data | OraEntrata | OraUscita | Nominativo | Ditta | PersonaDaVisitare | ZonaAccesso | Firma`
3. Apri **Estensioni > Apps Script** e incolla il contenuto di `code.gs`
4. Deploy come **App Web** con accesso "Chiunque"

### 2. Frontend
1. Modifica `script.js` riga 7 con l'URL della Web App
2. Modifica `code.gs` con gli ID del foglio e della cartella Drive (se non fatto)

### 3. Deploy (Manuale)
Poiché non hai Node.js installato, il metodo più semplice è:
1. Vai su [vercel.com](https://vercel.com) e accedi/registrati
2. Clicca su **"Add New..."** > **"Project"**
3. Trascina la cartella `INGRESSO VISITATORI` dentro l'area di upload
4. Segui i passaggi (lascia tutto default) e clicca **Deploy**


## Struttura
- `index.html`: Interfaccia utente (SPA)
- `style.css`: Stile (Verde/Nero ArTen)
- `script.js`: Logica client-side
- `code.gs`: Logica server-side (Google)

## Admin
Password predefinita: `arten2026`
