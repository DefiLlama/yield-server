const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
};

const adapter = global.adapter;
const apy = global.apy;
const poolsUrl = global.poolsUrl;

const uniquePoolIdentifiersDB = global.uniquePoolIdentifiersDB;
const protocols = global.protocolsSlug;

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
      'mintedCoin',
      'apyBase7d',
      'apyRewardFake',
      'apyRewardBorrowFake',
      'il7d',
      'volumeUsd1d',
      'volumeUsd7d',
      'apyBaseInception',
    ];
    const fields = [...Object.keys(baseFields), ...optionalFields, 'tvlUsd'];
    apy.forEach((pool) => {
      test(`Expects pool id ${
        pool.pool
      } to contain only allowed keys: ${fields} and has: ${Object.keys(
        pool
      )}`, () => {
        expect(Object.keys(pool).every((f) => fields.includes(f))).toBe(true);
      });
    });
  });

  test("Check if link to the pool's page exist", () => {
    const poolsLink = apy[0].url || poolsUrl;
    expect(typeof poolsLink).toBe('string');
  });

  test('Check for unique pool ids', () => {
    const poolIds = apy.map((pool) => pool.pool);
    const uniquePoolIds = [...new Set(poolIds)];
    expect(poolIds).toEqual(uniquePoolIds);
  });

  describe('Check apy data types', () => {
    const apyFields = ['apy', 'apyBase', 'apyReward'];

    apy.forEach((pool) => {
      test(`Expects pool with id ${pool.pool} to have at least one number apy field`, () => {
        expect(
          apyFields.map((field) => Number.isFinite(pool[field]))
        ).toContain(true);
      });
    });
  });

  describe('Check tvl data type', () => {
    apy.forEach((pool) => {
      test(`tvlUsd field of pool with id ${pool.pool} should be number `, () => {
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
            const isStringArray =
              pool[field].map((v) => typeof v).filter((v) => v === 'string')
                .length === pool[field].length;
            expect(isStringArray).toBe(true);
          });
        }
      });
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

    test('Print duplicated pool IDs and their existing projects', () => {
      if (duplicatedPoolIds.length > 0) {
        console.log('\nDuplicated pool IDs found:');
        duplicatedPoolIds.forEach((poolId) => {
          console.log(`Pool ID: ${poolId} is already used by another project`);
        });
      }
      expect(duplicatedPoolIds.length).toBe(0);
    });
  });

  test('Check project field is constant in all pools and if folder name and project field in pool objects matches the information in /protocols slug', () => {
    expect(new Set(apy.map((p) => p.project)).size).toBe(1);
    expect(
      protocolsSlug.includes(apy[0].project) && apy[0].project === adapter
    ).toBe(true);
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
      ltv: {
        min: 0,
        max: 1,
      },
    };

    apy.forEach((pool) => {
      Object.entries(additionalFieldRules).map(([field, rule]) => {
        if (pool[field] !== undefined) {
          if (rule.type !== undefined) {
            test(`${field} field of pool with id ${pool.pool} should be a ${rule.type}`, () => {
              expect(typeof pool[field]).toBe(rule.type);
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
