import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { parseUserQueryWithLLM } from './services/llm.js';

dotenv.config();

// __dirname untuk ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Middleware dasar
app.use(express.json());
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// Rate limit global sederhana
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Rate limit khusus /api/places (lebih ketat)
const placesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 20,             // 20 request / menit / IP
});

// Endpoint: cari tempat via LLM + Google Places
app.post('/api/places', placesLimiter, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required as string' });
    }

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      return res.status(500).json({ error: 'Google Maps API key is not configured' });
    }

    // 1) Parse query dengan LLM (atau fallback naive)
    const parsed = await parseUserQueryWithLLM(query);
    const { queryText, locationHint, placeType } = parsed;

    const textSearchQuery = [placeType, queryText, locationHint]
      .filter(Boolean)
      .join(' ')
      .trim();

    // 2) Panggil Google Places Text Search API
    const resp = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query: textSearchQuery,
          key: googleApiKey,
        },
      },
    );

    if (resp.data.status !== 'OK' && resp.data.status !== 'ZERO_RESULTS') {
      return res.status(502).json({
        error: 'Error from Google Places API',
        status: resp.data.status,
        message: resp.data.error_message,
      });
    }

    const places = (resp.data.results || []).slice(0, 5).map((p) => {
      const lat = p.geometry?.location?.lat;
      const lng = p.geometry?.location?.lng;

      const baseQuery = `${p.name} ${p.formatted_address || ''}`;

      return {
        name: p.name,
        address: p.formatted_address,
        lat,
        lng,
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
        place_id: p.place_id,
        google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          baseQuery,
        )}`,
        directions_url: lat && lng
          ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
          : null,
        // embed URL untuk iframe (menggunakan Maps Embed API)
        map_embed_url: lat && lng
          ? `https://www.google.com/maps/embed/v1/place?key=${googleApiKey}&q=${lat},${lng}`
          : null,
      };
    });

    res.json({
      original_query: query,
      search_query: textSearchQuery,
      parsed,
      count: places.length,
      places,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'HeyPico LLM + Maps backend',
    timestamp: new Date().toISOString(),
  });
});

// Root: kirim index.html kalau ada
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

