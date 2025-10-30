// ---------------------- Setup ----------------------
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Use environment variables directly
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Supabase credentials not set in environment variables!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------- Local Bot ----------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("Local bot running...");
console.log("Type commands like !ping, !checksite <id>, !createserver <description>, !listservers");

// ---------------------- Helpers ----------------------
async function checkDuplicate(siteHash) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('hash', siteHash);

  if (error) {
    console.error("Error checking duplicate:", error.message);
    return false;
  }

  return data && data.length > 0;
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

function generateServerHash() {
  return `srv_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function generateDefaultFiles(description) {
  return {
    "index.hsx": `<!-- Auto-generated server -->\n<!-- Description: ${description} -->\n<html>\n<head><title>${description}</title></head>\n<body>\n<h1>${description}</h1>\n</body>\n</html>`
  };
}

// ---------------------- Server Improvement ----------------------
async function improveServer(server) {
  console.log(`Improving server: ${server.name}`);

  const improvedFiles = { ...server.files };
  Object.keys(improvedFiles).forEach(file => {
    improvedFiles[file] += `\n<!-- Auto-improved at ${new Date().toISOString()} -->`;
  });

  if (moderateContent(improvedFiles)) {
    console.log("Server contains harmful content after improvement. Skipping update.");
    return;
  }

  const { error } = await supabase
    .from('sites')
    .update({ files: improvedFiles })
    .eq('hash', server.hash);

  if (error) console.error("Error updating server:", error.message);
  else console.log(`Server "${server.name}" improved successfully!`);
}

// ---------------------- Scheduled Improvements ----------------------
async function runScheduledImprovements() {
  const { data: servers, error } = await supabase.from('sites').select('*');
  if (error) return console.error("Error fetching servers:", error.message);
  if (!servers) return;

  for (const server of servers) {
    const createdAt = new Date(server.created_at);
    const now = new Date();
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    if ([1, 3, 7, 30, 90, 365].includes(diffDays)) {
      await improveServer(server);
    }
  }
}

setInterval(runScheduledImprovements, 60 * 1000);

// ---------------------- Commands ----------------------
async function handleCommand(input) {
  const [cmd, ...args] = input.split(' ');

  if (cmd === '!ping') console.log('Pong!');

  else if (cmd === '!checksite') {
    const siteId = args[0];
    const { data: site, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (error || !site) return console.log('Site not found.');
    const flagged = moderateContent(site.files);
    const duplicate = await checkDuplicate(site.hash);
    console.log(`Site: ${site.name}\nFlagged: ${flagged}\nDuplicate: ${duplicate}`);
  }

  else if (cmd === '!createserver') {
    const description = args.join(' ');
    console.log(`Starting automated server creation for description: "${description}"`);

    const hash = generateServerHash();
    const files = generateDefaultFiles(description);

    if (moderateContent(files)) return console.log("Server contains harmful content. Creation aborted.");
    if (await checkDuplicate(hash)) return console.log("A server with similar content already exists.");

    const newServer = {
      name: `Server_${Date.now()}`,
      description,
      files,
      hash,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('sites').insert(newServer);
    if (error) console.error("Failed to insert server:", error.message);
    else console.log(`Server created successfully!\n- Server ID: ${hash}\n- Files: ${Object.keys(files).join(', ')}`);
  }

  else if (cmd === '!listservers') {
    const { data: sites, error } = await supabase.from('sites').select('*').limit(10);
    if (error) return console.error("Error fetching servers:", error.message);
    if (!sites || sites.length === 0) return console.log("No servers found.");

    const list = sites.map(s => `- ${s.name} (ID: ${s.hash})`).join("\n");
    console.log(`Servers:\n${list}`);
  }

  else console.log('Unknown command.');
}

// ---------------------- Listen for Local Input ----------------------
rl.on('line', handleCommand);
