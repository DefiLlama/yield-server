exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'ipor-fusion' WHERE project = 'fusion-by-ipor'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'fusion-by-ipor' WHERE project = 'ipor-fusion'`);
};
