// Monthly API pricing snapshot. Keep endpoint pricing separate from Realtime and UI pricing.
export const PRICING_CHECKED = '2026-09-27';
export const PRICING_SOURCES = {
  api: 'https://elevenlabs.io/pricing/api',
  account: 'https://elevenlabs.io/app/subscription/api',
  stems: 'https://elevenlabs.io/blog/eleven-music-new-tools-for-exploring-editing-and-producing-music-with-ai',
};
export const PLANS = [
  {id:'free',label:'Free / Pay as you go',hours:4.5},
  {id:'starter',label:'Starter',hours:27},
  {id:'creator',label:'Creator',hours:100},
  {id:'pro',label:'Pro',hours:450},
  {id:'scale',label:'Scale',hours:1359},
  {id:'business',label:'Business',hours:4500},
  {id:'enterprise',label:'Enterprise',hours:null},
  {id:'custom',label:'Other / custom',hours:null},
];
const validNumber = value => typeof value==='number' && Number.isFinite(value) && value>=0;
const optionalNumber = value => validNumber(value)?value:null;

export function pricingSettings(settings={}) {
  const plan=PLANS.find(p=>p.id===settings.subscriptionTier)||PLANS.find(p=>p.id==='creator');
  const manualPlan=plan.hours===null;
  // Retain existing manually entered rates when upgrading older installations.
  const legacyRates=validNumber(settings.transcribeRate)||validNumber(settings.separateRate);
  const pricingMode=manualPlan?'custom':settings.pricingMode==='plan'?'plan':settings.pricingMode==='custom'||legacyRates?'custom':'plan';
  return {
    subscriptionTier:plan.id,pricingMode,
    transcribeRate:pricingMode==='plan'?.22/60:optionalNumber(settings.transcribeRate),
    // Provisional: published 0.5x two-stem multiplier x $0.15/min Music generation.
    separateRate:pricingMode==='plan'?.075:optionalNumber(settings.separateRate),
    soundEffectRate:pricingMode==='plan'?.12:optionalNumber(settings.soundEffectRate),
    transcribeIncludedHours:pricingMode==='plan'?plan.hours:optionalNumber(settings.transcribeIncludedHours),
  };
}

export function validatePricing(value) {
  if(!PLANS.some(p=>p.id===value.subscriptionTier))throw new Error('Choose a subscription tier.');
  if(!['plan','custom'].includes(value.pricingMode))throw new Error('Choose published or custom rates.');
  for(const key of ['transcribeRate','separateRate','soundEffectRate','transcribeIncludedHours']) {
    if(value[key]!=null&&!validNumber(value[key]))throw new Error('Rates and included hours must be non-negative numbers or blank.');
  }
  return pricingSettings(value);
}

export function estimateUsage(settings,kind,seconds) {
  const pricing=pricingSettings(settings),rate=pricing[kind==='transcribe'?'transcribeRate':kind==='sound-effect'?'soundEffectRate':'separateRate'];
  if(!['transcribe','separate','sound-effect'].includes(kind)||!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid operation or audio duration.');
  return {
    estimatedUsd:rate===null?null:seconds/60*rate,
    rateUsdPerMinute:rate,
    pricingTier:pricing.subscriptionTier,
    pricingMode:pricing.pricingMode,
    pricingBasis:rate===null?'unknown':pricing.pricingMode==='custom'?'custom rate':kind==='separate'?'derived two-stem rate':kind==='sound-effect'?'published sound-effects rate':'published Scribe v2 rate',
    pricingCheckedAt:pricing.pricingMode==='plan'?PRICING_CHECKED:null,
  };
}
