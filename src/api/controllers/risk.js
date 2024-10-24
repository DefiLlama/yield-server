const fetch = require('node-fetch');

const YIELD_RISK_API_EXPONENTIAL =
  'https://api.exponential.fi/api/pool-risk/search';

const getRiskRating = async (req, res) => {
  try {
    const poolData = req.query;

    // pool_old + at least one of the other fields are requried
    if (!poolData.pool_old) {
      return res.status(400).json({
        status: 'error',
        message: 'pool_old is required',
      });
    }

    const otherFields = ['chain', 'project', 'tvlUsd', 'underlyingTokens'];
    const hasOtherField = otherFields.some((field) => poolData[field]);

    if (!hasOtherField) {
      return res.status(400).json({
        status: 'error',
        message: `At least one of ${otherFields.join(',')} must be provided`,
      });
    }

    const response = await fetch(YIELD_RISK_API_EXPONENTIAL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.EXPONENTIAL_API_KEY,
      },
      body: JSON.stringify({
        token_address: cleanPool(poolData.pool_old),
        blockchain: poolData.chain?.toLowerCase(),
        protocol: poolData.project,
        tvl: poolData.tvlUsd,
        assets: poolData.underlyingTokens,
      }),
    });
    const data = await response.json();
    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

function cleanPool(pool) {
  // some pool fields contain chain (or other) info as prefix/suffix
  // need to remove these parts from api call, otherwise we won't receive the total risk score

  // for 0x addresses
  // match 0x followed by at least 40 hexadecimal characters balancer pool ids have length 64)
  const pattern = /0x[a-fA-F0-9]{40,}/;

  const match = pool.match(pattern);

  // for non 0x addresses return pool as is
  return match ? match[0] : pool;
}

module.exports = { getRiskRating };
