module.exports = {
  getPrices: async (tokens) => {
    // Пример: возвращает цену TRX = 0.26$
    return {
      tron: { price: 0.26 },
    };
  },
};
