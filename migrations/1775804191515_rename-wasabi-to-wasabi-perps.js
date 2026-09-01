exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'wasabi-perps' WHERE project = 'wasabi'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'wasabi' WHERE project = 'wasabi-perps'`);
};
