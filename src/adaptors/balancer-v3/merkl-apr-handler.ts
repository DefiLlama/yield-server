import { $Enums, PrismaPoolAprItem, PrismaPoolAprType } from '@prisma/client';
import { AprHandler, PoolAPRData } from '../../types';
import { chainIdToChain } from '../../../../config/chain-id-to-chain';
import { AaveV3Plasma } from '@bgd-labs/aave-address-book';
import { env } from '../../../../apps/env';

const opportunityUrl =
    'https://api.merkl.xyz/v4/opportunities/?test=false&status=LIVE&campaigns=true&mainProtocolId=balancer&page=0&items=100';

const tokenOpportunityUrlBase = `https://api.merkl.xyz/v4/opportunities/?status=LIVE&explorerAddress=`;

interface MerklOpportunity {
    chainId: number;
    identifier: string;
    dailyRewards: number;
    explorerAddress: string;
    apr: number;
    campaigns: {
        params: {
            whitelist: string[];
        };
    }[];
}

export class MerklAprHandler implements AprHandler {
    public getAprServiceName(): string {
        return 'MerklAprHandler';
    }

    private async fetchMerklOpportunities() {
        const response = await this.merklFetch(opportunityUrl);
        const data = (await response.json()) as MerklOpportunity[];

        // remove opportunities with whitelist
        const opportunities = data.filter((opportunity) =>
            opportunity.campaigns.every((campaign) => campaign.params.whitelist.length === 0),
        );

        return opportunities;
    }

    public async calculateAprForPools(
        pools: PoolAPRData[],
    ): Promise<Omit<PrismaPoolAprItem, 'createdAt' | 'updatedAt'>[]> {
        const aprsFromOpportunities = await this.findPoolOpportunities(pools);

        // for boosted pools
        const aprsFromTokenOpportunities = await this.findTokenOpportunities(pools);

        const data = this.combineAndDeduplicateAprs([...aprsFromOpportunities, ...aprsFromTokenOpportunities]);

        return data.map((apr) => ({
            id: apr.id,
            type: apr.type,
            title: apr.title,
            chain: apr.chain,
            poolId: apr.poolId,
            apr: apr.apr,
            rewardTokenAddress: null,
            rewardTokenSymbol: null,
        }));
    }

    private combineAndDeduplicateAprs(
        aprs: {
            id: string;
            type: PrismaPoolAprType;
            title: string;
            chain: $Enums.Chain;
            poolId: string;
            apr: number;
        }[],
    ): Omit<PrismaPoolAprItem, 'createdAt' | 'updatedAt'>[] {
        // Combine APRs by summing APR values for the same pool
        const aprMap: Map<string, Omit<PrismaPoolAprItem, 'createdAt' | 'updatedAt'>> = new Map();

        for (const apr of aprs) {
            if (aprMap.has(apr.poolId)) {
                const existingApr = aprMap.get(apr.poolId)!;
                existingApr.apr += apr.apr; // Sum the APR values
                aprMap.set(apr.poolId, existingApr);
            } else {
                aprMap.set(apr.poolId, { ...apr, rewardTokenAddress: null, rewardTokenSymbol: null });
            }
        }
        return Array.from(aprMap.values());
    }

    private async findPoolOpportunities(pools: PoolAPRData[]) {
        const opportunities = await this.fetchMerklOpportunities();

        const allAffectedPoolAddresses = opportunities.map((campaign) => campaign.identifier.toLowerCase());

        const affectedPools = pools.filter((pool) => allAffectedPoolAddresses.includes(pool.address.toLowerCase()));

        const aprsFromOpportunities = this.mapOpportunitiesToAprs(opportunities, affectedPools);
        return aprsFromOpportunities;
    }

    // for boosted pools, merkl doesnt forward the APR to the pools so we need to query merkl for any apr of any pool tokens (we limit to tokens that have underlying)
    private async findTokenOpportunities(pools: PoolAPRData[]) {
        const aaveMarkets = [AaveV3Plasma];
        const aaveMarketForChain = aaveMarkets.find((market) => chainIdToChain[market.CHAIN_ID] === pools[0].chain);
        let aaveTokenMappings: Map<string, string>;
        if (aaveMarketForChain) {
            aaveTokenMappings = await this.getTokenMappings(Object.values(aaveMarketForChain.ASSETS));
        } else {
            aaveTokenMappings = new Map<string, string>();
        }

        const tokensWithUnderlying: string[] = [];
        pools.forEach((pool) => {
            tokensWithUnderlying.push(
                ...pool.tokens
                    .filter((token) => token.token.underlyingTokenAddress)
                    .map((token) =>
                        aaveTokenMappings.get(token.address.toLowerCase()) // we replace the waTokens with aTokens as merkl tracks aTokens
                            ? aaveTokenMappings.get(token.address.toLowerCase())!
                            : token.address.toLowerCase(),
                    )
                    .flat(),
            );
        });
        const uniqueTokensWithUnderlying = Array.from(new Set(tokensWithUnderlying));

        let tokenOpportunities: MerklOpportunity[] = [];

        if (uniqueTokensWithUnderlying.length > 0) {
            // Fetch opportunities for the unique tokens
            // rewrite to fetch in batches of 10 to avoid hitting ratelimits
            const batchSize = 10;
            const tokenOpportunityResponses: MerklOpportunity[][] = [];
            for (let i = 0; i < uniqueTokensWithUnderlying.length; i += batchSize) {
                const batch = uniqueTokensWithUnderlying.slice(i, i + batchSize);
                const batchResponses = await Promise.all(
                    batch.map((tokenAddress) =>
                        this.merklFetch(`${tokenOpportunityUrlBase}${tokenAddress}`).then(
                            (res) => res.json() as unknown as MerklOpportunity[],
                        ),
                    ),
                );
                tokenOpportunityResponses.push(...batchResponses);
                // Add a small delay between batches to avoid hitting rate limits
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            // Flatten the array of arrays and filter out opportunities with whitelist
            tokenOpportunities = tokenOpportunityResponses.flat();
        }

        return this.mapTokenOpportunitiesToAprs(tokenOpportunities, pools, aaveTokenMappings);
    }

    private mapTokenOpportunitiesToAprs(
        opportunities: MerklOpportunity[],
        affectedPools: PoolAPRData[],
        aaveTokenMappings: Map<string, string>,
    ): {
        id: string;
        type: PrismaPoolAprType;
        title: string;
        chain: $Enums.Chain;
        poolId: string;
        apr: number;
    }[] {
        const aprs: {
            id: string;
            type: PrismaPoolAprType;
            title: string;
            chain: $Enums.Chain;
            poolId: string;
            apr: number;
        }[] = [];

        for (const opportunity of opportunities) {
            const pools = affectedPools.filter(
                (pool) =>
                    pool.chain === chainIdToChain[opportunity.chainId] &&
                    pool.tokens.some((token) =>
                        aaveTokenMappings.get(token.address.toLowerCase())
                            ? aaveTokenMappings.get(token.address.toLowerCase()) ===
                              opportunity.explorerAddress.toLowerCase()
                            : token.address === opportunity.explorerAddress.toLowerCase(),
                    ),
            );

            for (const pool of pools) {
                if (!pool || !pool.dynamicData?.totalLiquidity) {
                    continue;
                }

                const tvl = pool.tokens.map((t) => t.balanceUSD).reduce((a, b) => a + b, 0);
                const tokenTvl =
                    pool.tokens.find((token) =>
                        aaveTokenMappings.get(token.address.toLowerCase())
                            ? aaveTokenMappings.get(token.address) === opportunity.explorerAddress.toLowerCase()
                            : token.address === opportunity.explorerAddress.toLowerCase(),
                    )?.balanceUSD || 0;

                const tokenShareOfPoolTvl = tokenTvl === 0 || tvl === 0 ? 0 : tokenTvl / tvl;

                aprs.push({
                    id: `${pool.id}-merkl`,
                    type: PrismaPoolAprType.MERKL,
                    title: `Merkl Rewards`,
                    chain: chainIdToChain[opportunity.chainId],
                    poolId: pool.id,
                    apr: (opportunity.apr / 100) * tokenShareOfPoolTvl,
                });
            }
        }

        return aprs.filter((item) => item !== null);
    }

    private mapOpportunitiesToAprs(
        opportunities: MerklOpportunity[],
        affectedPools: PoolAPRData[],
    ): {
        id: string;
        type: PrismaPoolAprType;
        title: string;
        chain: $Enums.Chain;
        poolId: string;
        apr: number;
    }[] {
        const aprs: {
            id: string;
            type: PrismaPoolAprType;
            title: string;
            chain: $Enums.Chain;
            poolId: string;
            apr: number;
        }[] = [];

        for (const opportunity of opportunities) {
            const pool = affectedPools.find(
                (pool) =>
                    pool.address === opportunity.identifier.toLowerCase() &&
                    pool.chain === chainIdToChain[opportunity.chainId],
            );

            if (!pool || !pool.dynamicData?.totalLiquidity) {
                continue;
            }

            aprs.push({
                id: `${pool.id}-merkl`,
                type: PrismaPoolAprType.MERKL,
                title: `Merkl Rewards`,
                chain: chainIdToChain[opportunity.chainId],
                poolId: pool.id,
                apr: opportunity.apr / 100,
            });
        }

        return aprs.filter((item) => item !== null);
    }

    private async getTokenMappings(assets?: any[]) {
        const wrapperToATokenMap = new Map<string, string>();
        if (!assets || assets.length === 0) return wrapperToATokenMap;
        // create map wrapper -> aToken
        for (const asset of assets) {
            const wrappers = [asset.STATIC_A_TOKEN?.toLowerCase(), asset.STATA_TOKEN?.toLowerCase()].filter((w) => !!w);
            for (const wrapper of wrappers) {
                wrapperToATokenMap.set(wrapper, asset.A_TOKEN.toLowerCase());
            }
        }
        return wrapperToATokenMap;
    }
    private async merklFetch(url: string): Promise<Response> {
        const apiKey = env.MERKL_API_KEY;
        const headers: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {};
        return fetch(url, { headers });
    }
}
