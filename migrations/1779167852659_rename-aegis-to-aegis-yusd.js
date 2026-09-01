exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'aegis-yusd' WHERE project = 'aegis'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'aegis' WHERE project = 'aegis-yusd'`);
};
