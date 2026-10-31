// Vercel Serverless Function: jembatan aman antara aplikasi dan Claude API.
// Env di Vercel: APP_PASS (kata sandi pribadi) + salah satu: GEMINI_API_KEY (gratis) atau ANTHROPIC_API_KEY (berbayar). Opsional: MODEL.
const SYSTEM = `Kamu membantu seseorang bertadabur atas dua halaman mushaf yang terbuka secara acak.
Balas HANYA dengan satu objek JSON (tanpa teks lain, tanpa pagar kode) berisi kunci string:
asbab, kisah, hukum, tafsir, ringkas, pelajaran, saran, verifikasi.
- asbab: asbabun nuzul dan konteks. Sebutkan sumbernya. Jika tidak ada riwayat yang jelas, tulis bahwa tidak ada. Jangan mengarang riwayat.
- kisah: kisah atau tema utama.
- hukum: perintah, anjuran, larangan.
- tafsir: ringkasan tafsir dengan menyebut kitab rujukan (Ibnu Katsir, Jalalain, Al-Misbah, Kemenag). Bedakan perbedaan pendapat ulama.
- ringkas: konteks dan rangkuman dua halaman.
- pelajaran: pelajaran yang bisa diambil, dikaitkan dengan niat jika ada. Awali dengan "Renungan:" karena ini bukan dari kitab.
- saran: sebutkan 1-2 ayat dari dua halaman ini yang paling layak dijadikan ayat utama, format "QS. Nama Surah nomor:ayat", masing-masing dengan alasan singkat sesuai konteks dan niat. Ini hanya saran.
- verifikasi: daftar singkat klaim yang paling perlu dicek ulang pada kitab aslinya.
Gunakan bahasa Indonesia yang jernih dan ringkas. Tulis teks biasa, boleh pakai baris baru dan tanda "-".
Tandai dengan jelas mana yang bersumber dari kitab dan mana yang renungan.`;

async function viaGemini(userText) {
  const model = process.env.MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 8192 }
    })
  });
  const j = await r.json();
  if (!r.ok) {
    if (r.status === 429) throw new Error('Batas pemakaian gratis tercapai. Coba lagi beberapa menit lagi.');
    throw new Error((j.error && j.error.message) || 'Gemini API gagal');
  }
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map(x => x.text || '').join('');
}

async function viaClaude(userText) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.MODEL || 'claude-sonnet-5-5', max_tokens: 3500, system: SYSTEM, messages: [{ role: 'user', content: userText }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Claude API gagal');
  return (j.content || []).map(b => b.text || '').join('');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
  const { pass, niat, range, ayat, halaman } = req.body || {};
  if (!process.env.APP_PASS || pass !== process.env.APP_PASS) return res.status(401).json({ error: 'Kata sandi salah' });
  if (!ayat || typeof ayat !== 'string' || ayat.length > 20000) return res.status(400).json({ error: 'Data ayat tidak valid' });
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key belum diisi di Vercel' });
  const userText = `Halaman ${halaman}\nCakupan: ${range}\nNiat/persoalan: ${niat || '(tidak ditulis)'}\n\n${ayat}`;
  try {
    const raw = process.env.GEMINI_API_KEY ? await viaGemini(userText) : await viaClaude(userText);
    const txt = raw.replace(/^```json|```$/gm, '').trim();
    let o;
    try { o = JSON.parse(txt); } catch (e) { return res.status(502).json({ error: 'Format balasan tidak terbaca, coba lagi', raw: txt }); }
    return res.status(200).json(o);
  } catch (e) {
    return res.status(502).json({ error: e.message || String(e) });
  }
};
