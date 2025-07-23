const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');
const { Program } = require('@coral-xyz/anchor');
const utils = require('../utils');
const { LavarageIdl, StakingIdl } = require('./idls');
const base58 = require('bs58').default;

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = 'CRSeeBqjDnm3UPefJ9gxrtngTsnQRhEJiTA345Q83X3v';
const STAKING_PROGRAM_ID = '85vAnW1P89t9tdNddRGk6fo5bDxhYAY854NfVJDqzf7h';
const LAVA_STAKING_TOKEN = '1stqQC3rTGhCwsXsXqF8qEwz7LQ2euK858V7adB7gaQ';
const MAX_BID_TOKEN = 'mbpudvZpLkSGQYZ372GBEzsHheTxKMSAdXvHWrjQtM7';

const DATA_ACCOUNT = 'HTnwdgfXrA6gZRiQsnfxLKbvdcqnxdbuC2FJsmCCVMw9';
const NODE_WALLET = '6riP1W6R3qzUPWYwLGtXEC23aTqmyAEdDtXzhntJquAh';
const IDLE_FUNDS = 'bkhAyULeiXwju7Zmy4t3paDHtVZjNaofVQ4VgEdTWiE';
const MULTISIG = 'DkPYEECBc28iute8vWvAuAU4xiM91Sht59p7FHZbmNQv';

const PROJECT_START_TIMESTAMP = 1716350663;

const EDGE_CASE_TIMESTAMPS = [
  { start: 1713880000, end: 1713885480 }, // 10:32 AM - 10:58 AM ET on April 23, 2024
  { start: 1713874500, end: 1713876060 }, // 8:15 AM - 8:41 AM ET on April 23, 2024
]

const apy = async () => {
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    const lavarageProgram = new Program(LavarageIdl, PROGRAM_ID, {connection});
    const stakingProgram = new Program(StakingIdl, STAKING_PROGRAM_ID, {connection});
    
    // Get mint information for both tokens
    const [mint, mintMBP] = await Promise.all([
      getMint(connection, new PublicKey(LAVA_STAKING_TOKEN)),
      getMint(connection, new PublicKey(MAX_BID_TOKEN))
    ]);

    // Get unstaked balance from staking program data account
    const unstakedBalance = await getUnstakingAccountsTotal(stakingProgram);
    
    const vaultBalance = await calculateVaultBalance(lavarageProgram, stakingProgram, mint, mintMBP, unstakedBalance);
    
    if (!vaultBalance || !vaultBalance.total || vaultBalance.total <= 0) {
      console.warn('Invalid vault balance data, returning empty pools');
      return [];
    }

    // Get SOL price for TVL calculation
    const solPrice = await getSolPrice();
    
    // Calculate TVL in USD
    const totalTvlSol = vaultBalance.total / 1e9; // Convert lamports to SOL
    const tvlUsd = totalTvlSol * solPrice;

    // Calculate APY based on NAV
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeElapsed = currentTimestamp - PROJECT_START_TIMESTAMP;
    const historicalPnL = (vaultBalance.nav - 1) * 100;
    const combinedAPY = (historicalPnL / timeElapsed) * 31536000; // 31536000 = seconds in a year

    // Calculate proportional TVL for each token based on supply
    const totalSupply = Number(mint.supply + mintMBP.supply);
    const lavaSolSupply = Number(mint.supply);
    const maxBidSupply = Number(mintMBP.supply);

    const pool = {
      pool: `${LAVA_STAKING_TOKEN}-solana`,
      chain: utils.formatChain('solana'),
      project: 'lavarage',
      symbol: 'SOL',
      tvlUsd: tvlUsd,
      apyBase: combinedAPY,
      underlyingTokens: ['So11111111111111111111111111111111111111112'],
    };

    return [pool];

  } catch (error) {
    console.error('Error fetching Lavarage on-chain data:', error.message);
    return [];
  }
};

const getUnstakingAccountsTotal = async (stakingProgram) => {
  try {
    const dataAccount = await stakingProgram.account.dataAccount.fetch(DATA_ACCOUNT);
    return BigInt(dataAccount.pendingUnstake.toString());
  } catch (error) {
    console.error('Error fetching unstaking accounts total:', error);
    return BigInt(0);
  }
};

const getProtocolStakingAccounts = async (stakingProgram) => {
  try {
    const dataAccount = (await stakingProgram.account.dataAccount.all())[0];
    return dataAccount.account.whitelistedStakeAccounts.map(pubkey => ({
      pubkey,
      isSigner: false,
      isWritable: false
    }));
  } catch (error) {
    console.error('Error fetching protocol staking accounts:', error);
    return [];
  }
};

const getSumOpenedPositions = async (lavarageProgram) => {
  try {
    // Fetch all pools filtered by node wallet
    const pools = await lavarageProgram.account.pool.all([
      {
        memcmp: {
          offset: 49,
          bytes: NODE_WALLET,
        },
      },
    ]);

    const poolAddresses = pools.map(p => p.publicKey.toBase58());

    // Fetch all positions for these pools
    const value = BigInt(9999);
    const valueBuffer = Buffer.alloc(8);
    valueBuffer.writeBigUInt64LE(value, 0);

    const positionsRaw = (
      await lavarageProgram.account.position.all([
        { dataSize: 178 },
        {
          memcmp: {
            offset: 40,
            bytes: base58.encode(Buffer.from(new Uint8Array(8))),
          },
        },
      ])
    ).concat(
      await lavarageProgram.account.position.all([
        { dataSize: 178 },
        {
          memcmp: {
            offset: 40,
            bytes: base58.encode(valueBuffer),
          },
        },
      ])
    );

    // Filter positions that belong to our pools
    const userPositions = positionsRaw
      .filter(pos => poolAddresses.includes(pos.account.pool.toBase58()))
      .map(deserializePosition)
      .filter(p => p);

    // Filter active positions
    const activePositions = userPositions.filter(
      p => p.closeStatusRecallTimestamp === '0' || isWithinEdgeCaseTimeRange(p.timestamp)
    );

    return activePositions.reduce((acc, position) => acc + Number(position.amount), 0);
  } catch (error) {
    console.error('Error fetching opened positions:', error);
    return 0;
  }
};

const calculateVaultBalance = async (lavarageProgram, stakingProgram, mint, mintMBP, unstakedBalance) => {
  try {
    const sumOpenedPositions = await getSumOpenedPositions(lavarageProgram);

    const stakingAccounts = await getProtocolStakingAccounts(stakingProgram);

    const sumStaked = (await Promise.all(
          stakingAccounts.map(sa => lavarageProgram.provider.connection.getBalance(sa.pubkey))
    )).reduce((acc, cur) => acc + cur, 0);
    
    const sumIdle = await lavarageProgram.provider.connection.getBalance(new PublicKey(IDLE_FUNDS));

    const sumDeployed = (await lavarageProgram.provider.connection.getAccountInfo(new PublicKey(NODE_WALLET))).lamports

    const sumMultisig = (await lavarageProgram.provider.connection.getAccountInfo(new PublicKey(MULTISIG))).lamports
  
    const pendingWithdrawal = (await lavarageProgram.provider.connection.getAccountInfo(new PublicKey(DATA_ACCOUNT))).lamports
  
    const sumPendingUnstake = await lavarageProgram.provider.connection.getBalance(new PublicKey(DATA_ACCOUNT))

    const total = sumOpenedPositions + sumIdle + sumDeployed + sumMultisig + sumPendingUnstake + sumStaked;

    const totalSupply = Number(mint.supply + mintMBP.supply);
    const nav = totalSupply > 0 ? (total - Number(unstakedBalance)) / totalSupply : 1;

    return {
      total,
      delegated: sumStaked,
      deployed: sumOpenedPositions + sumDeployed,
      openedPositions: sumOpenedPositions,
      idle: sumIdle,
      multisig: sumMultisig,
      nav: nav,
      pendingWithdrawal,
      sources: [
        IDLE_FUNDS,
        NODE_WALLET,
        MULTISIG,
        DATA_ACCOUNT,
      ].concat(stakingAccounts.map(sa => sa.pubkey.toBase58())),
    };
  } catch (error) {
    console.error('Error calculating vault balance:', error);
    return null;
  }
};

const deserializePosition = (position) => {
  const { amount, collateralAmount, closeStatusRecallTimestamp, timestamp, trader } = position.account;
  const publicKey = position.publicKey;

  return {
    amount,
    collateralAmount: collateralAmount.toString(),
    closeStatusRecallTimestamp: closeStatusRecallTimestamp.toString(),
    timestamp: timestamp.toNumber(),
    publicKey: publicKey.toBase58(),
    trader: trader.toBase58(),
    pool: position.account.pool.toBase58(),
    userPaid: position.account.userPaid.toNumber(),
    seed: position.account.seed,
    closeTimestamp: position.account.closeTimestamp.toNumber(),
    closingPositionSize: position.account.closingPositionSize.toNumber(),
    interestRate: position.account.interestRate,
    accruedInterest: 0,
  };
};

const isWithinEdgeCaseTimeRange = (closeTimestamp) => {
  return EDGE_CASE_TIMESTAMPS.some(({ start, end }) => closeTimestamp >= start && closeTimestamp <= end);
};

const getSolPrice = async () => {
  try {
    const priceResponse = await utils.getData(
      'https://coins.llama.fi/prices/current/solana:So11111111111111111111111111111111111111112'
    );
    return priceResponse.coins['solana:So11111111111111111111111111111111111111112'].price;
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    return 0;
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.lavarage.xyz/stake'
};
