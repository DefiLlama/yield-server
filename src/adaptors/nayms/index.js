const superagent = require('superagent');

const chainNames = {
  1: 'Ethereum',
  8453: 'Base',
};

const formatString = (inputArray) =>
  inputArray
    .map((str) =>
      str
        .split(/_|(?=[A-Z])/)
        .map(
          (word) =>
            `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
        )
        .join(' ')
    )
    .join(', ');

const fetchData = async (chainId) => {
  try {
    const {
      body: { data },
    } = await superagent
      .get('https://api.nayms.com/opportunity/public')
      .accept('application/json')
      .set({
        'X-Nayms-Network-Id': chainId.toString(),
        Origin: 'https://app.nayms.com',
      });

    return data
      .filter(({ cellStatus }) => cellStatus !== 'CLOSED')
      .map(
        ({
          id,
          participationTokenSymbol,
          paidInCapital,
          targetRoiMin,
          assetToken,
          businessTypes,
          cellStatus,
        }) => ({
          pool: id,
          chain: chainNames[chainId] ?? 'Unknown Chain',
          project: 'nayms',
          symbol: assetToken.symbol,
          tvlUsd: paidInCapital,
          apy: targetRoiMin,
          underlyingTokens: [assetToken.address],
          poolMeta: `${participationTokenSymbol}, ${formatString(businessTypes)} (Status: ${cellStatus})`,
        })
      );
  } catch ({ status, response }) {
    throw new Error(
      `Network response was not ok: ${status} - ${
        response?.text ?? 'No response text'
      }`
    );
  }
};

const apy = async () => {
  const chainsToFetch = [1, 8453];
  const data = await Promise.all(chainsToFetch.map(fetchData));
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.nayms.com/opportunities',
};
