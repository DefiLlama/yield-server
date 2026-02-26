const utils = require('../utils');
const axios = require('axios');

const OSMOSIS_COINGECKO = {
  'uosmo': 'coingecko:osmosis',
  'ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4': 'coingecko:usd-coin',
  'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2': 'coingecko:cosmos',
  'ibc/C140AFD542AE77BD7DCC83F13FDD8C5E5BB8C4929785E6EC2F4C636F98F17901': 'coingecko:stride-staked-atom',
  'ibc/D79E7D83AB399BFFF93433E54FAA480C191248FC556924A2A8351AE2638B3877': 'coingecko:celestia',
  'ibc/1480B8FD20AD5FCAE81EA87584D269547DD4D436843C1D20F15E00EB64743EF4': 'coingecko:akash-network',
  'ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB': 'coingecko:tether',
  'ibc/64BA6E31FE887D66C6F8F31C7B1A80C7CA179239677B4088BB55F5EA07DBE273': 'coingecko:injective-protocol',
  'ibc/698350B8A61D575025F3ED13E9AC9C0F45C89DEFE92F76D5838F1D3C1A7FF7C9': 'coingecko:stride-staked-tia',
  'ibc/C1B4D4BE14E7AB38D5FD3ABAB1EDF35CC8C459AF15BADC9F8D9E2C1DDCA7A8D2': 'coingecko:cosmos',
  'ibc/2F21E6D4271DE3F561F20A02CD541DAF7405B1E9CB3B9B07E3C2AC7D8A4338A5': 'coingecko:wrapped-steth',
  'ibc/23104D411A6A0DE752A910B921E4C063B848DEBBDAE53626C9DE5E0AA9B7EF01': 'coingecko:ondo-us-dollar-yield',
  'ibc/92AE2F53284505223A1BB80D132F859A00E190C6A738A8FCF5C2BD8B4438838E': 'coingecko:monerium-eur-money',
  'ibc/0954E1C28EB7AF5B72D24F3BC2B47BBB2FDF91BDDFD57B74B99E133AED40972A': 'coingecko:secret',
  'ibc/46B44899322F3CD854D2D46DEEF881958467CDD4B3B10086DA49296BBED94BED': 'coingecko:juno-network',
  'ibc/E6931F78057F7CC5DA0FD6CEF82FF39373A6E0452BF1FD76910B93292CF356C1': 'coingecko:crypto-com-chain',
  'ibc/7C4D60AA95E5F7589B846309F1BEF03F1C22026930551A22B992ED28C8DE7E41': 'coingecko:iris-network',
  'ibc/987C17B11ABC2B20019178ACE62929FE9840202CE79498E29FE8E5CB02B7C0A4': 'coingecko:stargaze',
  'ibc/9712DBB13B9631EDFA9BF61B55F1B2D290B2ADB67E3A4EB3A875F3B6081B3B84': 'coingecko:regen',
  'ibc/92BE0717F4678905E53F4E45B2DED18BC0CB97BF1F8B6A25AFEDF3D5A879B4D5': 'coingecko:inter-stable-token',
  'ibc/FA602364BEC305A696CBDF987058E99D8B479F0318E47314C49173E8838C5BAC': 'coingecko:quicksilver',
  'ibc/2CC08A10B5EDA1205F72DC40A5427CCB4DF1BBF370E85A8FECBE4C10E9FE1C0D': 'coingecko:solv-btc',
  'ibc/F3166F4D31D6BA1EC6C9F5536F5DDDD4CC93DBA430F7419E7CDC41C497944A65': 'coingecko:coreum',
  'ibc/D9AFCECDD361D38302AA66DCDFC12D5F60C71BA15A2F2B74E95E9E4F3FF2E462': 'coingecko:nolus',
  'ibc/0FA92328D2EAA3BFB98B5CC29E8D2DE9A02E3B0F7159CC8E2BE832A5ECA8B93A': 'coingecko:umee',
  'ibc/D176154B0C63D1F9C6DCFB4F70349EBF2E2B5A87A05902F57A6AE92B863E9AEC': 'coingecko:stride-staked-osmo',
  'factory/osmo1z0qrq605sjgcqpylfl4aa6s90x738j7m58wyatt0tdzflg2ha26q67k743/wbtc': 'coingecko:wrapped-bitcoin',
  'ibc/EA1D43981D5C9A1C4AAEA9C23BB1D4FA126BA9BC7020A25E0AE4AA841EA25DC5': 'coingecko:axlweth',
  'ibc/D1542AA8762DB13087D8364F3EA6509FD6F009A34F00426AF9E4F9FA85CBBF1F': 'coingecko:axlwbtc',
  'ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858': 'coingecko:axlusdc',
  'ibc/69110FF673D70B39904FF056CFDFD58A90BEC3194303F45C32CB91B8B0A738EA': 'coingecko:islamic-coin',
  'ibc/245C3CA604AAB4BB9EEA5E86F23F52D59253D8722C8FC9C4E3E69F77C5CD3D2F': 'coingecko:islamic-coin',
  'ibc/92AE2F53284505223A1BB80D132F859A00E190C6A738772F0B3EF65E20BA484F': 'coingecko:monerium-eur-money-2',
  'ibc/23104D411A6EB6031FA92FB75F227422B84989969E91DCAD56A535DD7FF0A373': 'coingecko:ondo-us-dollar-yield',
  'ibc/BC26A7A805ECD6822719472BCB7842A48EF09DF206182F8F259B2593EB5D23FB': 'coingecko:atomone',
  'factory/osmo1f5vfcph2dvfeqcqkhetwv75fda69z7e5c2dldm3kvgj23crkv6wqcn47a0/umilkTIA': 'coingecko:milkyway-staked-tia',
  'ibc/EC3A4ACBA1CFBEE698472D3563B70985AEA5A7144C319B61B3EBDFB5': 'coingecko:babylon',
  'ibc/D6E02C5AE8A37FC2E3AB1FC8AC168878ADB870549383DFFEA9FD020C': 'coingecko:photon-2',
  'ibc/903A61A498756EA560B85A85132D3AEE21B5DEDD41213725D22ABF27': 'coingecko:axelar',
  'ibc/EA4C0A9F72E2CEDF10D0E7A9A6A89E75DAB0F7C4FCB0A624B69215B8BC6A': 'coingecko:desmos',
  'ibc/3BCCC93AD5DF58D11A6F8A05FA8BC801CBA0BA61A981F57E91B8B598': 'coingecko:medibloc',
  'ibc/AD969E97A63B64B30A6E4D9F598341A403B849F5ACFEAA9F18DBD925': 'coingecko:arkeo',
  'factory/osmo1s3l0lcqc7tu0vpj6wdjz9wqpxv8nk6eraevje4fuwkyjnwu': 'coingecko:backbone-staked-osmo',
  'ibc/C1B4D4804EB8F95FFB75E6395A301F0AD6D7DDE5C3A45571B70E46A3': 'coingecko:cosmos',
  'ibc/2E3784772E70F7B3A638BA88F65C8BE125D3CDB6E28C6AABC51098C9': 'coingecko:xion-2',
  'ibc/5D1F516200EE8C6B2354102143B78A2DEDA25EDE771AC0F8DC3C1837': 'coingecko:fetch-ai',
  'ibc/0CD3A0285E1341859B5E86B6AB7682F023D03E97607CCC1DC9570641': 'coingecko:dai',
  'ibc/A8CA5EE328FA10C9519DF6057DA1F69682D28F7D0F5CCC7ECB72E3DC': 'coingecko:stride',
  'ibc/040D0BE35BED6A09D9418C29961FDA0EE0C3B0C71053B2E3FE38FBA7': 'coingecko:babylon',
};

// Factory/alloyed token patterns
const OSMOSIS_FACTORY_PATTERNS = [
  { match: 'allBTC', id: 'coingecko:bitcoin' },
  { match: 'allETH', id: 'coingecko:ethereum' },
  { match: 'allSOL', id: 'coingecko:solana' },
  { match: 'allUSDT', id: 'coingecko:tether' },
  { match: 'allDOGE', id: 'coingecko:dogecoin' },
  { match: 'allPEPE', id: 'coingecko:pepe' },
  { match: 'allLINK', id: 'coingecko:chainlink' },
  { match: 'allXRP', id: 'coingecko:ripple' },
  { match: 'allZEC', id: 'coingecko:zcash' },
];

const resolveOsmosisToken = (denom) => {
  if (!denom) return denom;
  if (OSMOSIS_COINGECKO[denom]) return OSMOSIS_COINGECKO[denom];
  for (const p of OSMOSIS_FACTORY_PATTERNS) {
    if (denom.includes(p.match)) return p.id;
  }
  return denom;
};

const apy = async () => {
  const tvlData = await utils.getData(
    'https://data.osmosis.zone/pairs/v2/summary'
  );

  const aprData = await axios.get('https://osmosis.numia.xyz/pools_apr_range', {
    headers: {
      Authorization: `Bearer ${process.env.OSMOSIS_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = tvlData.data.map((pool) => {
    const symbol = `${pool.base_symbol}-${pool.quote_symbol}`;

    if (symbol.includes(undefined)) return null;

    const apr = aprData.data.find((i) => i.pool_id === pool.pool_id);
    if (!apr) return null;
    const apyBase = apr.swap_fees.lower;

    return {
      pool: `osmosis-${pool.pool_id}`,
      chain: 'Osmosis',
      project: 'osmosis-dex',
      symbol: utils.formatSymbol(symbol),
      tvlUsd: pool.liquidity,
      apyBase,
      apyBase7d: apyBase,
      volumeUsd1d: pool.volume_24h,
      volumeUsd7d: pool.volume_7d,
      underlyingTokens: [pool.base_address, pool.quote_address].filter(Boolean).map(resolveOsmosisToken),
      url: `https://app.osmosis.zone/pool/${pool.pool_id}`,
      poolMeta: `#${pool.pool_id}`,
    };
  });

  return utils.removeDuplicates(
    data.filter((p) => p && utils.keepFinite(p) && p.tvlUsd < 50e6)
  );
};

module.exports = {
  apy,
};
