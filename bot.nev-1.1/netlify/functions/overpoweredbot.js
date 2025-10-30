import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import readline from 'readline';

// ---------------------- Supabase Client ----------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing Supabase credentials!");
  console.error("SUPABASE_URL:", SUPABASE_URL || "(undefined)");
  console.error("SUPABASE_KEY:", SUPABASE_KEY ? "(set)" : "(undefined)");
  process.exit(1);
}

console.log("✅ Supabase environment variables loaded.");
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
  console.log("🛠️ Creating bot with description:", description);

  const hash = `bot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const apiKey = generateAPIKey();
  const files = generateUserFiles(description, apiKey);

  if (moderateContent(files)) {
    console.error("❌ Bot contains harmful content. Aborting.");
    return { error: "Harmful content detected" };
  }

  // Only insert essential columns
  const newBot = {
    name: `Bot_${Date.now()}`,
    description,
    files,
    hash,
    created_at: new Date().toISOString(),
    api_key: apiKey
  };

  try {
    const { error } = await supabase.from('sites').insert(newBot);
    if (error) {
      console.error("❌ Supabase Insert Error:", error.message);
      return { error: error.message, details: error.details, hint: error.hint };
    }

    console.log(`✅ Bot created successfully!
- Hash: ${hash}
- API Key: ${apiKey}`);

    return { hash, apiKey };
  } catch (err) {
    console.error("🔥 Unexpected error during insert:", err);
    return { error: err.message || "Unknown error" };
  }
}

async function listBots() {
  const { data: bots, error } = await supabase.from('sites').select('*').limit(10);
  if (error) {
    console.error("❌ Error fetching bots:", error.message);
    return [];
  }
  return bots || [];
}

// ---------------------- CLI Interface ----------------------
if (process.env.CLI_MODE === "true") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("🤖 Overpowered Bot CLI running...");
  console.log("Commands: !ping, !createbot <description>, !listbots");

  rl.on('line', async (input) => {
    const [cmd, ...args] = input.split(' ');
    if (cmd === '!ping') console.log('Pong!');
    else if (cmd === '!createbot') await createBot(args.join(' '));
    else if (cmd === '!listbots') console.log(await listBots());
    else console.log('Unknown command.');
  });
}

// ---------------------- Netlify Function Handler ----------------------
export async function handler(event) {
  try {
    console.log("⚡ Incoming event:", event.httpMethod, event.path);

    const method = event.httpMethod || 'GET';
    const query = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const action = query.action || body.action || null;
    const description = query.description || body.description || null;
    const id = query.id || body.id || null;

    console.log("🧠 Action:", action, "| Description:", description, "| ID:", id);

    if (action === 'listbots') {
      const bots = await listBots();
      return { statusCode: 200, body: JSON.stringify(bots) };
    }

    if (action === 'getbot' && id) {
      const { data: bot, error } = await supabase.from('sites').select('*').eq('hash', id).single();
      if (error || !bot) return { statusCode: 404, body: JSON.stringify({ error: "Bot not found" }) };
      return { statusCode: 200, body: JSON.stringify(bot) };
    }

    if (method === 'POST' && description) {
      const result = await createBot(description);
      if (result.error) return { statusCode: 500, body: JSON.stringify(result) };
      return { statusCode: 200, body: JSON.stringify(result) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Invalid action or missing description" }) };
  } catch (err) {
    console.error("🔥 Handler caught error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown server error" }) };
  }
}
