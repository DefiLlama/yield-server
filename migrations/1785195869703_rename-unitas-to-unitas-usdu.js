exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'unitas-usdu' WHERE project = 'unitas'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'unitas' WHERE project = 'unitas-usdu'`);
};
