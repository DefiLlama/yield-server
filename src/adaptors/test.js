const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
};

const apy = global.apy;
const uniquePoolIdentifiersDB = global.uniquePoolIdentifiersDB;

describe(`Running ${process.env.npm_config_adapter} Test`, () => {
  test('Check for unique pool ids', () => {
    const poolIds = apy.map((pool) => pool.pool);
    const uniquePoolIds = [...new Set(poolIds)];
    expect(poolIds).toEqual(uniquePoolIds);
  });

  describe('Check apy data types', () => {
    const apyFields = ['apy', 'apyBase', 'apyReward'];

    apy.forEach((pool) => {
      test(`Expects pool with id ${pool.pool} to have at least one number apy field`, () => {
        expect(apyFields.map((field) => typeof pool[field])).toContain(
          'number'
        );
      });
    });
  });

  describe('Check tvl data type', () => {
    apy.forEach((pool) => {
      test(`tvlUsd field of pool with id ${pool.pool} should be number `, () => {
        expect(typeof pool.tvlUsd).toBe('number');
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
              pool.field.map((v) => typeof v).filter((v) => v === string)
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

  describe('Check if pool id already used by other project', () => {
    const uniqueIds = new Set(apy.map(({ pool }) => pool));
    const duplicatedPoolIds = new Set(
      [...uniqueIds].filter((p) => uniquePoolIdentifiersDB.has(p))
    );

    test('Expect duplicate ids array to be empty', () => {
      expect(duplicatedPoolIds.size).toBe(0);
    });
  });
});
