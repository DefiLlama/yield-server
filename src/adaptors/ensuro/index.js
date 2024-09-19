const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

// Copied from ../mellow-yield/index.js - Extracts the alchemy key after /v2/
const transformLink = (link) => {
  let i = 0;
  while (link[i] != 'v' || link[i + 1] != '2' || link[i + 2] != '/') {
    i += 1;
    if (i == link.length) return '';
  }

  return link.substr(i + 3, link.length);
};

const addressBook = {
  polygon: {
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    eTokens: [
      // eTokens
      {
        name: 'Jr Koala BMA',
        address: '0xBC33c283A37d46ABA17BC5F8C27b27242688DeC6',
        symbol: 'eUSDCKoBMAJr',
      },
      {
        name: 'Sr BMA',
        address: '0xF383eF2D31E1d4a19B3e04ca2937DB6A8DA9f229',
        symbol: 'eUSDCBMASr',
      },
      {
        name: 'Jr Spot BMA',
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

  if (
    process.env.ALCHEMY_CONNECTION_ETHEREUM === undefined ||
    transformLink(process.env.ALCHEMY_CONNECTION_ETHEREUM) === ''
  )
    throw new Error(
      'Environment variable ALCHEMY_CONNECTION_ETHEREUM not defined or not in the expected format'
    );
  const provider = new ethers.providers.AlchemyProvider(
    'matic',
    transformLink(process.env.ALCHEMY_CONNECTION_ETHEREUM)
  );

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
      console.log(netDeposits);
      console.log(tsNow.output);
      const dailyApr =
        (tsNow.output - tsOneDayAgo.output - netDeposits) / tsOneDayAgo.output;
      // Using apr to apy formula from https://www.aprtoapy.com/
      const apy = (Math.pow(1 + dailyApr, 365) - 1) * 100;
      return {
        pool: etk.address,
        chain: 'polygon',
        project: 'ensuro',
        symbol: etk.symbol,
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
