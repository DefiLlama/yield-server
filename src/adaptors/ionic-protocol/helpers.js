const formatUnits = (value, decimals = 18) => {
    return Number(value) / Math.pow(10, decimals);
  };
  
  module.exports = { formatUnits };
  