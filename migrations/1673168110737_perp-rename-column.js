exports.up = (pgm) => {
  pgm.renameColumn('perpetual', 'marketPlace', 'marketplace');
};
