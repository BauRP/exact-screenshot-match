/** Keep the plugin-owned Android Small native ad in its 120dp card.
 * @capacitor-community/admob 8.2.1; run after package installation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const base=join(process.cwd(),"node_modules","@capacitor-community","admob");
const version=JSON.parse(readFileSync(join(base,"package.json"),"utf8")).version;
if(version!=="8.2.1") throw new Error("Native ad patch requires 8.2.1; got "+version);
const dir=join(base,"android","src","main","java","com","getcapacitor","community","admob","nativeads");
function apply(name, before, after) {
  const file=join(dir,name), source=readFileSync(file,"utf8");
  if(source.includes(after)&&!source.includes(before)) return;
  if(source.split(before).length!==2) throw new Error("AdMob Kotlin source has changed: "+name);
  writeFileSync(file,source.replace(before,after));
}
apply("PluginNativeAdView.kt",
  "val iconSize = pixels(if (isSmall) 28 else 32)",
  "// Make advertiser icons readable while retaining the 120dp Small card.\n        val iconSize = pixels(40)");
apply("NativeAdExecutor.kt",
  "if (value.rectWidth < minimumWidth.roundToInt() || value.rectHeight < minimumHeight.roundToInt()) return null",
  "if (value.rectWidth < minimumWidth.roundToInt() || value.rectHeight < minimumHeight.roundToInt()) return null\n        // Avoid showing clipped ad slivers smaller than 40dp when scrolling.\n        val minimumVisible = (40 * density).roundToInt()\n        if (value.clipWidth < minimumVisible || value.clipHeight < minimumVisible) return null");
console.log("Android native ad layout patched: 40dp icon; 40dp minimum visible clip.");
