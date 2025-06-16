const fetch = require('node-fetch');
const logger = require("../utils/logger");

// copy pasta from defillama-server
module.exports.sendMessage = async (message, webhookUrl, formatted = true) => {
  if (!webhookUrl || webhookUrl === '') {
    logger.info('No webhook URL provided');
    return;
  }

  const formattedMessage = formatted ? '```\n' + message + '\n```' : message; 
  
  // Put it into a code block to prevent the format from getting messed up
  if (formattedMessage.length >= 2000) {
    const lines = message.split('\n');
    if (lines.length <= 2) {
      throw new Error('Lines are too long, reaching infinite recursivity');
    }
    const mid = Math.round(lines.length / 2);
    await sendMessage(lines.slice(0, mid).join('\n'), webhookUrl);
    await sendMessage(lines.slice(mid).join('\n'), webhookUrl);
    return;
  }

  logger.info('Sending message to discord:', message);
  // Example: https://gist.github.com/dragonwocky/ea61c8d21db17913a43da92efe0de634
  // Docs: https://gist.github.com/dragonwocky/ea61c8d21db17913a43da92efe0de634
  const response = await fetch(`${webhookUrl}?wait=true`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: formattedMessage,
    }),
  }).then((body) => body.json());
  logger.info('Response from discord:', response);
};
