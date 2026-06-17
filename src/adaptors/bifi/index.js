const axios = require('axios');

const url = 'https://crosschain.bifi.finance/api/biholder/chains/bfc/bifi';

const apy = async () => {
  const [markets, handlers] = await Promise.all(
    ['bifi-market', 'handlers'].map((i) => axios.get(`${url}/${i}`))
  );

  return markets.data.map((p) => {
    const handler = handlers.data.find(
      (i) => i.tokenHandlerId === p.token_handler_id
    );

    const totalSupplyUsd = Number(p.deposit_value);
    const totalBorrowUsd = Number(p.borrow_value);
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    return {
      pool: handler.handlerAddress,
      symbol: handler.tokenSymbol,
      chain: 'Bifrost Network',
      project: 'bifi',
      tvlUsd,
      apyBase: Number(p.deposit_apy),
      apyBaseBorrow: Number(p.borrow_apy),
      borrowToken: handler.tokenAddress,
      totalSupplyUsd,
      totalBorrowUsd,
      underlyingTokens: [handler.tokenAddress],
    };
  });
};

module.exports = {
  protocolId: '253',
  apy,
  url: 'https://crosschain.bifi.finance/',
};
