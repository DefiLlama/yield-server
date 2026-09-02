module.exports.reportHeartbeat = async function reportHeartbeat(check, { team = 'yields', severity = 'fyi', tier = '0' } = {}) {
  const url = process.env.LLAMA_METRICS_URL;
  const token = process.env.LLAMA_PUSH_TOKEN;
  if (!url || !token) {
    console.log(`[heartbeat] ${check}: LLAMA_METRICS_URL/LLAMA_PUSH_TOKEN not set, skipping`);
    return;
  }

  const body = new URLSearchParams({
    service: 'yields-api', check, team, severity, tier, status: 'ok',
  }).toString();

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/job`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.log(`[heartbeat] ${check}: POST /job -> ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
    else console.log(`[heartbeat] ${check}: ok`);
  } catch (err) {
    console.log(`[heartbeat] ${check}: ${err?.message || err}`);
  }
};
