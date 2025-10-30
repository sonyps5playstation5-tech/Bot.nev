import { createClient } from '@supabase/supabase-js';

// ---------------------- Supabase Client ----------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Supabase credentials missing!");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------- Generate Explore HTML ----------------------
async function generateExploreHTML() {
  const { data: bots, error } = await supabase.from('sites').select('*');

  if (error) {
    console.error("Error fetching bots:", error.message);
    return `<h1 style="color:red;">Error fetching bots: ${error.message}</h1>`;
  }

  let botHTML = '';
  bots.forEach((bot, index) => {
    const filesObj = bot.files || {};
    const botFile = filesObj['bot.js'] || '// No bot file';
    const safeDescription = bot.description.replace(/"/g, '&quot;');

    botHTML += `
    <div class="bot" data-description="${safeDescription}" id="bot-${index}">
      <h2>${bot.name}</h2>
      <p>${bot.description}</p>
      <pre>${botFile}</pre>
      <input type="text" id="input-${index}" placeholder="Say something..." />
      <button onclick="sendMessage(${index})">Send</button>
      <div id="chat-${index}" style="margin-top:5px; background:#eee; padding:5px; border-radius:5px; min-height:30px;"></div>
    </div>
    `;
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Explore Bots</title>
<style>
body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }
.bot { background: #fff; padding: 10px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);}
pre { background: #eee; padding: 10px; border-radius: 5px; overflow-x: auto; }
input { padding: 5px; width: 70%; margin-right: 5px; }
button { padding: 5px 10px; }
</style>
</head>
<body>
<h1>Explore Bots</h1>
${botHTML || '<p>No bots found yet.</p>'}

<script>
function sendMessage(index) {
  const botDiv = document.getElementById('bot-' + index);
  const input = document.getElementById('input-' + index);
  const chat = document.getElementById('chat-' + index);
  const msg = input.value.trim();
  if(!msg) return;

  const description = botDiv.getAttribute('data-description');
  const reply = "You said: '" + msg + "'. " + description;

  chat.innerHTML += "<div><strong>You:</strong> " + msg + "</div>";
  chat.innerHTML += "<div><strong>Bot:</strong> " + reply + "</div>";
  input.value = "";
}
</script>

</body>
</html>
`;
}

// ---------------------- Netlify Function Handler ----------------------
export async function handler(event, context) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Supabase environment variables not set."
    };
  }

  try {
    const html = await generateExploreHTML();
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Error generating explore page."
    };
  }
}
