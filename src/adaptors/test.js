const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
};

const adapter = global.adapter;
const apy = global.apy;
const poolsUrl = global.poolsUrl;
const protocolId = global.protocolId;

const uniquePoolIdentifiersDB = global.uniquePoolIdentifiersDB;
const protocols = global.protocolsSlug;
const protocolsBySlug = global.protocolsBySlug;

// fast mode: only ensure adapter main function executed
if (process.env.npm_config_fast) {
  describe(`Running ${process.env.npm_config_adapter} Test (fast)`, () => {
    test('Adapter executed and returned an array', () => {
      expect(Array.isArray(apy)).toBe(true);
    });
  });
  // skip rest of the checks in fast mode
} else {

describe(`Running ${process.env.npm_config_adapter} Test`, () => {
  const isRoutingOnlyPool = (pool) =>
    ['routing_collateral', 'routing_reserve'].includes(pool.poolKind);

  describe('Check for allowed field names', () => {
    const optionalFields = [
      'apy',
      'apyBase',
      'apyReward',
      'underlyingTokens',
      'rewardTokens',
      'poolMeta',
      'url',
      'apyBaseBorrow',
      'apyRewardBorrow',
      'totalSupplyUsd',
      'totalBorrowUsd',
      'ltv',
      'borrowable',
      'borrowFactor',
      'debtCeilingUsd',
      'availableBorrowUsd',
      'mintedCoin',
      'borrowToken',
      'apyBase7d',
      'apyRewardFake',
      'apyRewardBorrowFake',
      'il7d',
      'volumeUsd1d',
      'volumeUsd7d',
      'apyBaseInception',
      'searchTokenOverride',
      'isIntrinsicSource',
      'token',
      'pricePerShare',
      'routeGroupKey',
      'underlyingStateKey',
      'poolKind',
    ];
    const fields = [...Object.keys(baseFields), ...optionalFields, 'tvlUsd'];
    apy.forEach((pool) => {
      const disallowedKeys = Object.keys(pool).filter(
        (f) => !fields.includes(f)
      );
      test(`Pool ${pool.pool} should only contain allowed keys`, () => {
        expect(disallowedKeys).toEqual([]);
      });
    });
  });

  test("Check if link to the pool's page exist", () => {
    const poolsLink = apy[0].url || poolsUrl;
    expect(typeof poolsLink).toBe('string');
  });

  test('Check for unique pool ids', () => {
    const poolIds = apy.map((pool) => pool.pool);
    const seen = new Set();
    const duplicates = poolIds.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    expect(duplicates).toEqual([]);
  });

  describe('Check apy data types', () => {
    const apyFields = ['apy', 'apyBase', 'apyReward'];

    apy.forEach((pool) => {
      test(`Expects pool with id ${pool.pool} to have at least one number apy field`, () => {
        if (isRoutingOnlyPool(pool)) return;
        expect(
          apyFields.map((field) => Number.isFinite(pool[field]))
        ).toContain(true);
      });
    });
  });

  describe('Check tvl data type', () => {
    apy.forEach((pool) => {
      test(`tvlUsd field of pool with id ${pool.pool} should be number `, () => {
        if (isRoutingOnlyPool(pool)) return;
        expect(Number.isFinite(pool.tvlUsd)).toBe(true);
      });
    });
  });

  describe('Check tokens data types', () => {
    const tokenFields = ['rewardTokens', 'underlyingTokens'];

    apy.forEach((pool) => {
      tokenFields.forEach((field) => {
        if (pool[field]) {
          test(`${field} field of pool with id ${pool.pool} should be an Array of strings`, () => {
            expect(Array.isArray(pool[field])).toBe(true);
            const nonStringValues = pool[field].filter(
              (v) => typeof v !== 'string'
            );
            expect(nonStringValues).toEqual([]);
          });
        }
      });
    });
  });

  describe('Check token data type', () => {
    apy.forEach((pool) => {
      if (pool.token) {
        test(`token field of pool with id ${pool.pool} should be a string`, () => {
          expect(typeof pool.token).toBe('string');
        });
      }
    });
  });

  describe('Check searchTokenOverride data type', () => {
    apy.forEach((pool) => {
      if (pool.searchTokenOverride) {
        test(`searchTokenOverride field of pool with id ${pool.pool} should be a string`, () => {
          expect(typeof pool.searchTokenOverride).toBe('string');
        });
      }
    });
  });

  describe('Check other fields data types', () => {
    apy.forEach((pool) => {
      test(`Expect other fields of pool with id ${pool.pool} to match thier data types`, () => {
        Object.entries(baseFields).map(([field, type]) => {
          expect(typeof pool[field]).toBe(type);
        });
      });
    });
  });

  describe('Check if pool has a rewardApy then rewardTokens must also exist', () => {
    apy.forEach((pool) => {
      test(`The pool ${pool.pool} is expected to have a rewardTokens field`, () => {
        if (pool.apyReward)
          expect((pool.rewardTokens || []).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Check if pool id already used by other project', () => {
    const uniqueIds = new Set(apy.map(({ pool }) => pool));
    const duplicatedPoolIds = [...uniqueIds].filter((p) =>
      uniquePoolIdentifiersDB.has(p)
    );

    if (duplicatedPoolIds.length > 0) {
      duplicatedPoolIds.forEach((poolId) => {
        const existingProject = uniquePoolIdentifiersDB.get(poolId);
        test(`Pool ${poolId} should not already be used (owned by "${existingProject}")`, () => {
          expect(existingProject).toBeUndefined();
        });
      });
    } else {
      test('No pool IDs are duplicated across projects', () => {
        expect(duplicatedPoolIds.length).toBe(0);
      });
    }
  });

  test('All pools should have the same project field matching the adapter name and a known protocol slug', () => {
    const projectNames = [...new Set(apy.map((p) => p.project))];
    expect(projectNames).toEqual([adapter]);
    expect(protocols).toContain(apy[0].project);
  });

  test('Adapter exports the protocolId matching its protocol slug', () => {
    const protocol = protocolsBySlug.get(adapter);

    expect(protocol).toBeDefined();
    expect(typeof protocolId).toBe('string');
    expect(protocolId).toBe(String(protocol.id));
  });

  describe('Check additional field data rules', () => {
    // All fields added here are treated as optional
    // If a field is present, it will be checked against its rules
    let additionalFieldRules = {
      totalSupplyUsd: {
        type: 'number',
      },
      totalBorrowUsd: {
        type: 'number',
      },
      availableBorrowUsd: {
        type: 'number',
        min: 0,
      },
      ltv: {
        min: 0,
        max: 1,
      },
      pricePerShare: {
        type: 'number',
        min: 0,
      },
      isIntrinsicSource: {
        type: 'boolean',
      },
      borrowToken: {
        type: 'string',
      },
      routeGroupKey: {
        type: 'string',
      },
      underlyingStateKey: {
        type: 'string',
      },
      poolKind: {
        type: 'string',
        values: ['routing_collateral', 'routing_reserve'],
      },
    };

    apy.forEach((pool) => {
      if (pool.mintedCoin != null) {
        test(`Pool ${pool.pool} with mintedCoin should include a borrowToken`, () => {
          expect(pool.borrowToken).toBeDefined();
          expect(pool.borrowToken).not.toBeNull();
        });
      }
      Object.entries(additionalFieldRules).map(([field, rule]) => {
        if (pool[field] !== undefined) {
          if (rule.type !== undefined) {
            test(`${field} field of pool with id ${pool.pool} should be a ${rule.type}`, () => {
              expect(typeof pool[field]).toBe(rule.type);
            });
          }
          if (rule.values !== undefined) {
            test(`${field} field of pool with id ${pool.pool} should be one of ${rule.values.join(', ')}`, () => {
              expect(rule.values).toContain(pool[field]);
            });
          }
          if (rule.max !== undefined && rule.min !== undefined) {
            test(`${field} field of pool with id ${pool.pool} should be in the range of ${rule.min}-${rule.max}`, () => {
              expect(pool[field]).toBeLessThanOrEqual(rule.max);
            });
          } else if (rule.min !== undefined && rule.max === undefined) {
            test(`${field} field of pool with id ${pool.pool} should be greater than or equal to ${rule.min}`, () => {
              expect(pool[field]).toBeGreaterThanOrEqual(rule.min);
            });
          } else if (rule.max !== undefined && rule.min === undefined) {
            test(`${field} field of pool with id ${pool.pool} should be less than or equal to ${rule.max}`, () => {
              expect(pool[field]).toBeLessThanOrEqual(rule.max);
            });
          }
        }
      });
    });
  });
});
}
