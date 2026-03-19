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
    const parts = splitText(data.text, 1000);
    chunks.push(...parts);
  }

  loading = false;

  console.log("PDF chunkolva:", chunks.length);
}

// ===== EGYSZERŰ KERESŐ =====
function searchChunks(query) {
  const keywords = query.toLowerCase().split(" ");

  return chunks
    .map(chunk => {
      let score = 0;

      for (const word of keywords) {
        if (chunk.toLowerCase().includes(word)) {
          score++;
        }
      }

      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // TOP 5 releváns rész
    .map(c => c.chunk)
    .join("\n\n");
}

// ===== CHAT ENDPOINT =====
app.post("/chat", async (req, res) => {
  try {
    await loadPDFs();

    const userMessage = req.body?.message || "Adj rövid választ.";

    const relevantText = searchChunks(userMessage);

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