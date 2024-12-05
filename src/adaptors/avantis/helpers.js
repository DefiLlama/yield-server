module.exports = {
  chunkArray: (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  },
  calculateTrancheTotal: (transfers, trancheAddress) => {
    return transfers
      .filter((t) => t.to.toLowerCase() === trancheAddress.toLowerCase())
      .reduce((acc, t) => acc + parseFloat((t.value / 1e6).toFixed(6)), 0);
  },
};
