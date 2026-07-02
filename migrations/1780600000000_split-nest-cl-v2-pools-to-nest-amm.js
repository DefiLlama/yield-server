// v2 pools currently stored under nest-cl; moved to nest-amm (v3 stays on nest-cl).
// config_id is preserved by the UPDATE, so yield history stays linked.
const V2_POOLS = [
  '0x4dd810b2ba72e43ed2658d6ed639ebda47372048-hyperevm',
  '0x9aa281b23341ce69d4b1500367a43cfc42005538-hyperevm',
  '0x8b153e2bdeb10e99c4900b5c68dae7d37b7c213a-hyperevm',
];

exports.up = (pgm) => {
  pgm.sql(
    `UPDATE config SET project = 'nest-amm'
     WHERE project = 'nest-cl'
       AND pool IN (${V2_POOLS.map((p) => `'${p}'`).join(', ')})`
  );
};

exports.down = (pgm) => {
  pgm.sql(
    `UPDATE config SET project = 'nest-cl'
     WHERE project = 'nest-amm'
       AND pool IN (${V2_POOLS.map((p) => `'${p}'`).join(', ')})`
  );
};
