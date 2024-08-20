


module.exports.getFeeFromVolume = (volumeUSD1D, feeTier, v3ProtocolFee) => {

    const poolFeePercent = extractNumberFee(v3ProtocolFee)
    return volumeUSD1D * feeTier * poolFeePercent / 10000;
}


function extractNumberFee(protocolFee) {


}