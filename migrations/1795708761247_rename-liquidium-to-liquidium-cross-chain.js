exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'liquidium-cross-chain' WHERE project = 'liquidium'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'liquidium' WHERE project = 'liquidium-cross-chain'`);
};
