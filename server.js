import express from "express";
import OpenAI from "openai";
import fs from "fs";
import pdf from "pdf-parse";

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// PDF betöltés
let knowledge = "";

async function loadPDFs() {
  if (knowledge) return; // ne töltse újra

  const files = fs.readdirSync("./pdfs");

  for (const file of files) {
    const data = await pdf(fs.readFileSync(`./pdfs/${file}`));
    knowledge += "\n" + data.text;
  }

  console.log("PDF-ek betöltve");
}

// ❌ NINCS await loadPDFs() itt!

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    await loadPDFs();

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
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
          content: req.body.message || "Adj rövid választ."
        }
      ]
    });

    res.json({
      reply: response.output[0].content[0].text
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(10000, () => console.log("Server fut 10000"));