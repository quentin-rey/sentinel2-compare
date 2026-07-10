// Original Sentinel Hub evalscript (kept as reference/attribution) — the
// source lib/renderModes.ts's true-color port was written against. No
// longer executed by this app (rendering moved to client-side COG
// decoding), see README.md's "Render modes" section.
//VERSION=3
function setup(){
  return{
    input: ["B02", "B03", "B04", "dataMask"],
    output: {bands: 4}
  }
}

function evaluatePixel(sample){
  // Set gain for visualisation
  let gain = 2.5;
  // Return RGB
  return [sample.B04 * gain, sample.B03 * gain, sample.B02 * gain, sample.dataMask];
}
