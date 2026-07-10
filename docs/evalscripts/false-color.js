// Original Sentinel Hub evalscript (kept as reference/attribution) — the
// source lib/renderModes.ts's false-color port was written against. No
// longer executed by this app (rendering moved to client-side COG
// decoding), see README.md's "Render modes" section.
//VERSION=3
function setup(){
  return{
    input: ["B03", "B04", "B08", "dataMask"],
    output: {bands: 4}
  }
}

function evaluatePixel(sample){
  let gain = 2.5;
  return [sample.B08 * gain, sample.B04 * gain, sample.B03 * gain, sample.dataMask];
}
