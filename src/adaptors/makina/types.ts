export interface Token {
  /**
   * Token contract address
   * @example "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
   */
  address: string;
  /**
   * Chain ID
   * @example 1
   */
  chainId: number;
  /**
   * Token name
   * @example "USD Coin"
   */
  name: string;
  /**
   * Token symbol
   * @example "USDC"
   */
  symbol: string;
  /**
   * Token decimals
   * @example 6
   */
  decimals: number;
}

export type MakinaStrategiesResponse = {
  data: {
    strategies: Array<{
      slug: string | null;
      address: string;
      hubChainId: number;
      name: string;
      logoURI: string | null;

      /**
       * 7-day average annualized yield
       * @example 0.0829
       */
      apy7d: number | null;

      /**
       * 30-day average annualized yield
       * @example 0.0477
       */
      apy30d: number | null;

      shareToken: Token;
      accountingToken: Token;
      depositToken: Token;

      /**
       * Live total value of all assets in the accounting token base units. Equals `lastReportedAum` adjusted for any deposits/redeems indexed after `lastReportedAumBlock`.
       * @example "15333281570441"
       */
      aum: string;

      /**
       * The most recent on-chain reported AUM (from the latest TotalAumUpdated event), in the accounting token base units.
       * @example "15333281570441"
       */
      lastReportedAum: string;

      /**
       * Block number at which `lastReportedAum` was reported on-chain.
       * @example "23000000"
       */
      lastReportedAumBlock: string;

      /**
       * The price per share, expressed in accounting tokens per share (human-readable, de-scaled by the accounting token's decimals).
       * @example 1.020766
       */
      sharePrice: number;
    }>;
  };
};
