/** Brand-approved yellow paper for NEW notes only. Legacy notes stay untouched. */
export const NEW_NOTE_YELLOW="#FDE68A";
export const NEW_NOTE_INK="#18181B";
export function editorBackground(isNew:boolean,saved?:string){
 return saved??(isNew?NEW_NOTE_YELLOW:"#000000");
}
export function editorInk(isNew:boolean,saved?:string){
 return saved??(isNew?NEW_NOTE_INK:"#FFFFFF");
}
