const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://base-api-public.mrgn.app';
const API_ENDPOINT = `${BASE_URL}/v1/bank/metrics`;

// API key provided by Project 0 team for DefiLlama
// This will be set by the DefiLlama team
const API_KEY = process.env.PROJECT_0_API_KEY;

const getApy = async () => {

  if (!API_KEY) {
    console.error('project-0 adapter: PROJECT_0_API_KEY is required');
    return [];
  }

  // Get current time in ISO 8601 format
  const startTime = new Date().toISOString();
  const endTime = '9999-12-31T23:59:59.999Z';
  const groupAddress = '4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8';
  const venue = 'P0';

  let response;
  try {
    response = await axios.get(API_ENDPOINT, {
      headers: {
        'X-API-KEY': API_KEY,
        'Content-Type': 'application/json',
      },
      params: {
        start_time: startTime,
        end_time: endTime,
        group_address: groupAddress,
        venue: venue,
      },
    });
  } catch (e) {
    console.error('project-0 adapter: failed to fetch bank metrics from API', e);
    // Fail soft with empty list so the rest of the pipeline keeps working
    return [];
  }

  // The API returns { success: true, data: [...], metadata: {...} }
  if (!response.data || !response.data.success || !Array.isArray(response.data.data)) {
    console.warn('project-0 adapter: unexpected API response shape', response.data);
    return [];
  }

  const banks = response.data.data;

  const bankApys = banks.map((bank) => {
    // Use _current suffix fields for current USD valuations
    const bankAddress = bank.bank_address;
    const symbol = bank.symbol || 'UNKNOWN';
    const mint = bank.mint;
    const tvlUsd = Number(bank.tvl_usd_current) || 0;
    const totalDepositsUsd = Number(bank.total_deposits_usd_current) || 0;
    const totalBorrowsUsd = Number(bank.total_borrows_usd_current) || 0;
    
    // deposit_rate and borrow_rate are in decimal form (e.g., 0.05 for 5%)
    // Convert to percentage by multiplying by 100
    const depositRate = Number(bank.deposit_rate) || 0;
    const borrowRate = Number(bank.borrow_rate) || 0;
    const apyBase = depositRate * 100;
    const apyBaseBorrow = borrowRate * 100;

    return {
      pool: `project-0-${bankAddress}`,
      chain: 'Solana',
      project: 'project-0',
      symbol: utils.formatSymbol(symbol),
      underlyingTokens: mint ? [mint] : undefined,
      tvlUsd: tvlUsd,
      url: mint ? `https://app.0.xyz/markets/${mint}` : 'https://app.0.xyz/',
      apyBase: apyBase,
      totalSupplyUsd: totalDepositsUsd,
      totalBorrowUsd: totalBorrowsUsd,
      apyBaseBorrow: apyBaseBorrow,
    };
  });

  return utils.removeDuplicates(bankApys);
};

module.exports = {
  apy: getApy,
  url: 'https://app.0.xyz/',
};