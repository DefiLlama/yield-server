const { Cell, Dictionary, beginCell } = require('@ton/core');
const { signVerify } = require('@ton/crypto');

const ORACLES = [
  {
    id: 0,
    address:
      '0xd3a8c0b9fd44fd25a49289c631e3ac45689281f2f8cf0744400b4c65bed38e5d',
    pubkey: Buffer.from(
      'b404f4a2ebb62f2623b370c89189748a0276c071965b1646b996407f10d72eb9',
      'hex'
    ),
  },
  {
    id: 1,
    address:
      '0x2c21cabdaa89739de16bde7bc44e86401fac334a3c7e55305fe5e7563043e191',
    pubkey: Buffer.from(
      '9ad115087520d91b6b45d6a8521eb4616ee6914af07fabdc2e9d1826dbb17078',
      'hex'
    ),
  },
  {
    id: 2,
    address:
      '0x2eb258ce7b5d02466ab8a178ad8b0ba6ffa7b58ef21de3dc3b6dd359a1e16af0',
    pubkey: Buffer.from(
      'e503e02e8a9226b34e7c9deb463cbf7f19bce589362eb448a69a8ee7b2fca631',
      'hex'
    ),
  },
  {
    id: 3,
    address:
      '0xf9a0769954b4430bca95149fb3d876deb7799d8f74852e0ad4ccc5778ce68b52',
    pubkey: Buffer.from(
      '9cbf8374cf1f2cf17110134871d580198416e101683f4a61f54cf2a3e4e32070',
      'hex'
    ),
  },
];

const TTL_ORACLE_DATA_SEC = 120;
const MINIMAL_ORACLES = 3;

function verifyPricesTimestamp(priceData) {
  const timestamp = Date.now() / 1000;
  const pricesTime = priceData.timestamp;
  return timestamp - pricesTime < TTL_ORACLE_DATA_SEC;
}

function verifyPricesSign(priceData) {
  const message = priceData.dataCell.refs[0].hash();
  const signature = priceData.signature;
  const publicKey = priceData.pubkey;

  return signVerify(message, signature, publicKey);
}

function getMedianPrice(pricesData, assetId) {
  try {
    const usingPrices = pricesData.filter((x) => x.dict.has(assetId));
    const sorted = usingPrices
      .map((x) => x.dict.get(assetId))
      .sort((a, b) => Number(a) - Number(b));

    if (sorted.length === 0) {
      return null;
    }

    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2n;
    } else {
      return sorted[mid];
    }
  } catch {
    return null;
  }
}

async function getPrices(endpoint = 'api.evaa.space') {
  let allPricesData;
  try {
    const primaryUrl = `https://${endpoint}/api/prices`;
    const fallbackUrl =
      'https://6khmc-aiaaa-aaaap-ansfq-cai.raw.icp0.io/prices';
    let allPricesResponse;

    try {
      allPricesResponse = await fetch(primaryUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!allPricesResponse.ok) {
        throw new Error(
          `Failed to fetch prices from primary EVAA API: ${allPricesResponse.status} ${allPricesResponse.statusText}`
        );
      }
    } catch (primaryError) {
      console.warn(
        `Primary API fetch failed: ${primaryError.message}. Trying fallback...`
      );
      allPricesResponse = await fetch(fallbackUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!allPricesResponse.ok) {
        throw new Error(
          `Failed to fetch prices from fallback EVAA API: ${allPricesResponse.status} ${allPricesResponse.statusText}`
        );
      }
    }
    allPricesData = await allPricesResponse.json();
  } catch (error) {
    console.error('Error fetching prices from all sources:', error);
    return undefined;
  }

  try {
    const prices = ORACLES.map((oracle) => {
      try {
        const packedDataString = allPricesData[oracle.address];
        if (!packedDataString) {
          console.warn(
            `No data found for oracle ${oracle.id} (address: ${oracle.address}) in EVAA API response.`
          );
          return null;
        }

        const data = JSON.parse(
          decodeURIComponent(
            packedDataString.replace('0x', '').replace(/[0-9a-f]{2}/g, '%$&')
          )
        );

        const pricesCell = Cell.fromBoc(
          Buffer.from(data.packedPrices, 'hex')
        )[0];
        const signature = Buffer.from(data.signature, 'hex');
        const publicKeyFromApi = Buffer.from(data.publicKey, 'hex');
        const timestamp = Number(data.timestamp);

        return {
          dict: pricesCell
            .beginParse()
            .loadRef()
            .beginParse()
            .loadDictDirect(
              Dictionary.Keys.BigUint(256),
              Dictionary.Values.BigVarUint(4)
            ),
          dataCell: beginCell()
            .storeRef(pricesCell)
            .storeBuffer(signature)
            .endCell(),
          oracleId: oracle.id,
          signature: signature,
          pubkey: publicKeyFromApi,
          timestamp: timestamp,
        };
      } catch (error) {
        console.error(
          `Error processing prices for oracle ${oracle.id} (address: ${oracle.address}):`,
          error
        );
        return null;
      }
    });

    const validPrices = prices.filter(
      (price) =>
        price && verifyPricesTimestamp(price) && verifyPricesSign(price)
    );

    if (validPrices.length < MINIMAL_ORACLES) {
      throw new Error('Not enough valid price data');
    }

    const sortedByTimestamp = validPrices
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp);
    const newerPrices = sortedByTimestamp
      .slice(0, MINIMAL_ORACLES)
      .sort((a, b) => a.oracleId - b.oracleId);

    const allAssetIds = new Set(
      newerPrices.flatMap((p) => Array.from(p.dict.keys()))
    );

    const medianData = Array.from(allAssetIds)
      .map((assetId) => ({
        assetId,
        medianPrice: getMedianPrice(newerPrices, assetId),
      }))
      .filter((x) => x.medianPrice !== null);

    const dict = Dictionary.empty();
    for (const { assetId, medianPrice } of medianData) {
      dict.set(assetId, medianPrice);
    }

    return { dict };
  } catch (processingError) {
    console.error('Error processing prices:', processingError);
    return undefined;
  }
}

module.exports = getPrices;
