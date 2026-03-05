const axios = require('axios');

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
      data: { data },
    } = await axios.get('https://api.nayms.com/opportunity/public', {
      headers: {
        Accept: 'application/json',
        'X-Nayms-Network-Id': chainId.toString(),
        Origin: 'https://app.nayms.com',
      },
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
          symbol: assetToken?.symbol,
          tvlUsd: paidInCapital,
          apy: targetRoiMin,
          underlyingTokens: [assetToken?.address],
          poolMeta: `${participationTokenSymbol}, ${formatString(
            businessTypes
          )} (Status: ${cellStatus})`,
        })
      );
  } catch (err) {
    const responseData =
      typeof err.response?.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response?.data ?? {});
    throw new Error(
      `Network response was not ok: ${err.status ?? 'unknown'} - ${
        responseData || err.message || 'No response text'
      }`
    );
  }
};

const apy = async () => {
  const chainsToFetch = [1, 8453];
  const data = await Promise.all(chainsToFetch.map(fetchData));
  return data.flat().filter((i) => i.symbol);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.nayms.com/opportunities',
};
