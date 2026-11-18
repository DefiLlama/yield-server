exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'drakewell-usddw' WHERE project = 'jusd-finance'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'jusd-finance' WHERE project = 'drakewell-usddw'`);
};
