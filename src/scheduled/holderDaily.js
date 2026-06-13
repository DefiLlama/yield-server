const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../config.env'),
});

const { spawn } = require('child_process');
const cron = require('node-cron');
const { sendMessage } = require('../utils/discordWebhook');

const JOB_PATH = path.resolve(__dirname, '../jobs/holderDaily.js');
const DISCORD_WEBHOOK = process.env.STALE_PROJECTS_WEBHOOK;

function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit',
      env: { ...process.env },
    });

    p.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${args.join(' ')} exited with code ${code}`))
    );

    p.on('error', (err) =>
      reject(
        new Error(`${args.join(' ')} failed to start: ${err?.message || err}`)
      )
    );
  });
}

function withRecovery(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`❌ ${name} error:`, err);
      if (!DISCORD_WEBHOOK) return;
      try {
        await sendMessage(
          `[${name}] failed\n${err?.message || String(err)}`,
          DISCORD_WEBHOOK
        );
      } catch (discordErr) {
        console.error('❌ holderDaily discord notify error:', discordErr);
      }
    }
  };
}

let jobRunning = false;

const _holderDailyRun = withRecovery('holderDaily', async () => {
  await run(process.execPath, [JOB_PATH]);
  console.log('✅ holderDaily finished');
});

async function holderDailyRun() {
  if (jobRunning) {
    console.log('previous holderDaily run still running -> skipping');
    return;
  }

  jobRunning = true;
  try {
    await _holderDailyRun();
  } finally {
    jobRunning = false;
  }
}

console.log('holderDaily scheduler started (daily at 00:05 UTC)');

cron.schedule(
  '5 0 * * *',
  () => {
    console.log('starting holderDaily daily run');
    holderDailyRun();
  },
  { timezone: 'UTC' }
);
