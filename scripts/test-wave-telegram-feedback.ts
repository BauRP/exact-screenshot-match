import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {validateFeedback,feedbackFailureMessage,saveFeedbackDraft,loadFeedbackDraft,clearFeedbackDraft} from "../src/lib/feedback-client";

const memory=new Map<string,string>();
(globalThis as any).localStorage={
 getItem:(k:string)=>memory.get(k)??null,
 setItem:(k:string,v:string)=>{memory.set(k,v);},
 removeItem:(k:string)=>{memory.delete(k);}
};
assert.equal(validateFeedback("Пожелание","Здравствуйте! Қазақша 🇰🇿"),null);
assert.equal(validateFeedback("Feedback","Emoji 🤖 ✅ <&>"),null);
assert.ok(validateFeedback("","hello"));
assert.ok(validateFeedback("Topic",""));
assert.ok(validateFeedback("x".repeat(201),"hello"));
assert.ok(validateFeedback("Topic","x".repeat(3001)));
assert.equal(validateFeedback("Topic","x".repeat(3000)),null);
saveFeedbackDraft("Тема","Сообщение 🎉");
assert.deepEqual(loadFeedbackDraft(),{topic:"Тема",text:"Сообщение 🎉"});
clearFeedbackDraft();
assert.deepEqual(loadFeedbackDraft(),{topic:"",text:""});
assert.match(feedbackFailureMessage({ok:false,kind:"offline"}),/интернет/i);
assert.match(feedbackFailureMessage({ok:false,kind:"rate_limit",retryAfter:19}),/19/);
assert.match(feedbackFailureMessage({ok:false,kind:"timeout",uncertain:true}),/могло прийти/i);

const java=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/TelegramFeedbackPlugin.java","utf8");
const settings=readFileSync("src/routes/settings.tsx","utf8");
const gradle=readFileSync("android-overlay/app/build.gradle","utf8");
const main=readFileSync("android-overlay/app/src/main/java/app/lovable/supernotes/MainActivity.java","utf8");
const workflow=readFileSync(".github/workflows/android-build.yml","utf8");
for(const marker of ["HttpsURLConnection","setRequestMethod(\"POST\")","getOutputStream()",
 "getResponseCode()","optBoolean(\"ok\", false)","optLong(\"id\", 0) == GROUP_ID",
 "messageId > 0","READ_TIMEOUT_MS","CONNECT_TIMEOUT_MS","retry_after","UnknownHostException",
 "SocketTimeoutException","new Thread(","BuildConfig.WAVE_FEEDBACK_BOT_TOKEN"]){
 assert.ok(java.includes(marker),marker);
}
assert.ok(main.includes("registerPlugin(TelegramFeedbackPlugin.class)"));
assert.ok(gradle.includes('System.getenv("WAVE_FEEDBACK_BOT_TOKEN")'));
assert.ok(gradle.includes('System.getenv("WAVE_FEEDBACK_RELAY_URL")'));
assert.ok(java.includes("deliverViaRelay("));
assert.ok(java.includes('BuildConfig.WAVE_FEEDBACK_RELAY_URL'));
assert.ok(java.includes('"/feedback".equals(uri.getPath())'));
assert.ok(workflow.includes("vars.WAVE_FEEDBACK_RELAY_URL"));
assert.ok(workflow.includes("retention-days: 1"));
assert.ok(workflow.includes("github.event_name == 'workflow_dispatch' && inputs.feedback_telegram_test"));
assert.ok(workflow.includes("!(github.event_name == 'workflow_dispatch' && inputs.feedback_telegram_test)"));
assert.ok(settings.includes("saveFeedbackDraft(fbTopic,fbText)"));
assert.ok(settings.includes("clearFeedbackDraft()"));
assert.ok(settings.includes("Ваше сообщение будет отправлено разработчику"));
assert.ok(!settings.includes("FeedbackEmail\""),"Feedback must not fall back to email in Android");
assert.ok(!/\b\d{8,11}:[A-Za-z0-9_-]{25,}/.test(java),"No Telegram credentials may be checked in");
console.log("Telegram feedback controls, drafts, network error handling and secret isolation checked");
