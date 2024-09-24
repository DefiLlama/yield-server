const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

// Idea of using alchemyKey copied from ../mellow-yield/index.js, but now with better code
const alchemy_url_regex = /https:[/][/].*alchemy[.]com[/]v2[/]([^/]+)/g;

const extractKey = (alchemy_full_url) => {
  const match = alchemy_url_regex.exec(alchemy_full_url);
  if (match === null) return null;
  return match[1];
};

const addressBook = {
  polygon: {
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    eTokens: [
      // eTokens
      {
        name: 'Koala Jr Pool',
        address: '0xBC33c283A37d46ABA17BC5F8C27b27242688DeC6',
        symbol: 'eUSDCKoBMAJr',
      },
      {
        name: 'Senior Pool',
        address: '0xF383eF2D31E1d4a19B3e04ca2937DB6A8DA9f229',
        symbol: 'eUSDCBMASr',
      },
      {
        name: 'Spot Jr Pool',
        address: '0x6229D78658305a301E177f9dAEa3a0799fd1528C',
        symbol: 'eUSDCGSJr',
      },
    ],
  },
};

const abiTransfer = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const getApy = async () => {
  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/polygon/${timestamp1dayAgo}`)
  ).data.height;

  const alchemyKey = extractKey(process.env.ALCHEMY_CONNECTION_ETHEREUM || '');

  if (alchemyKey === null)
    throw new Error(
      'Environment variable ALCHEMY_CONNECTION_ETHEREUM not defined or not in the expected format'
    );
  const provider = new ethers.providers.AlchemyProvider('matic', alchemyKey);

  return await Promise.all(
    addressBook.polygon.eTokens.map(async (etk) => {
      const [tsNow, tsOneDayAgo] = await Promise.all([
        sdk.api.erc20.totalSupply({ target: etk.address, chain: 'polygon' }),
        sdk.api.erc20.totalSupply({
          target: etk.address,
          chain: 'polygon',
          block: block1dayAgo,
        }),
      ]);

      const contract = new ethers.Contract(etk.address, abiTransfer, provider);
      const transfers = await contract.queryFilter(
        contract.filters.Transfer(),
        block1dayAgo
      );
      const netDeposits = transfers
        .filter(
          (evt) =>
            evt.args.from === ethers.constants.AddressZero ||
            evt.args.to === ethers.constants.AddressZero
        )
        .reduce(
          (accumulator, evt) =>
            evt.args.from === ethers.constants.AddressZero
              ? accumulator.add(evt.args.value)
              : accumulator.sub(evt.args.value),
          ethers.BigNumber.from(0)
        )
        .toNumber();
      const dailyApr =
        (tsNow.output - tsOneDayAgo.output - netDeposits) / tsOneDayAgo.output;
      // Using apr to apy formula from https://www.aprtoapy.com/
      const apy = (Math.pow(1 + dailyApr, 365) - 1) * 100;
      return {
        pool: etk.address,
        chain: 'polygon',
        project: 'ensuro',
        symbol: 'USDC',
        poolMeta: etk.name,
        tvlUsd: tsNow.output / 1e6,
        apyBase: apy,
        url: `https://app.ensuro.co/eTokens/${etk.address}`,
        underlyingTokens: [addressBook.polygon.usdc],
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
