const { request, gql } = require('graphql-request');
const { ethers } = require('ethers');

const SUBGRAPH_URL ='https://api.thegraph.com/subgraphs/name/stakehouse-dev/stakehouse-protocol';

const totaldETHMinted = gql`
  query totaldETHMinted {
  stakeHouses {
    dETHMintedWithinHouse
  }
}
`;

const getTotaldETHMinted = async () => {
  const { totalDETHMintedAmt } = await request(SUBGRAPH_URL, totaldETHMinted, {});
  console.log("Total dETH Stakehouse API response:");
  console.log(totalDETHMintedAmt);
   
  let total = 0;

  totalDETHMintedAmt.data.stakeHouses.forEach((stakeHouse) => {
    total += Number(stakeHouse.dETHMintedWithinHouse);
  });

  const totalEthMinted = ethers.utils.formatEther(total);

  return totalEthMinted;
};

module.exports = {
  getTotaldETHMinted
};
