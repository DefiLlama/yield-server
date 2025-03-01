const axios = require('axios');
const { sendMessage } = require('../utils/discordWebhook');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const protocols = (await axios('https://api.llama.fi/config/yields')).data
    .protocols;

  const pools = (await axios.get('https://yields.llama.fi/pools')).data.data;
  const uniqueProjects = [...new Set(pools.map((p) => p.project))];

  const noMatch = [];
  for (const project of uniqueProjects) {
    if (!protocols[project]) {
      noMatch.push(project);
    }
  }

  if (noMatch.length) {
    await sendMessage(
      `Check /protocols slug for ${noMatch}`,
      process.env.STALE_PROJECTS_WEBHOOK
    );
  }
};
