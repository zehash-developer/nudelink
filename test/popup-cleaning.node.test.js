import { applyClearUrls } from "../clearurls-apply.js";

const RULES_URL = "https://rules2.clearurls.xyz/data.minify.json";

async function fetchRulesJson() {
  const res = await fetch(RULES_URL);
  if (!res.ok) throw new Error("Failed to fetch ClearURLs rules");
  return await res.json();
}

const testUrl =
  "https://pdfe.com/?gad_source=1&gad_campaignid=22618564445&gbraid=0AAAAA-on6G9nd0c-41iI893kCR9mlknUf&gclid=CjwKCAjwlOrFBhBaEiwAw4bYDesHFC9s2JgzYCGAzGJE9lk6OZD-e_SphLGrog4vPSTuksugcZNuSBoCA1AQAvD_BwE";

(async () => {
  const rulesJson = await fetchRulesJson();
  console.log("testUrl:", testUrl);
  const result = applyClearUrls(testUrl, rulesJson);

  console.log("Cleaned URL:", result.url);
  console.log("✅ Popup cleaning test complete!");
})();
