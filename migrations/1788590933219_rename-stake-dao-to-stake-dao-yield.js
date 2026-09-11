exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stake-dao-yield' WHERE project = 'stake-dao'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'stake-dao' WHERE project = 'stake-dao-yield'`);
};
