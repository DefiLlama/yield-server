exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'ember' WHERE project = 'ember-protocol'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'ember-protocol' WHERE project = 'ember'`);
};
