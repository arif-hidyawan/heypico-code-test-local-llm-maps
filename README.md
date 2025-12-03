# HeyPico.ai – Local LLM + Google Maps Code Test

This repository contains my solution for the HeyPico.ai technical test:

> Run your own local LLM that can output a Google Maps map when the user asks where to find places to go / eat / etc.  
> The user should be able to view the location on an embedded map or open a link to see directions.

## Architecture

- **Backend**: Node.js + Express  
- **LLM layer**: pluggable, designed to work with a local OpenAI-compatible endpoint  
  (e.g. [Open WebUI](https://github.com/open-webui/open-webui) running a local model like Llama3)
- **Maps**: Google Maps Platform
  - **Places API** (Text Search) – called server-side
  - Google Maps iframe for embedding the selected location (no API key exposed to the browser)

### High-level flow

1. User types a natural language request in the web UI  
   e.g. _"find a cozy cafe in South Jakarta"_.
2. Frontend calls `POST /api/places` with the raw query.
3. Backend uses the LLM to **parse** the user query into:
   - `query_text` – what the user is looking for (e.g. `"cozy cafe"`)
   - `location_hint` – optional location/city (e.g. `"South Jakarta"`)
   - `place_type` – rough type such as `restaurant`, `cafe`, `tourist_attraction`, etc.
4. Backend builds a text search query and calls **Google Places Text Search API**.
5. The API response is normalized into:
   - name, address, lat/lng, rating, URLs for:
     - open in Google Maps
     - open directions
     - embed URL for the map iframe
6. Frontend renders:
   - A **list of places** on the left
   - An **embedded map** on the right that updates when you click a place.

If the LLM endpoint is not configured or returns an error, the backend **falls back** to a simple heuristic: it directly passes the user query into Google Places as a text search.

---

## Stack & Files

- `src/server.js`
  - Express app
  - Security middleware (CORS, Helmet, rate limiting)
  - Reverse proxy–friendly (`app.set('trust proxy', 1)`)
  - Endpoints:
    - `GET /api/health` – health check
    - `POST /api/places` – core API to fetch places
    - Serves static files from `public/`

- `src/services/llm.js`
  - `parseUserQueryWithLLM(query: string)`
  - Calls an OpenAI-compatible `/chat/completions` endpoint when configured
  - On any failure (404, timeout, parse error, etc.), logs the error and falls back to a naive parser.

- `public/index.html`
  - Minimal, framework-free frontend
  - Simple search input + results list + embedded map
  - Calls `/api/places` via `fetch` and renders the response.

---

## Security & Best Practices

- **API keys are never committed**  
  - Config is loaded from `.env`
  - `.env` is gitignored (`.env.example` is provided instead)

- **Google Maps API key security**
  - The key is used **only server-side** to call Places API.
  - The embedded map uses a  
    `https://www.google.com/maps?q=LAT,LNG&output=embed` URL,  
    so the key is **not exposed to the browser**.
  - On Google Cloud, the key is restricted by:
    - Application restriction: server IP
    - API restriction: Places API only

- **Rate limiting**
  - Global rate limit to protect the API from abuse.
  - Extra per-route rate limit for `/api/places`.

- **Reverse proxy aware**
  - `app.set('trust proxy', 1)` so rate-limiting uses the real client IP when running behind Nginx.
  - Nginx is configured as a simple reverse proxy on `heypico.arifhidyawan.com`, forwarding to `localhost:3000`.

---

## Running the project

### Requirements

- Node.js 20+
- npm
- Google Cloud project with:
  - Places API enabled
  - API key with IP restriction for your server

Optionally:

- A local LLM server (e.g. Open WebUI) that exposes an OpenAI-compatible `/chat/completions` endpoint.

### 1. Install dependencies

```bash
npm install
