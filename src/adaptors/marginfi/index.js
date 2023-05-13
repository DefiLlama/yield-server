const { getConfig, MarginfiClient } = require("@mrgnlabs/marginfi-client-v2");
const { Keypair, Connection, PublicKey } = require("@solana/web3.js")
const { BigNumber } = require("bignumber.js");

const utils = require('../utils');

const dummyWallet = Keypair.generate();
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
const MARGINFI_URL = "https://app.marginfi.com";

async function main() {
  const client = await MarginfiClient.fetch(getConfig(), dummyWallet, connection);

  const banks = Array.from(client.group.banks, ([k, v]) => v);

  return await Promise.all(banks.map(async (bank) => {
    const supplyAmount = bank.getAssetQuantity(bank.totalAssetShares).div(10 ** bank.mintDecimals);
    const borrowAmount = bank.getLiabilityQuantity(bank.totalLiabilityShares).div(10 ** bank.mintDecimals);
    const netAmount = supplyAmount.minus(borrowAmount);

    const price = bank.getPrice();

    const supplyUsd = supplyAmount.times(price);
    const borrowUsd = borrowAmount.times(price);
    const netUsd = netAmount.times(price);

    const ltv = (new BigNumber(1)).div(bank.config.liabilityWeightInit);

    const { lendingRate, borrowingRate } = bank.getInterestRates();

    let apyReward;
    let apyBorrowReward;

    const apyBase = lendingRate;
    const apyBorrow = borrowingRate;

    if (!bank.emissionsMint.equals(PublicKey.default)) {
      const { borrowingActive, lendingActive, rateUi } = await bank.getEmissionsData(connection);

      apyReward = lendingRate.plus(lendingActive ? rateUi.div(100) : new BigNumber(0));
      apyBorrowReward = borrowingRate.plus(borrowingActive ? rateUi.div(100) : new BigNumber(0));
    }

    const rewardTokens = [];

    if (!bank.emissionsMint.equals(PublicKey.default)) {
      rewardTokens.push(bank.emissionsMint.toBase58());
    }

    return {
      pool: bank.publicKey.toBase58(),
      chain: utils.formatChain("solana"),
      project: "marginfi",
      symbol: bank.label,
      tvlUsd: netUsd.toNumber(),
      totalSupplyUsd: supplyUsd.toNumber(),
      totalBorrowUsd: borrowUsd.toNumber(),
      ltv: ltv.toNumber(),
      apyBase: apyBase.toNumber(),
      apyReward: apyReward?.toNumber(),
      apyBaseBorrow: apyBorrow.toNumber(),
      apyRewardBorrow: apyBorrowReward?.toNumber(),
      rewardTokens,
      underlyingTokens: [bank.mint.toBase58()],
    }
  }));
}

module.exports = {
  timetravel: false,
  apy: main,
  url: MARGINFI_URL,
}
