/**
 * Every string the customer can see, in both languages.
 *
 * Kept as one flat table rather than a library: the page is small enough that
 * the whole vocabulary fits on a screen, and a missing key becomes a type
 * error instead of an English word appearing in the middle of Amharic.
 */

export type Lang = "en" | "am";

/** Values are either a fixed string or one built from the page's own state. */
type Dict = {
  [K in keyof typeof en]: (typeof en)[K];
};

const en = {
  langName: "አማርኛ",
  back: "Back to merchant store",

  tabDeposit: "Deposit",
  tabWithdraw: "Cash out",

  methodDeposit: "Telebirr P2P",
  methodWithdraw: "Telebirr cash-out",
  methodRegion: "Ethiopia · ETB",
  currency: "ETB",
  amountPlaceholder: "—",
  timeLeft: "Time left",
  waitingLabel: "Checking",

  // Deposit steps
  stepPayTitle: (amount: string) => `Step 1: Send ${amount} to this Telebirr number`,
  stepPayTitleNoAmount: "Step 1: Send your money to this Telebirr number",
  stepRefTitle: "Step 2: Enter your reference number",
  stepRefNote:
    "After completing the transfer, paste the reference number from your Telebirr SMS — we send it straight to the agent to confirm.",
  howToPay: "How to pay?",
  howItWorks: "How it works?",

  agentLabel: "Choose an agent",
  agentHintNone: "No agents are available right now. Please try again shortly.",
  mobileNumber: "Mobile number",
  copy: "Copy",
  copied: "Copied",
  pickAgentFirst: "Pick an agent above to see the number to pay.",

  recipe: ["Open Telebirr", "Send Money to Individual", "Paste the number", "Transfer"],

  referenceLabel: "Reference number",
  referencePlaceholder: "e.g. TB100002",
  paste: "Paste",
  optionalAmountLabel: "Amount you sent (optional)",
  optionalAmountHint:
    "Only used to show the amount above. The agent confirms the real figure from Telebirr.",

  // Withdraw
  stepWhoTitle: "Step 1: Where should the agent send the cash?",
  stepAmountTitle: "Step 2: How much do you want?",
  phoneLabel: "Your phone number",
  phonePlaceholder: "0912345678",
  phoneHint: "The Telebirr number the agent should send to.",
  amountLabel: "Amount",
  amountPlaceholderField: "0.00",
  amountHint: "How much you want to take out in cash, in Birr.",

  // Buttons
  confirmPayment: "Confirm Payment",
  requestCashOut: "Request cash-out",
  sending: "Sending…",
  checking: "Checking Telebirr…",

  trustEncrypted: "Encrypted end-to-end",
  trustVerified: "Verified agent",
  trustAuto: "Confirmed in under a minute",

  // Side panel
  asideTitleDeposit: "How to make a deposit",
  asideTitleWithdraw: "How a cash-out works",
  asideTag: "Walkthrough",
  phoneAppTitle: "Deposit methods",
  phoneTabDeposit: "Deposit",
  phoneTabWithdraw: "Withdraw",
  phoneTabHistory: "History",
  phoneRowMethod: "Telebirr",
  phoneRowAgent: "Agent number",
  phoneCta: "Send",

  walkDeposit: [
    "Copy the agent's Telebirr number from the payment form.",
    "In the Telebirr app, choose Send Money to Individual and paste the number.",
    "Enter the amount and complete the transfer.",
    "Copy the reference number from the confirmation SMS.",
    "Paste it here and press Confirm Payment.",
  ],
  walkWithdraw: [
    "Pick the agent you are standing with.",
    "Enter your own Telebirr number — the cash-out is sent there.",
    "Enter the amount you want in cash.",
    "Press Request cash-out; the agent gets it on their phone.",
    "Collect your cash once the agent confirms.",
  ],
  asideFoot:
    "Your money is never held by us. The agent confirms every transfer directly in Telebirr.",

  // Messages
  errOffline: (who: string, reference: string) =>
    `${who} is offline right now, so nobody can check reference ${reference}. Try again shortly.`,
  errOfflineGeneric: (who: string, what: string) =>
    `${who} is offline right now, so they did not get ${what}. Try again shortly.`,
  sentChecking: (who: string, reference: string) =>
    `Sent to ${who}. Checking Telebirr for ${reference} — this takes up to a minute.`,
  noAnswer: (who: string, reference: string) =>
    `${who} did not answer in time. Your money is not lost — try checking ${reference} again in a moment.`,
  confirmed: (who: string, reference: string, amount: string) =>
    `Deposited successfully. ${who} confirmed ${reference} for ${amount} Birr.`,
  notFound: (who: string, reference: string) =>
    `${who} has no record of a payment with reference ${reference}. Check the number on your receipt.`,
  readFailed: (who: string, reason: string) =>
    `${who} could not check Telebirr just now (${reason}). Try again shortly.`,
  cashOutSent: (who: string, amount: string, phone: string) =>
    `Cash-out of ${amount} Birr to ${phone} sent to ${who}. They will confirm it on their side.`,
  loadingAgents: "Loading agents…",
};

const am: Dict = {
  langName: "English",
  back: "ወደ ሱቁ ተመለስ",

  tabDeposit: "ገንዘብ ማስገባት",
  tabWithdraw: "ገንዘብ ማውጣት",

  methodDeposit: "ቴሌብር P2P",
  methodWithdraw: "ቴሌብር ወጪ",
  methodRegion: "ኢትዮጵያ · ብር",
  currency: "ብር",
  amountPlaceholder: "—",
  timeLeft: "የቀረው ጊዜ",
  waitingLabel: "በመፈተሽ ላይ",

  stepPayTitle: (amount: string) => `ደረጃ 1፦ ${amount} ወደዚህ የቴሌብር ቁጥር ይላኩ`,
  stepPayTitleNoAmount: "ደረጃ 1፦ ገንዘብዎን ወደዚህ የቴሌብር ቁጥር ይላኩ",
  stepRefTitle: "ደረጃ 2፦ የደረሰኝ ቁጥርዎን ያስገቡ",
  stepRefNote:
    "ዝውውሩን ከጨረሱ በኋላ ከቴሌብር መልእክት የደረሰኝ ቁጥሩን ይለጥፉ — በቀጥታ ወደ ወኪሉ ልከን እናረጋግጣለን።",
  howToPay: "እንዴት ይከፈላል?",
  howItWorks: "እንዴት ይሰራል?",

  agentLabel: "ወኪል ይምረጡ",
  agentHintNone: "አሁን የሚገኝ ወኪል የለም። እባክዎ ትንሽ ቆይተው ይሞክሩ።",
  mobileNumber: "የሞባይል ቁጥር",
  copy: "ቅዳ",
  copied: "ተቀድቷል",
  pickAgentFirst: "የሚከፈልበትን ቁጥር ለማየት ከላይ ወኪል ይምረጡ።",

  recipe: ["ቴሌብርን ይክፈቱ", "ለግለሰብ ገንዘብ ላክ", "ቁጥሩን ይለጥፉ", "ያስተላልፉ"],

  referenceLabel: "የደረሰኝ ቁጥር",
  referencePlaceholder: "ለምሳሌ TB100002",
  paste: "ለጥፍ",
  optionalAmountLabel: "የላኩት መጠን (አማራጭ)",
  optionalAmountHint: "ከላይ ያለውን መጠን ለማሳየት ብቻ ነው። ወኪሉ ትክክለኛውን ከቴሌብር ያረጋግጣል።",

  stepWhoTitle: "ደረጃ 1፦ ወኪሉ ገንዘቡን ወዴት ይላክ?",
  stepAmountTitle: "ደረጃ 2፦ ምን ያህል ይፈልጋሉ?",
  phoneLabel: "የእርስዎ ስልክ ቁጥር",
  phonePlaceholder: "0912345678",
  phoneHint: "ወኪሉ የሚልክበት የቴሌብር ቁጥር።",
  amountLabel: "መጠን",
  amountPlaceholderField: "0.00",
  amountHint: "በጥሬ ገንዘብ ማውጣት የሚፈልጉት መጠን በብር።",

  confirmPayment: "ክፍያውን አረጋግጥ",
  requestCashOut: "ወጪ ጠይቅ",
  sending: "በመላክ ላይ…",
  checking: "ቴሌብርን በመፈተሽ ላይ…",

  trustEncrypted: "ከጫፍ እስከ ጫፍ የተመሰጠረ",
  trustVerified: "የተረጋገጠ ወኪል",
  trustAuto: "ከአንድ ደቂቃ በታች ይረጋገጣል",

  asideTitleDeposit: "ገንዘብ እንዴት ማስገባት ይቻላል",
  asideTitleWithdraw: "ወጪ እንዴት ይሰራል",
  asideTag: "መመሪያ",
  phoneAppTitle: "የማስገቢያ መንገዶች",
  phoneTabDeposit: "ማስገባት",
  phoneTabWithdraw: "ማውጣት",
  phoneTabHistory: "ታሪክ",
  phoneRowMethod: "ቴሌብር",
  phoneRowAgent: "የወኪል ቁጥር",
  phoneCta: "ላክ",

  walkDeposit: [
    "በክፍያ ቅጹ ላይ የሚታየውን የወኪሉን የቴሌብር ቁጥር ይቅዱ።",
    "በቴሌብር መተግበሪያ ውስጥ «ለግለሰብ ገንዘብ ላክ» ይምረጡና ቁጥሩን ይለጥፉ።",
    "መጠኑን አስገብተው ዝውውሩን ይጨርሱ።",
    "ከማረጋገጫ መልእክቱ የደረሰኝ ቁጥሩን ይቅዱ።",
    "እዚህ ለጥፈው «ክፍያውን አረጋግጥ» ይጫኑ።",
  ],
  walkWithdraw: [
    "አብረውት ያሉትን ወኪል ይምረጡ።",
    "የራስዎን የቴሌብር ቁጥር ያስገቡ — ወጪው ወደዚያ ይላካል።",
    "በጥሬ ገንዘብ የሚፈልጉትን መጠን ያስገቡ።",
    "«ወጪ ጠይቅ» ይጫኑ፤ ወኪሉ በስልኩ ይደርሰዋል።",
    "ወኪሉ ካረጋገጠ በኋላ ገንዘብዎን ይውሰዱ።",
  ],
  asideFoot: "ገንዘብዎ በእኛ እጅ አይቆይም። ወኪሉ እያንዳንዱን ዝውውር በቀጥታ በቴሌብር ያረጋግጣል።",

  errOffline: (who, reference) =>
    `${who} አሁን ከመስመር ውጭ ነው፤ ስለዚህ የደረሰኝ ቁጥር ${reference} ማረጋገጥ አልተቻለም። ትንሽ ቆይተው ይሞክሩ።`,
  errOfflineGeneric: (who, what) =>
    `${who} አሁን ከመስመር ውጭ ነው፤ ስለዚህ ${what} አልደረሰውም። ትንሽ ቆይተው ይሞክሩ።`,
  sentChecking: (who, reference) =>
    `ወደ ${who} ተልኳል። ${reference} በቴሌብር በመፈተሽ ላይ — እስከ አንድ ደቂቃ ይወስዳል።`,
  noAnswer: (who, reference) =>
    `${who} በጊዜው አልመለሰም። ገንዘብዎ አልጠፋም — ${reference} ን እንደገና ይሞክሩ።`,
  confirmed: (who, reference, amount) =>
    `በተሳካ ሁኔታ ገብቷል። ${who} ${reference} ን በ${amount} ብር አረጋግጧል።`,
  notFound: (who, reference) =>
    `${who} በደረሰኝ ቁጥር ${reference} የተደረገ ክፍያ የለውም። በደረሰኝዎ ላይ ያለውን ቁጥር ያረጋግጡ።`,
  readFailed: (who, reason) => `${who} አሁን ቴሌብርን ማረጋገጥ አልቻለም (${reason})። ትንሽ ቆይተው ይሞክሩ።`,
  cashOutSent: (who, amount, phone) =>
    `የ${amount} ብር ወጪ ወደ ${phone} ለ${who} ተልኳል። በራሳቸው በኩል ያረጋግጣሉ።`,
  loadingAgents: "ወኪሎችን በመጫን ላይ…",
};

export const STRINGS: Record<Lang, Dict> = { en, am };

export const other = (lang: Lang): Lang => (lang === "en" ? "am" : "en");
