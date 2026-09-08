exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'townsquare-lending' WHERE project = 'townsquare'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'townsquare' WHERE project = 'townsquare-lending'`);
};
