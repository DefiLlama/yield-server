// Common time and calculation constants
const COMMON_CONFIG = {
  SECONDS_PER_YEAR: 365 * 24 * 60 * 60,
  QUEUED_REWARDS_EXTENSION: 7 * 24 * 60 * 60,
  DEFAULT_TOKEN_DECIMALS: 18,
  AIP_42_ENABLED: true, // 40% reduction applied to most pools (AIP-42)
};

// Balancer V3 API endpoint
const BALANCER_API_ENDPOINT = 'https://api-v3.balancer.fi/graphql';

module.exports = {
  COMMON_CONFIG,
  BALANCER_API_ENDPOINT,
};
