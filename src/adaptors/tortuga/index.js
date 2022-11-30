const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const TGOV_ADDRESS =
  '0x84d7aeef42d38a5ffc3ccef853e1b82e4958659d16a7de736a29c55fbbeb0114';
const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const RESOURCE_URL = `${NODE_URL}/accounts/${TGOV_ADDRESS}/resources`;

async function main() {
  const [resources, aptPrice] = await Promise.all([
    utils.getData(RESOURCE_URL),
    utils.getData(`https://api.binance.com/api/v3/ticker/price?symbol=APTBUSD`),
  ]);

  const stakingStatus = resources.filter((r) =>
    r.type.endsWith('StakingStatus')
  )[0].data;

  const aptosCoinReserve = resources.filter((r) =>
    r.type.endsWith('AptosCoinReserve')
  )[0].data;

  const validatorSystem = resources.filter((r) =>
    r.type.endsWith('ValidatorSystem')
  )[0].data;

  const tAptCoinInfo = resources.filter((r) =>
    r.type.endsWith(
      `CoinInfo<${TGOV_ADDRESS}::staked_aptos_coin::StakedAptosCoin>`
    )
  )[0].data;

  const unclaimed_balance = new BigNumber(
    stakingStatus.total_claims_balance
  ).minus(BigNumber(stakingStatus.total_claims_balance_cleared));

  const total_balance_with_validators = new BigNumber(
    validatorSystem.total_balance_with_validators
  );

  const aptStaked = BigNumber(aptosCoinReserve.coin.value)
    .plus(total_balance_with_validators)
    .minus(unclaimed_balance);

  const tAptSupply = new BigNumber(
    tAptCoinInfo.supply.vec[0].integer.vec[0].value
  );

  const aptPerTApt = aptStaked.dividedBy(tAptSupply);
  const secsInYear = 60 * 60 * 24 * 365;
  const secsSinceDeployment = BigNumber(new Date().valueOf() / 1000).minus(
    stakingStatus.deployment_time
  );
  const apy = aptPerTApt
    .minus(1)
    .multipliedBy(secsInYear)
    .dividedBy(secsSinceDeployment)
    .multipliedBy(100);

  return [
    {
      pool: `${TGOV_ADDRESS}-tortuga`,
      chain: utils.formatChain('aptos'),
      project: 'tortuga',
      symbol: utils.formatSymbol('tAPT'),
      tvlUsd: aptStaked.multipliedBy(aptPrice.price).dividedBy(1e8).toNumber(),
      apy: apy.toNumber(),
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.tortuga.finance',
};
