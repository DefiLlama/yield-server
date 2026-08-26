exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'plume-vaults' WHERE project = 'nest-credit'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'nest-credit' WHERE project = 'plume-vaults'`);
};
