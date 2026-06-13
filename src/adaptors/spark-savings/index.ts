const axios = require('axios')
const sdk = require('@defillama/sdk')
const BigNumber = require('bignumber.js')
const { sparkSavingsAbi } = require('./abi.js')

const sparkBaseUrl = 'https://app.spark.fi/savings'

const MAINNET_SUSDS = '0xa3931d71877c0e7a3148cb7eb4463524fec27fbd'

type Chain = 'ethereum' | 'avax' | 'base' | 'arbitrum'
interface VaultConfig {
  assetSymbol: string
  address: string
  decimals: number
}

interface BridgedSavingsConfig {
  assetSymbol: string
  address: string
  decimals: number
  underlying: string
}

const sparkSavings: Record<Chain, VaultConfig[]> = {
  ethereum: [
    {
      assetSymbol: 'USDC',
      address: '0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d',
      decimals: 6,
    },
    {
      assetSymbol: 'USDT',
      address: '0xe2e7a17dFf93280dec073C995595155283e3C372',
      decimals: 6,
    },
    {
      assetSymbol: 'PYUSD',
      address: '0x80128DbB9f07b93DDE62A6daeadb69ED14a7D354',
      decimals: 6,
    },
    {
      assetSymbol: 'ETH',
      address: '0xfE6eb3b609a7C8352A241f7F3A21CEA4e9209B8f',
      decimals: 18,
    },
  ],
  avax: [
    {
      assetSymbol: 'USDC',
      address: '0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d',
      decimals: 6,
    },
  ],
  base: [],
  arbitrum: [],
}

const bridgedSavings: Partial<Record<Chain, BridgedSavingsConfig[]>> = {
  base: [
    {
      assetSymbol: 'USDS',
      address: '0x5875eee11cf8398102fdad704c9e96607675467a',
      decimals: 18,
      underlying: '0x820c137fa70c8691f0e44dc420a5e53c168921dc',
    },
  ],
  arbitrum: [
    {
      assetSymbol: 'USDS',
      address: '0xddb46999f8891663a8f2828d25298f70416d7610',
      decimals: 18,
      underlying: '0x6491c05a82219b8d1479057361ff1654749b876b',
    },
  ],
}

async function getPools() {
  const pools = []
  const chains = Object.keys(sparkSavings) as Chain[]

  for (const chain of chains) {
    const vaults = sparkSavings[chain]
    if (vaults.length === 0) continue

    const totalSupplies = toOutput<string>(
      await sdk.api.abi.multiCall({
        abi: sparkSavingsAbi.totalSupply,
        chain,
        calls: vaults.map((config) => ({
          target: config.address,
        })),
      }),
    )

    const rates = toOutput<string>(
      await sdk.api.abi.multiCall({
        abi: sparkSavingsAbi.vsr,
        chain,
        calls: vaults.map((config) => ({
          target: config.address,
        })),
      }),
    )

    const symbols = toOutput<string>(
      await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        chain,
        calls: vaults.map((config) => ({
          target: config.address,
        })),
      }),
    )

    const assets = toOutput<string>(
      await sdk.api.abi.multiCall({
        abi: sparkSavingsAbi.asset,
        chain,
        calls: vaults.map((config) => ({
          target: config.address,
        })),
      }),
    )

    const prices = await fetchPrices(chain, vaults)

    pools.push(
      ...vaults.map(
        (vaultConfig, i) => ({
          pool: `${vaultConfig.address}-${chain}`,
          chain,
          apyBase: rateToApy(rates[i]),
          url: getVaultUrl(chain, symbols[i]),
          project: 'spark-savings',
          symbol: vaultConfig.assetSymbol,
          tvlUsd: new BigNumber(totalSupplies[i])
            .div(10 ** vaultConfig.decimals)
            .times(prices[`${chain}:${vaultConfig.address.toLowerCase()}`].price)
            .toNumber(),
          underlyingTokens: [assets[i]],
        }),
      ),
    )
  }

  pools.push(...(await getBridgedSavingsPools()))

  return pools
}

async function getBridgedSavingsPools() {
  const ssrRaw = (
    await sdk.api.abi.call({
      abi: sparkSavingsAbi.ssr,
      chain: 'ethereum',
      target: MAINNET_SUSDS,
    })
  ).output as string

  const apyBase = rateToApy(ssrRaw)
  const out: any[] = []

  for (const [chainKey, configs] of Object.entries(bridgedSavings)) {
    if (!configs?.length) continue
    const chain = chainKey as Chain

    const totalSupplies = toOutput<string>(
      await sdk.api.abi.multiCall({
        abi: sparkSavingsAbi.totalSupply,
        chain,
        calls: configs.map((c) => ({ target: c.address })),
      }),
    )

    const priceKeys = configs
      .map((c) => `${chain}:${c.address.toLowerCase()}`)
      .join(',')
    const priceRes = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKeys}`,
    )
    const prices = priceRes.data.coins

    configs.forEach((cfg, i) => {
      const priceKey = `${chain}:${cfg.address.toLowerCase()}`
      const price = prices[priceKey]?.price
      if (!price) return

      out.push({
        pool: `${cfg.address}-${chain}`,
        chain,
        apyBase,
        url: getVaultUrl(chain, 'susds'),
        project: 'spark-savings',
        symbol: cfg.assetSymbol,
        tvlUsd: new BigNumber(totalSupplies[i])
          .div(10 ** cfg.decimals)
          .times(price)
          .toNumber(),
        underlyingTokens: [cfg.underlying],
      })
    })
  }

  return out
}

function toOutput<T>(results: { output: { output: T }[] }): T[] {
  return results.output.map((result) => result.output)
}

async function fetchPrices(
  chain: Chain,
  vaultConfigs: readonly VaultConfig[],
): Promise<Record<string, { price: number }>> {
  const priceKeys = vaultConfigs.map((config) => `${chain}:${config.address.toLowerCase()}`).join(',')
  const response = await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  return response.data.coins
}

function getVaultUrl(chain: Chain, symbol: string): string {
  return `${sparkBaseUrl}/${chainToAppChain[chain]}/${symbol.toLowerCase()}`
}

const chainToAppChain: Record<Chain, string> = {
  ethereum: 'mainnet',
  avax: 'avalanche',
  base: 'base',
  arbitrum: 'arbitrum',
}

const yearInSeconds = 31536000

function rateToApy(rate: string): number {
  const normalizedRate = new BigNumber(rate).div(10 ** 27)
  return pow(normalizedRate, yearInSeconds).minus(1).times(100).toNumber()
}

// high precision pow function for correct calculations
function pow(a: any, b: number): any {
  return BigNumber.clone({ POW_PRECISION: 60 }).prototype.pow.apply(a, [b])
}

module.exports = {
  apy: getPools,
}
