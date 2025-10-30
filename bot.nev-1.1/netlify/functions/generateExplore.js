import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fetch from 'node-fetch';
import readline from 'readline';

// ---------------------- Supabase Client ----------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPEN_ROUTER_API_KEY) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------- Helpers ----------------------
function generateAPIKey() {
  const randomBytes = crypto.randomBytes(32);
  const timestamp = Date.now().toString(36);
  return `${randomBytes.toString('base64url')}_${timestamp}`;
}

function moderateContent(files) {
  const harmfulPatterns = ["<script>alert", "eval(", "malicious"];
  for (let file of Object.values(files)) {
    for (let pattern of harmfulPatterns) {
      if (file.includes(pattern)) return true;
    }
  }
  return false;
}

function generateUserFiles(description, apiKey) {
  return {
    "bot.js": `// Auto-generated bot
const API_KEY = "${apiKey}";
const description = "${description}";
console.log("Bot is ready!");`
  };
}

// ---------------------- Bot Actions ----------------------
async function createBot(description) {
  const hash = `bot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const apiKey = generateAPIKey();
  const files = generateUserFiles(description, apiKey);

  if (moderateContent(files)) {
    return { error: "Harmful content detected" };
  }

  const newBot = {
    name: `Bot_${Date.now()}`,
    description,
    files,
    hash,
    created_at: new Date().toISOString(),
    api_key: apiKey
  };

  const { error } = await supabase.from('sites').insert(newBot);
  if (error) return { error: error.message };

  return { hash, apiKey };
}

async function listBots() {
  const { data: bots, error } = await supabase.from('sites').select('*').limit(10);
  if (error) return [];
  return bots || [];
}

// ---------------------- OpenRouter GPT-5 Response ----------------------
async function getAIResponse(botDescription, userMessage) {
  const prompt = `You are a bot with this description: "${botDescription}". Respond conversationally to the user message: "${userMessage}".`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPEN_ROUTER_API_KEY}`,
      "HTTP-Referer": "https://your-app-domain.com", // optional but recommended
      "X-Title": "Overpowered Bot",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("❌ OpenRouter API Error:", res.status, errText);
    return "⚠️ Bot failed to respond (OpenRouter error)";
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "🤖 No reply generated.";
}

// ---------------------- Netlify Function Handler ----------------------
export async function handler(event) {
  try {
    const method = event.httpMethod || 'GET';
    const query = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const action = query.action || body.action || null;
    const description = query.description || body.description || null;
    const id = query.id || body.id || null;
    const userMessage = query.message || body.message || null;

    // List bots
    if (action === 'listbots') {
      const bots = await listBots();
      return { statusCode: 200, body: JSON.stringify(bots) };
    }

    // Get bot details (or respond)
    if (action === 'getbot' && id) {
      const { data: bot, error } = await supabase.from('sites').select('*').eq('hash', id).single();
      if (error || !bot) return { statusCode: 404, body: JSON.stringify({ error: "Bot not found" }) };

      if (userMessage) {
        const reply = await getAIResponse(bot.description, userMessage);
        return { statusCode: 200, body: JSON.stringify({ ...bot, reply }) };
      }

      return { statusCode: 200, body: JSON.stringify(bot) };
    }

    // Create new bot
    if (method === 'POST' && description) {
      const result = await createBot(description);
      if (result.error) return { statusCode: 500, body: JSON.stringify(result) };
      return { statusCode: 200, body: JSON.stringify(result) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Invalid action or missing description" }) };
  } catch (err) {
    console.error("Handler error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown server error" }) };
  }
}
