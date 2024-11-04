const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const superagent = require('superagent');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');

const utils = require('../utils');
const address = require('../paraspace-lending-v1/address');

const rewardToken = '0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E';

const chains = {
    ethereum: {
        LendingPool: '0x6eC35d6B345DF1FAdBD3E3B2A8C4c4CAe84A5E26',
        ProtocolDataProvider: '0x1D59555398c5dDbE98A7BcfE572D3597F24eE969',
        IncentivesDataProvider: '0xdbAb1Ca8C13d8feB7567721D06C0BD394c20D0b4',
        url: 'telos',
    }
};

const getApy = async () => {
    const pools = await Promise.all(
        Object.keys(chains).map(async (chain) => {
            const addresses = chains[chain];
            const sdkChain = chain === 'avalanche' ? 'avax' : chain;

            const reserveList = (
                await sdk.api.abi.call({
                    target: addresses.LendingPool,
                    abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
                    chain: 'telos',
                })
            ).output;
            reservesList = reserveList.filter(e => e !== '0x7C598c96D02398d89FbCb9d41Eab3DF0C16F227D');

            const reserveData = (
                await sdk.api.abi.multiCall({
                    calls: reservesList.map((i) => ({
                        target: addresses.LendingPool,
                        params: [i],
                    })),
                    abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
                    chain: 'telos',
                })
            ).output.map((o) => o.output);


            const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
                ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
                    sdk.api.abi.multiCall({
                        abi: method,
                        calls: reservesList.map((t, i) => ({
                            target: t,
                            params:
                                method === 'erc20:balanceOf'
                                    ? reserveData[i].oTokenAddress
                                    : null,
                        })),
                        chain: 'telos',
                    })
                )
            );

            const liquidity = liquidityRes.output.map((o) => o.output);
            const decimals = decimalsRes.output.map((o) => o.output);
            let symbols = symbolsRes.output.map((o) => o.output);
            // maker symbol is null
            const mkrIdx = symbols.findIndex((s) => s === null);
            symbols[mkrIdx] = 'MKR';

            const totalBorrow = (
                await sdk.api.abi.multiCall({
                    abi: 'erc20:totalSupply',
                    calls: reserveData.map((p) => ({
                        target: p.variableDebtTokenAddress,
                    })),
                    chain: 'telos',
                })
            ).output.map((o) => o.output);

            const assetPrice = (
                await sdk.api.abi.multiCall({
                    abi: 'erc20:totalSupply',
                    calls: reserveData.map((p) => ({
                        target: p.variableDebtTokenAddress,
                    })),
                    chain: 'telos',
                })
            ).output.map((o) => o.output);

            const reserveConfigurationData = (
                await sdk.api.abi.multiCall({
                    calls: reservesList.map((t) => ({
                        target: addresses.ProtocolDataProvider,
                        params: t,
                    })),
                    chain: 'telos',
                    abi: abiProtocolDataProvider.find(
                        (n) => n.name === 'getReserveConfigurationData'
                    ),
                })
            ).output.map((o) => o.output);

            rewardsDataURL = "https://omnidex.bmaa3ajd1gjri.eu-west-2.cs.amazonlightsail.com/yields";
            const rewardAPYs = (await utils.getData(rewardsDataURL));

            const pricesArray = reservesList.map((t) => `${'telos'}:${t}`);
            const prices = (
                await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
            ).data.coins;


            return reservesList.map((t, i) => {
                const config = reserveConfigurationData[i];
                if (!config.isActive) return null;

                try {
                    lendingReward = rewardAPYs[symbols[i]].apyReward;
                    borrowingReward = rewardAPYs[symbols[i]].apyRewardBorrow;
                }
                catch {
                    lendingReward = 0;
                    borrowingReward = 0;
                }

                const price = prices[`${'telos'}:${t}`]?.price;

                const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
                const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
                const totalSupplyUsd = tvlUsd + totalBorrowUsd;

                const apyBase = reserveData[i].currentLiquidityRate / 1e25;
                const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

                const ltv = config.ltv / 1e4;
                const borrowable = config.borrowingEnabled;
                const frozen = config.isFrozen;

                const url = `https://lending.omnidex.finance/markets`;

                return {
                    pool: `${reserveData[i].oTokenAddress}`.toLowerCase(),
                    symbol: symbols[i],
                    project: 'omnidex-lend',
                    chain: "telos",
                    tvlUsd,
                    apyBase,
                    apyReward: lendingReward,
                    rewardTokens: [rewardToken],
                    underlyingTokens: [t],
                    url,
                    // borrow fields
                    apyBaseBorrow,
                    apyRewardBorrow: borrowingReward,
                    totalSupplyUsd,
                    totalBorrowUsd,
                    ltv,
                    borrowable,
                    poolMeta: frozen ? 'frozen' : null,
                };

            });
        })
    );

    return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
    apy: getApy,
};