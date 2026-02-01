const axios = require('axios')
const sdk = require('@defillama/sdk')
const BigNumber = require('bignumber.js')
const {sparkSavingsAbi} = require('./abi.js')

import type { Pool } from '../../types/Pool'

const sparkBaseUrl = 'https://app.spark.fi/savings'

type Chain = 'ethereum' | 'avax'
interface VaultConfig {
  assetSymbol: string
  address: string
  decimals: number
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
}

async function getPools(): Promise<Pool[]> {
  const pools: Pool[] = []
  const chains = Object.keys(sparkSavings) as Chain[]

  for (const chain of chains) {
    const vaults = sparkSavings[chain]

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

    const prices = await fetchPrices(chain, vaults)

    pools.push(
      ...vaults.map(
        (vaultConfig, i): Pool => ({
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
        }),
      ),
    )
  }

  return pools
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