exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'gmx-solana' WHERE project = 'gmtrade'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'gmtrade' WHERE project = 'gmx-solana'`);
};
