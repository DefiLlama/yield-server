exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'minswap-dex' WHERE project = 'minswap'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'minswap' WHERE project = 'minswap-dex'`);
};
