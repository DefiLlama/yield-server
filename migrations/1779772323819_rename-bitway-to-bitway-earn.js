exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'bitway-earn' WHERE project = 'bitway'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'bitway' WHERE project = 'bitway-earn'`);
};
