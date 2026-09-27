import React from 'react';
import {PLANS,PRICING_CHECKED,pricingSettings} from '../shared/pricing.mjs';

export default function PricingFields({form,setForm}) {
  const resolved=pricingSettings(form),custom=resolved.pricingMode==='custom',manualPlan=['enterprise','custom'].includes(resolved.subscriptionTier);
  // Keep invalid numeric edits visible so they can be corrected after validation.
  const pricing=custom?{...resolved,transcribeRate:form.transcribeRate??null,separateRate:form.separateRate??null,transcribeIncludedHours:form.transcribeIncludedHours??null}:resolved;
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  const open=source=>window.creator.openPricing(source).catch(()=>{});
  return <section className="pricing-fields" aria-label="ElevenLabs cost estimates">
    <h3>Cost estimates</h3>
    <label className="field"><span>Subscription tier</span><select value={pricing.subscriptionTier} onChange={e=>{
      const subscriptionTier=e.target.value,pricingMode=['enterprise','custom'].includes(subscriptionTier)?'custom':'plan';
      setForm(f=>({...f,...pricingSettings({subscriptionTier,pricingMode,transcribeRate:null,separateRate:null,transcribeIncludedHours:null})}));
    }}>{PLANS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <p className="muted small">Captions use <strong>Scribe v2 for uploaded audio</strong>. Scribe v2 Realtime has separate pricing.</p>
    <label className="checkbox"><input type="checkbox" checked={custom} disabled={manualPlan} onChange={e=>setForm(f=>({...f,...pricing,pricingMode:e.target.checked?'custom':'plan'}))}/> Use custom rates</label>
    <div className="two-cols">
      <label className="field"><span>Scribe v2 · USD / hour</span><input aria-label="Scribe v2 USD per hour" type="number" min="0" step="any" placeholder="Unknown" disabled={!custom} value={pricing.transcribeRate===null?'':Number((pricing.transcribeRate*60).toPrecision(12))} onChange={e=>set('transcribeRate',e.target.value===''?null:Number(e.target.value)/60)}/></label>
      <label className="field"><span>Two stems · USD / minute</span><input aria-label="Two stems USD per minute" type="number" min="0" step="any" placeholder="Unknown" disabled={!custom} value={pricing.separateRate??''} onChange={e=>set('separateRate',e.target.value===''?null:Number(e.target.value))}/></label>
    </div>
    <label className="field"><span>Scribe v2 · included hours / month</span><input aria-label="Scribe v2 included hours per month" type="number" min="0" step="any" placeholder="Unknown" disabled={!custom} value={pricing.transcribeIncludedHours??''} onChange={e=>set('transcribeIncludedHours',e.target.value===''?null:Number(e.target.value))}/></label>
    {!custom&&<p className="muted small">Two-stem pricing is provisional: 0.5 × the published $0.15/min Music rate = $0.075/min. Confirm it against your account.</p>}
    <p className="muted small">Estimates value the audio before allowances and taxes. Included hours are a plan reference, not your remaining balance. Use custom rates if your account differs; blank means unknown.</p>
    <div className="pricing-links"><button className="text-button" onClick={()=>open('api')}>Public API pricing ↗</button><button className="text-button" onClick={()=>open('stems')}>Two-stem source ↗</button><button className="text-button" onClick={()=>open('account')}>Your subscription ↗</button></div>
    <p className="muted small">Monthly pricing checked {PRICING_CHECKED}. Presets do not refresh automatically.</p>
  </section>;
}
