exports.up = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'resolv-usr' WHERE project = 'resolv'`);
};

exports.down = (pgm) => {
  pgm.sql(`UPDATE config SET project = 'resolv' WHERE project = 'resolv-usr'`);
};
