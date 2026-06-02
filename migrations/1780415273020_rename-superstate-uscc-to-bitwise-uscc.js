exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'bitwise-uscc' WHERE project = 'superstate-uscc'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'superstate-uscc' WHERE project = 'bitwise-uscc'`);
};
