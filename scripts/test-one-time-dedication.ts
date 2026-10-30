import { strict as assert } from "node:assert";
import {
  DEDICATION_FINISHED_KEY,
  dedicationWasFinished,
  recordDedicationFinished,
  shouldShowDedication,
} from "../src/components/OneTimeDedication";

const values=new Map<string,string>();
const storage={
  getItem: (key:string)=>values.get(key) ?? null,
  setItem: (key:string,value:string)=>{values.set(key,value);},
};

assert.equal(dedicationWasFinished(storage),false);
assert.equal(shouldShowDedication(false,0,false),false,"Loading never reveals personal message");
assert.equal(shouldShowDedication(true,0,false),true,"Fresh install shows once");
assert.equal(shouldShowDedication(true,1,false),false,"First saved note hides immediately");
assert.equal(shouldShowDedication(true,10,false),false,"PDF or many notes hide");
recordDedicationFinished(storage);
assert.equal(storage.getItem(DEDICATION_FINISHED_KEY),"1","Marker must be durable");
assert.equal(dedicationWasFinished(storage),true);
assert.equal(shouldShowDedication(true,0,dedicationWasFinished(storage)),false,
  "After deleting all notes dedication cannot return");
assert.equal(shouldShowDedication(true,1,dedicationWasFinished(storage)),false);
const home=await Bun.file("src/routes/index.tsx").text();
const component=await Bun.file("src/components/OneTimeDedication.tsx").text();
assert.ok(home.includes("useOneTimeDedication(\n    notes.length, hydrated && status === \"ready\""));
assert.ok(home.includes('<NativeAdCard slotKey="home-first" />\n          {activeFolder === "all" && showOneTimeDedication && <OneTimeDedication />}'));
assert.ok(component.includes("Любимой маме от сына"));
assert.ok(component.includes("Мухановой Айслу"));
assert.ok(component.indexOf("Мухановой Айслу") < component.indexOf("Любимой маме от сына"),
  "Dedicated mother name must be first and dedication phrase second");
assert.ok(component.includes("Дай пожалуйста корiмдiк"));
assert.ok(component.includes(">560</span>"));
assert.ok(component.includes(">тенге</span>"));
assert.ok(!component.includes("onClick="),"Dedication may not intercept clicks");
assert.ok(!component.includes("fetch("),"Dedication has no network effects");
assert.ok(!component.includes("updateNote("),"Dedication cannot modify notes");
console.log("Temporary mom dedication: first-launch, saved note/PDF, permanent dismissal, safe home placement: PASS");
