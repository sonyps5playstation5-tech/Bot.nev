import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import readline from 'readline';

// ---------------------- Supabase Client ----------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
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

function respond(message) {
  // Simple local AI: replies based on description
  return "You said: '" + message + "'. " + description;
}

process.stdin.on('data', (data) => {
  const msg = data.toString().trim();
  console.log("[Bot Reply]: " + respond(msg));
});

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

    // Get bot details or respond using local description
    if (action === 'getbot' && id) {
      const { data: bot, error } = await supabase.from('sites').select('*').eq('hash', id).single();
      if (error || !bot) return { statusCode: 404, body: JSON.stringify({ error: "Bot not found" }) };

      if (userMessage) {
        const reply = `You said: '${userMessage}'. ${bot.description}`;
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
