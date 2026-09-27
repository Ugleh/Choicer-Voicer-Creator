import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLANS,pricingSettings,estimateUsage,validatePricing} from '../shared/pricing.mjs';

test('Creator estimates uploaded Scribe v2 audio in hours, without subtracting a plan allowance',()=>{
  const pricing=pricingSettings({});assert.equal(pricing.subscriptionTier,'creator');assert.equal(pricing.transcribeIncludedHours,100);
  assert.equal(estimateUsage(pricing,'transcribe',3600).estimatedUsd,.22);
  assert.equal(estimateUsage(pricing,'separate',120).estimatedUsd,.15);
  assert.equal(estimateUsage(pricing,'separate',120).pricingBasis,'derived two-stem rate');
  for(const plan of PLANS.filter(p=>p.hours!==null)){
    const selected=pricingSettings({subscriptionTier:plan.id,pricingMode:'plan'});
    assert.equal(selected.transcribeIncludedHours,plan.hours);
    assert.equal(estimateUsage(selected,'transcribe',3600).estimatedUsd,.22);
  }
});
test('old manual rates, zero, and unknown pricing survive migration',()=>{
  const old={transcribeRate:.01,separateRate:null};
  assert.equal(pricingSettings(old).pricingMode,'custom');
  assert.equal(estimateUsage(old,'transcribe',90).estimatedUsd,.015);
  assert.equal(estimateUsage(old,'separate',90).estimatedUsd,null);
  assert.equal(pricingSettings({transcribeRate:0}).transcribeRate,0);
  assert.equal(pricingSettings({subscriptionTier:'enterprise'}).transcribeRate,null);
  assert.equal(estimateUsage({subscriptionTier:'custom',transcribeRate:null},'transcribe',90).pricingBasis,'unknown');
  assert.deepEqual(old,{transcribeRate:.01,separateRate:null});
});
test('custom account values and historical estimates are independent of future plan changes',()=>{
  const custom=validatePricing({subscriptionTier:'creator',pricingMode:'custom',transcribeRate:.46/60,separateRate:.125,transcribeIncludedHours:48});
  const quote=estimateUsage(custom,'transcribe',3600);assert.equal(quote.estimatedUsd,.46);assert.equal(quote.pricingBasis,'custom rate');assert.equal(quote.pricingCheckedAt,null);
  const changed=validatePricing({...custom,subscriptionTier:'pro',pricingMode:'plan'});
  assert.equal(changed.transcribeIncludedHours,450);assert.equal(quote.estimatedUsd,.46);
  for(const invalid of [-1,NaN,Infinity,'0.22'])assert.throws(()=>validatePricing({...custom,transcribeRate:invalid}),/non-negative/);
  assert.throws(()=>validatePricing({...custom,subscriptionTier:'fake'}),/subscription tier/);
  assert.throws(()=>estimateUsage(custom,'unknown',10),/Invalid/);
  assert.throws(()=>estimateUsage(custom,'transcribe',NaN),/Invalid/);
});
