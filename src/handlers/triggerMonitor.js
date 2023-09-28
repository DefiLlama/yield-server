const { getStaleProjects } = require('../queries/monitor');
const { sendMessage } = require('../utils/discordWebhook');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const stale = await getStaleProjects();

  if (stale.length) {
    const message = stale
      .map(
        (p) =>
          `${p.project}: ${p.stale_since.days ?? 0} day(s) ${
            p.stale_since.hours
          }:${p.stale_since.minutes}:00 ago (${p.nb_effected_pools} pool(s))`
      )
      .join('\n');
    await sendMessage(message, process.env.STALE_PROJECTS_WEBHOOK);
  }
};
