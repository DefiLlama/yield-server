exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'invesco-ustb' WHERE project = 'superstate-ustb'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'superstate-ustb' WHERE project = 'invesco-ustb'`);
};
