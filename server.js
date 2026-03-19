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

// PDF betöltés
let knowledge = "";
let loading = false;

async function loadPDFs() {
  if (knowledge || loading) return;

  loading = true;

  const files = fs.readdirSync("./pdfs");
  let temp = "";

  for (const file of files) {
    const data = await pdf(fs.readFileSync(`./pdfs/${file}`));
    temp += "\n" + data.text;
  }

  knowledge = temp;
  loading = false;

  console.log("PDF-ek betöltve");
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    await loadPDFs();

    const userMessage = req.body?.message || "Adj rövid választ.";

    const response = await client.chat.completions.create({
      model: "openrouter/hunter-alpha",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `
Te pályázati szakértő vagy.

SZABÁLYOK:
- Csak a dokumentumból válaszolj
- Ne találj ki semmit
- Ha nincs válasz: "Erre nincs információ a dokumentumban."

DOKUMENTUM:
${knowledge.slice(0, 6000)}
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

// ✅ UTÁNA
res.json({ reply });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server fut", PORT));