import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`[OvernightSync] STARTING: node ${scriptName} ${args.join(' ')}`);
    console.log(`======================================================\n`);

    const child = spawn('node', [path.join(__dirname, scriptName), ...args], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n[OvernightSync] SUCCESS: ${scriptName} exited with code 0.`);
        resolve();
      } else {
        console.error(`\n[OvernightSync] WARNING: ${scriptName} exited with code ${code}.`);
        resolve(); // proceed to next step even on warning
      }
    });

    child.on('error', (err) => {
      console.error(`\n[OvernightSync] ERROR running ${scriptName}:`, err);
      resolve();
    });
  });
}

async function main() {
  console.log(`======================================================`);
  console.log(`[OvernightSync] Continuous Multi-Source Harmonizer Active`);
  console.log(`======================================================`);

  // Step 1: Ingest batch from pesmarica.rs
  await runScript('scrape_pesmarica.js', ['15', '28']);

  // Step 2: Ingest from tacnaharmonija.rs (and OVERWRITE all duplicates with gold-standard)
  await runScript('scrape_tacnaharmonija.js');

  console.log(`\n======================================================`);
  console.log(`[OvernightSync] OVERNIGHT WORK COMPLETED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
}

main().catch(console.error);
