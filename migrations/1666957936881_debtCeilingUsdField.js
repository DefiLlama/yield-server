exports.up = (pgm) => {
  pgm.addColumns('yield', {
    debtCeilingUsd: 'numeric',
  });
};
