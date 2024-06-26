const utils = require('../utils');
 
async function main() {
    const apyData = await utils.getData(
        'https://pointsapi.stablejack.xyz/api/algos/apy'
      ); 
      return apyData.apy
}
 

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.stablejack.xyz',
};


// here is how we calculate apy:
// const getAPR = async () => {
//     try {
//       const response = await axios.get('https://api.benqi.fi/liquidstaking/apr');
//       const apr = response.data.apr;
//       return apr;
//     } catch (error) {
//       console.error('Error fetching APR:', error);
//       return 0;
//     }
//   };
  
//   async function getTreasuryTotalwsAVAX() {
//     try {
//       const response = await client2.readContract({
//         address: "0xDC325ad34C762C19FaAB37d439fbf219715f9D58",
//         abi: sAVAXTreasuryABI,
//         functionName: "totalBaseToken",
//         args: [],
//         chainId: 43114,
//       });
  
//       return response ? formatEther(response) : "0";
//     } catch (error) {
//       return "0";
//     }
//   };
  
//   async function getWSAVAXPrice() {
//     try {
//       const response = await client2.readContract({
//         address: "0x600466c3c707A75129C7B7BC280e5A00C219fEF0",
//         abi: sAVAXOracleABI,
//         functionName: "getData",
//         args: [],
//         chainId: 43114,
//       });
  
//       return response ? formatEther(response[0]) : "0";
//     } catch (error) {
//       return "0";
//     }
//   };
  
//   async function getSAVAXPrice() {
//     try {
//       const response = await client2.readContract({
//         address: "0x2854Ca10a54800e15A2a25cFa52567166434Ff0a",
//         abi: Aggregator,
//         functionName: "latestRoundData",
//         args: [],
//         chainId: 43114,
//       });
  
//       return response ? formatEther(response[1]) : "0";
//     } catch (error) {
//       return "0";
//     }
//   };
  
//   async function getaUSDPrice() {
//     try {
//       const response = await client2.readContract({
//         address: "0xaBe7a9dFDA35230ff60D1590a929aE0644c47DC1",
//         abi: aUSDabi,
//         functionName: "nav",
//         args: [],
//         chainId: 43114,
//       });
  
//       return response ? formatEther(response) : "0";
//     } catch (error) {
//       return "0";
//     }
//   }
  
//   async function getRPoolTotalSupply() {
//     try {
//       const response = await client2.readContract({
//         address: "0x0363a3deBe776de575C36F524b7877dB7dd461Db",
//         abi: rPoolABI,
//         functionName: "totalSupply",
//         args: [],
//         chainId: 43114,
//       });
  
//       return response ? formatEther(response) : "0";
//     } catch (error) {
//       return "0";
//     }
//   }
  
//   async function calculateRPoolAPR() {
//     const totalwsAVAX = await getTreasuryTotalwsAVAX();
//     const wsAVAXPrice = await getWSAVAXPrice();
//     const totalSAVAX = parseFloat(totalwsAVAX) * parseFloat(wsAVAXPrice);
    
//     const sAVAXPrice = await getSAVAXPrice();
//     const sAVAXTVL = parseFloat(totalSAVAX) * parseFloat(sAVAXPrice);
  
//     const APR = await getAPR();
  
//     const up = sAVAXTVL * APR;
  
//     const rPoolSupply = await getRPoolTotalSupply();
//     const aUSDPrice = await getaUSDPrice();
  
//     const rPoolTVL = parseFloat(rPoolSupply) * parseFloat(aUSDPrice);
  
//     const realAPR = up / rPoolTVL;
//     const editedAPR = realAPR * 0.9;
//     return editedAPR.toFixed(4);
//   }