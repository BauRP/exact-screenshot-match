import { strict as assert } from "node:assert";
import { displayToSourceRect, sourceToDisplayRect, sourceOverlayTransform, pdfTextBounds } from "../src/lib/pdf-page-geometry";
import { hasPdfDraftChanges, hasSaveablePdfContent } from "../src/lib/pdf-edit-guard";
import type { PdfTextOverlay } from "../src/lib/notes-store";
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<0.00001,`not equal: ${a} vs ${b}`);
const sample={x:15,y:24,width:32,height:6};
for (const rotation of [0,90,180,270]) {
  const display=sourceToDisplayRect(sample,rotation);
  const source=displayToSourceRect(display,rotation);
  for (const key of ["x","y","width","height"] as const) close(source[key],sample[key]);
}
assert.equal(sourceOverlayTransform(0,300,500),"none");
assert.equal(sourceOverlayTransform(90,300,500),"translate(500px,0px) rotate(90deg)");
assert.equal(sourceOverlayTransform(180,300,500),"translate(300px,500px) rotate(180deg)");
assert.equal(sourceOverlayTransform(270,300,500),"translate(0px,300px) rotate(270deg)");
const r0=pdfTextBounds([12,0,0,-12,40,60],70,12,300,500);
close(r0.x,40/300*100);close(r0.y,48/500*100);
const r90=pdfTextBounds([0,12,12,0,40,60],70,12,500,300);
close(r90.x,40/500*100);close(r90.y,60/300*100);
const text:PdfTextOverlay={id:"a",page:1,xPct:15,yPct:24,widthPct:32,heightPct:6,text:"Original",cover:true,fontSize:11,fontFamily:"Arial"};
assert.equal(hasPdfDraftChanges(text,{...text}),false);
assert.equal(hasPdfDraftChanges(text,{...text,text:"Changed"}),true);
assert.equal(hasPdfDraftChanges(text,{...text,fontSize:14}),true);
assert.equal(hasSaveablePdfContent({...text,text:"",cover:false}),false);
const src=await Bun.file("src/routes/pdf.$id.tsx").text();
assert.ok(!src.includes("persistOverlays([...overlays, overlay])"),"Tap cannot persist");
assert.ok(src.includes("setDraftOverlay(overlay)"));
assert.ok(src.includes("sourceOverlayTransform(rotation,"));
assert.ok(src.includes("renderedPageRef.current ==="));
assert.ok(src.includes("displayToSourceRect("));
assert.ok(src.includes('WebkitTextFillColor:'));
assert.ok(src.includes("setEditingId(null);"),"Page change exits editor");
const layoutSrc = await Bun.file("src/lib/pdf-text-layout.ts").text();
assert.ok(layoutSrc.includes("wrapPdfGlyphs"));
assert.ok(!src.includes("PdfMarginRuler"));
assert.ok(!src.includes("commitMargins"));
assert.ok(!src.includes("normalizePdfMargins"));
assert.ok(src.includes("draftStartRef.current = overlay"));
assert.ok(src.includes("eraseWidthPct"));
const { wrapPdfGlyphs, displayPdfFontSize } = await import("../src/lib/pdf-text-layout");
const { sameSourceText, safeSourceRight, sourceLineFits } = await import("../src/lib/pdf-text-safety");
const { replaceAt, baseStyle, getRuns } = await import("../src/lib/pdf-runs");
const glyphs = Array.from("hello world", text => ({text,width:1}));
assert.equal(wrapPdfGlyphs(glyphs, 6).map(line => line.map(ch=>ch.text).join("")).join("/"),"hello /world");
const runSource = await Bun.file("src/lib/pdf-runs.ts").text();
assert.ok(runSource.includes("usesSource"));
assert.ok(src.includes("sourceBaselinePct: unrotatedTx[5]"));
// The original guard blocked the cursor when an embedded PDF font was missing.
assert.ok(src.includes('contentEditable\n'), "cursor must be enabled for all detected text");
assert.ok(!src.includes("contentEditable={overlay.sourceFontExact !== false}"), "unknown source fonts must not block input");
assert.ok(src.includes("await getPdfOriginalFont(overlay)"));
assert.ok(src.includes("overlay.sourceFontExact !== false && runs.length"), "unavailable embedded font must not block PDF export");
assert.ok(src.includes("firstBaseline - lineNo * lineAdvance"));
assert.ok(!src.includes("boxHeight - maxSize * 0.8 - lineNo"));
assert.ok(src.includes("fontSize: height / (viewport.scale || 1)"), "PDF text size is never rounded");
assert.ok(!src.includes("Math.max((overlay.fontSize ?? DEFAULT_PDF_FONT_SIZE) * viewScale, 6)"), "zoom does not alter font size");
assert.ok(!runSource.includes("Math.max(run.fontSize * viewScale, 6)"), "runs keep exact font size");
assert.ok(src.includes("const word = line.slice(i, j).map(item => item.text).join"), "group characters when exporting");
const sourceStyle = baseStyle(text);
assert.equal(replaceAt(getRuns(text), 3, 3, "\n", sourceStyle).map(r=>r.text).join(""), "Ori\nginal");
assert.equal(replaceAt(getRuns(text), 1, 4, "X", sourceStyle).map(r=>r.text).join(""), "OXinal");
const alpha = Array.from("AB CD", text=>({text,width:1}));
assert.equal(wrapPdfGlyphs(alpha, 3).flat().map(c=>c.text).join(""), "AB CD", "wrapping never drops spaces");
assert.deepEqual(wrapPdfGlyphs([{text:"a",width:1},{text:"b",width:1}], 1).map(line=>line.map(g=>g.text).join("")), ["a","b"]);
assert.throws(()=>wrapPdfGlyphs([{text:"W",width:5}], 1), /символ/);
const fakeKern = (a:{text:string;width:number}[]) => a.map(g=>g.text).join("")==="AV" ? 1.4 : a.length;
assert.equal(wrapPdfGlyphs([{text:"A",width:1},{text:"V",width:1}],1.5,fakeKern).length,1);
assert.ok(src.includes("const lines = wrapPdfGlyphs(glyphs, maxWidth, measureLine)"));
assert.ok(src.includes("if (draftOverlayRef.current && editingId) commitEditing()"));
assert.ok(src.includes('const inserted = newline ? "\\n" : event.data!'));
assert.ok(src.includes("const cancelEditing = useCallback"));

// Shared font catalog and privacy-navigation regressions.
const { APP_FONTS, FONT_BY_NAME, fontNameFromCss } = await import("../src/lib/app-fonts");
const { PDF_FONTS, fontCss } = await import("../src/lib/pdf-fonts");
assert.equal(APP_FONTS.length, 48);
assert.equal(new Set(APP_FONTS.map(font=>font.name)).size, APP_FONTS.length);
assert.deepEqual(PDF_FONTS.map(font=>font.name), APP_FONTS.map(font=>font.name));
for (const font of APP_FONTS) {
  assert.equal(fontCss(font.name), font.css);
  // Compatibility aliases (Impact/Oswald etc.) can share the same local font
  // and CSS stack. The CSS alone cannot identify which menu label was chosen.
  const resolved = fontNameFromCss(font.css);
  assert.ok(APP_FONTS.some(candidate => candidate.name === resolved && candidate.css === font.css),
    `Unrecognized shared font CSS: ${font.name}`);
  assert.ok(font.css.length > 5 && font.actual);
}
const noteEditorSource = await Bun.file("src/routes/editor.$id.tsx").text();
const appCss = await Bun.file("src/styles.css").text();
const appPackage = await Bun.file("package.json").json();
const settingsSource = await Bun.file("src/routes/settings.tsx").text();
assert.ok(noteEditorSource.includes("APP_FONTS.map"), "notes use the exact PDF font catalog");
assert.ok(settingsSource.includes("}}>Перейти</Btn>"), "short privacy action label");
assert.ok(!settingsSource.includes("}}>Перейти на сайт</Btn>"));
for (const slug of new Set(APP_FONTS.map(font=>font.slug))) {
  assert.ok(appPackage.dependencies[`@fontsource/${slug}`], `Missing offline font dependency: ${slug}`);
  assert.ok(appCss.includes(`@import "@fontsource/${slug}/400.css";`), `Missing offline font CSS: ${slug}`);
}

// Regression: removing the ruler must remove its UI, positioning and persistence.
assert.equal(displayPdfFontSize(11.0000000001),11);
assert.equal(displayPdfFontSize(11.999999),12);
assert.ok(!src.includes("PdfMarginRuler"));
assert.ok(!src.includes("margins.right"));
assert.ok(!src.includes("rulerLeftPct"));
assert.ok(!src.includes("setMargins"));
assert.ok(src.includes("sourceEditFits"));
assert.ok(src.includes("if (overlay.cover && lines.length > 1)"));
assert.ok(src.includes("const latestOverlays=getNote(id)?.pdf?.overlays"));
assert.ok(src.includes("sameSourceText(item,sourceBox,page)"));
assert.ok(!src.includes("Исходный PDF-шрифт недоступен. Выберите замену в панели перед вводом."));
assert.equal(sourceLineFits("hello",40,s=>s.length*5),true);
assert.equal(sourceLineFits("hello world",40,s=>s.length*5),false);
assert.equal(sourceLineFits("hello\\nworld",100,s=>s.length*5),false);
const sourceRect={x:12,y:22,width:40,height:2};
assert.equal(safeSourceRight(sourceRect,[sourceRect,{x:73,y:22,width:10,height:2}]),72.7);
assert.equal(safeSourceRight(sourceRect,[sourceRect,{x:73,y:50,width:10,height:2}]),98);
assert.ok(sameSourceText({page:1,cover:true,xPct:12,yPct:22,widthPct:40,heightPct:2,
  eraseXPct:12,eraseYPct:22,eraseWidthPct:40,eraseHeightPct:2},sourceRect,1));
assert.ok(!sameSourceText({page:2,cover:true,xPct:12,yPct:22,widthPct:40,heightPct:2},sourceRect,1));
console.log("PDF tap no-op, 4 rotations, rotated text hitboxes and page-switch cleanup: PASS");
