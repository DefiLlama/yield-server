const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
};

const adapter = global.adapter;
const apy = global.apy;
const uniquePoolIdentifiersDB = global.uniquePoolIdentifiersDB;
const protocols = global.protocolsSlug;

describe(`Running ${process.env.npm_config_adapter} Test`, () => {
  describe('Check for allowed field names', () => {
    const optionalFields = [
      'apy',
      'apyBase',
      'apyReward',
      'underlyingTokens',
      'rewardTokens',
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
    const duplicatedPoolIds = new Set(
      [...uniqueIds].filter((p) => uniquePoolIdentifiersDB.has(p))
    );

    test('Expect duplicate ids array to be empty', () => {
      expect(duplicatedPoolIds.size).toBe(0);
    });
  });

  test('Check project field is constant in all pools and if folder name and project field in pool objects matches the information in /protocols slug', () => {
    expect(new Set(apy.map((p) => p.project)).size).toBe(1);
    expect(
      protocolsSlug.includes(apy[0].project) && apy[0].project === adapter
    ).toBe(true);
  });
});
