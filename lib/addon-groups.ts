import type {PricingConfig,Service} from './pricing';
const groups = [
  {name:'Everyday Help',description:'A little help with the chores that keep coming back.',ids:['dishes','laundry','fold','put_away','linens']},
  {name:'Kitchen Extras',description:'Extra care inside the places you use every day.',ids:['oven','fridge','cabinets']},
  {name:'Detail Extras',description:'The finishing touches for your home.',ids:['windows','pet_hair']},
];
export function groupAddons(addons:PricingConfig['addons'],service:Service){
  const visible=addons.filter(a=>a.enabled&&!(service==='move'&&a.id==='cabinets'));
  const known=new Set(groups.flatMap(g=>g.ids));
  return groups.map(g=>({...g,addons:visible.filter(a=>g.ids.includes(a.id)||(g.name==='Detail Extras'&&!known.has(a.id)))})).filter(g=>g.addons.length);
}
