import express from "express";
import OpenAI from "openai";
import fs from "fs";
import pdf from "pdf-parse";

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// ===== PDF CHUNK TÁROLÁS =====
let chunks = [];
let loading = false;

// ===== SZÖVEG DARABOLÁS =====
function splitText(text, size = 1000) {
  const result = [];
  for (let i = 0; i < text.length; i += size) {
    result.push(text.slice(i, i + size));
  }
  return result;
}

// ===== PDF BETÖLTÉS =====
async function loadPDFs() {
  if (chunks.length || loading) return;

  if (!fs.existsSync("./pdfs")) {
    console.log("Nincs pdfs mappa!");
    return;
  }

  loading = true;

  const files = fs.readdirSync("./pdfs");
for (const file of files) {
  const data = await pdf(fs.readFileSync(`./pdfs/${file}`));

  // 👉 EZ AZ ÚJ RÉSZ
  const cleanText = data.text.replace(/\s+/g, " ");

  const parts = splitText(cleanText, 1000);
  chunks.push(...parts);
}

  loading = false;

  console.log("PDF chunkolva:", chunks.length);
}

// ===== EGYSZERŰ KERESŐ =====
function searchChunks(query) {
  const q = query.toLowerCase();

  const results = [];

  for (const chunk of chunks) {
    const text = chunk.toLowerCase();

    let score = 0;

    // kulcsszavak
    if (q.includes("támogatás") && text.includes("támogat")) score += 3;
    if (q.includes("max") && text.includes("max")) score += 2;
    if (q.includes("mennyi") && text.match(/\d/)) score += 2;

    // szám keresés (nagyon fontos!)
    if (text.match(/\d{3,}/)) score += 1;

    // pénz / összeg kulcsszavak
    if (text.includes("ft") || text.includes("forint") || text.includes("eur")) score += 2;

    if (score > 0) {
      results.push({ chunk, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.chunk)
    .join("\n\n");
}

// ===== CHAT ENDPOINT =====
app.post("/chat", async (req, res) => {
  try {
    await loadPDFs();

    const userMessage = req.body?.message || "Adj rövid választ.";

    const relevantText = searchChunks(userMessage);

	console.log("RELEVANT:", relevantText.slice(0, 500));

if (!relevantText) {
  return res.json({
    reply: "Nem találtam releváns részt a dokumentumban."
  });
}

    const response = await client.chat.completions.create({
      model: "deepseek/deepseek-chat",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `
Te pályázati szakértő vagy.

SZABÁLYOK:
- Csak a megadott szövegből válaszolj
- Ne találj ki semmit
- Ha nincs válasz: "Erre nincs információ a dokumentumban."

SZÖVEG:
${relevantText}
          `
        },
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const reply =
      response.choices?.[0]?.message?.content ||
      response.choices?.[0]?.text ||
      JSON.stringify(response);

    res.json({ reply });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== SERVER INDÍTÁS =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server fut", PORT));