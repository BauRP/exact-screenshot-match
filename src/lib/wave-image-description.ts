/** Note-photo descriptions are stored in the image node, never as a
 * separate blob. Bounded visible text is safe for offline HTML exports,
 * screen readers and all previously saved images with missing descriptions. */
export const MAX_WAVE_IMAGE_DESCRIPTION=160;
export function safeImageDescription(input:unknown):string{
 if(typeof input!=="string")return "";
 return input.replace(/[\u0000-\u001f\u007f-\u009f]+/g," ")
   .replace(/\s+/gu," ").trim().slice(0,MAX_WAVE_IMAGE_DESCRIPTION).trim();
}
