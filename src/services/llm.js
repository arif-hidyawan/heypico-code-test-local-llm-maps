import axios from 'axios';

function naiveParse(userQuery) {
  // Fallback simple kalau LLM belum dipakai / error:
  // anggap user nyari restoran, query langsung dilempar ke Google Places.
  return {
    queryText: userQuery,
    locationHint: '',
    placeType: 'restaurant',
  };
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in LLM response');
  }
  const jsonStr = text.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

export async function parseUserQueryWithLLM(userQuery) {
  const baseUrl = process.env.LLM_API_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'llama-3';

  // Kalau belum di-set, langsung fallback
  if (!baseUrl || !apiKey) {
    return naiveParse(userQuery);
  }

  try {
    const systemPrompt = `
Kamu adalah asisten travel.
Tugasmu: dari pertanyaan user, ekstrak informasi dan jawab SELALU DALAM JSON murni dengan format:

{
  "query_text": "...",      // teks pencarian utama, misal "tempat makan enak"
  "location_hint": "...",   // lokasi kota/area, misal "Jakarta", boleh kosong
  "place_type": "restaurant" // jenis tempat: restaurant, cafe, tourist_attraction, hotel, dst
}

Jangan kirim teks lain selain JSON.
`;

    const resp = await axios.post(
      `${baseUrl}/chat/completions`, // perhatikan: TANPA /v1 di depan
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery },
        ],
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );

    const content = resp.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    let parsed;
    try {
      parsed = extractJson(content);
    } catch (e) {
      // Kalau gagal parse JSON, fallback
      console.warn('Failed to parse JSON from LLM, using naive parse:', e.message);
      return naiveParse(userQuery);
    }

    return {
      queryText: parsed.query_text || userQuery,
      locationHint: parsed.location_hint || '',
      placeType: parsed.place_type || 'restaurant',
    };
  } catch (err) {
    // Jangan bikin API gagal total, log aja dan fallback
    console.error('LLM error, falling back to naive parse:', err.message);
    return naiveParse(userQuery);
  }
}

