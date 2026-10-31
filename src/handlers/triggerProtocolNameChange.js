const axios = require('axios');
const { sendMessage } = require('../utils/discordWebhook');
const { getYieldsApiUrl } = require('../adaptors/utils');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const protocols = (await axios('https://api.llama.fi/config/yields')).data
    .protocols;

  const yieldsProtocols = (await axios.get(getYieldsApiUrl('/meta'))).data.data
    .protocols;
  const uniqueProjects = [...new Set(yieldsProtocols.map((p) => p.slug))];

  const noMatch = [];
  for (const project of uniqueProjects) {
    if (!protocols[project]) {
      noMatch.push(project);
    }
  }

  if (noMatch.length) {
    await sendMessage(
      `V1 server: Check /protocols slug for ${noMatch}`,
      process.env.STALE_PROJECTS_WEBHOOK
    );
  }
};
