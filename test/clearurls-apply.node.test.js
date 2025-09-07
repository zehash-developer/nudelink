import { applyClearUrls } from "../clearurls-apply.js";

// Use node-fetch if running on Node <18
// import fetch from "node-fetch";

const RULES_URL = "https://rules2.clearurls.xyz/data.minify.json";

async function fetchRulesJson() {
  const res = await fetch(RULES_URL);
  if (!res.ok) throw new Error("Failed to fetch ClearURLs rules");
  return await res.json();
}

const testCases = [
  {
    input:
      "https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale&gclid=123abc&fbclid=456def&gad_source=1&gad_campaignid=999999&gbraid=0AAAAA-xyz&affid=affiliate123&ref=referral456&mc_cid=mailchimp789&mc_eid=emailid101112&custom_param=value&another_param=foo#utm_content=ad_banner&utm_term=shoes",
    description:
      "Many tracking params, should keep only custom_param and another_param",
  },
  {
    input:
      "https://pdfe.com/?gad_source=1&gad_campaignid=22618564445&gbraid=0AAAAA-on6G9nd0c-41iI893kCR9mlknUf&gclid=CjwKCAjwlOrFBhBaEiwAw4bYDesHFC9s2JgzYCGAzGJE9lk6OZD-e_SphLGrog4vPSTuksugcZNuSBoCA1AQAvD_BwE",
    description: "PDFE test, should remove all tracking params",
  },
  {
    input:
      "https://www.signnow.com/functionality/117-new-edit-modify-revise-rearrange-pdf-word-powerpoint-notepad-document-form-application-file-format-online-fax-sign-send-email-deliver-store-share-collaborate?sst_src=google&sst_mdm=cpc&sst_cmpgn=17746193711&sst_trm=free%20online%20document%20sign&sst_cntnt=|cmpgn:17746193711|grp:143616206876|crtv:639886220772|trgt:kwd-358264924311|mt:b|clck_dntfr:CjwKCAjwlOrFBhBaEiwAw4bYDeW9AvwpEzXxuAMWg8mm9n9ocjN46QHJcFlQAwSCNR0tUvYZrKIGrBoCAyYQAvD_BwE|&gad_source=1&gad_campaignid=17746193711&gbraid=0AAAAADn5P_TuJuZ7n-Xv7LHqe9SZO9It9&gclid=CjwKCAjwlOrFBhBaEiwAw4bYDeW9AvwpEzXxuAMWg8mm9n9ocjN46QHJcFlQAwSCNR0tUvYZrKIGrBoCAyYQAvD_BwE",
    description: "SignNow test, should remove all tracking params",
  },
];

(async () => {
  const rulesJson = await fetchRulesJson();
  for (const { input, description } of testCases) {
    const result = applyClearUrls(input, rulesJson);
    console.log("Test:", description);
    console.log("Original:", input);
    console.log("Cleaned: ", result.url);
    console.log("Changed: ", result.changed);
    console.log("---");
  }
})();
